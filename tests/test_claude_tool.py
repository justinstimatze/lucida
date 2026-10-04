"""Tests for tools/claude_tool.create_tool_call.

Runs the real anthropic SDK against a local stub server so the assertions
cover what actually goes over the wire (body fields, beta header), not
just the kwargs we pass.
"""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import anthropic
import pytest

from tools.claude_tool import create_tool_call

TOOL = {
    "name": "classify_cell",
    "description": "d",
    "input_schema": {"type": "object", "properties": {"x": {"type": "string"}}},
}
SYSTEM = [{"type": "text", "text": "sys", "cache_control": {"type": "ephemeral"}}]


def _message(content, stop_reason="end_turn", model="claude-sonnet-5-5"):
    return {
        "id": "msg_1",
        "type": "message",
        "role": "assistant",
        "model": model,
        "content": content,
        "stop_reason": stop_reason,
        "stop_sequence": None,
        "usage": {"input_tokens": 1, "output_tokens": 1},
    }


TOOL_REPLY = _message(
    [
        {"type": "thinking", "thinking": "", "signature": "sig"},
        {"type": "tool_use", "id": "tu_1", "name": "classify_cell", "input": {"x": "y"}},
    ],
    stop_reason="tool_use",
)
PROSE_REPLY = _message([{"type": "text", "text": "Here is my answer in prose."}])


@pytest.fixture
def stub():
    """Local server replying with queued messages; records each request."""
    state = {"replies": [], "requests": []}

    class H(BaseHTTPRequestHandler):
        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["content-length"])))
            state["requests"].append(
                {"path": self.path, "body": body, "beta": self.headers.get("anthropic-beta")}
            )
            out = json.dumps(state["replies"].pop(0)).encode()
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(out)))
            self.end_headers()
            self.wfile.write(out)

        def log_message(self, *a):
            pass

    srv = HTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    state["client"] = anthropic.Anthropic(
        api_key="test", base_url=f"http://127.0.0.1:{srv.server_port}", max_retries=0
    )
    yield state
    srv.shutdown()


def _call(stub, model="claude-sonnet-5-5", **kw):
    return create_tool_call(
        stub["client"],
        model=model,
        system=SYSTEM,
        tool=TOOL,
        messages=[{"role": "user", "content": "snippet"}],
        **kw,
    )


def test_sonnet_5_5_request_shape(stub, monkeypatch):
    monkeypatch.delenv("LUCIDA_EFFORT", raising=False)
    stub["replies"] = [TOOL_REPLY]
    resp = _call(stub)
    [req] = stub["requests"]
    body = req["body"]
    assert "tool_choice" not in body  # forced tool use 400s on Sonnet 5.5
    assert "thinking" not in body  # adaptive by default
    assert "temperature" not in body
    assert body["output_config"] == {"effort": "low"}
    assert body["max_tokens"] == 16000
    assert body["fallbacks"] == "default"
    assert "server-side-fallback-2026-07-01" in req["beta"]
    assert [b.type for b in resp.content] == ["thinking", "tool_use"]


def test_nudges_once_when_model_answers_in_prose(stub):
    stub["replies"] = [PROSE_REPLY, TOOL_REPLY]
    resp = _call(stub)
    assert len(stub["requests"]) == 2
    msgs = stub["requests"][1]["body"]["messages"]
    # append-only: original turn untouched, prose reply echoed, nudge last
    assert msgs[0] == {"role": "user", "content": "snippet"}
    assert msgs[1]["role"] == "assistant"
    assert msgs[1]["content"][0]["text"] == "Here is my answer in prose."
    assert msgs[2] == {"role": "user", "content": "Respond by calling the `classify_cell` tool."}
    assert any(b.type == "tool_use" for b in resp.content)


def test_refusal_is_returned_not_nudged(stub):
    stub["replies"] = [_message([], stop_reason="refusal")]
    resp = _call(stub)
    assert resp.stop_reason == "refusal"
    assert len(stub["requests"]) == 1


def test_haiku_gets_no_effort_or_fallback(stub):
    stub["replies"] = [_message(TOOL_REPLY["content"][1:], "tool_use", "claude-haiku-4-5")]
    _call(stub, model="claude-haiku-4-5", effort="medium")
    [req] = stub["requests"]
    assert "output_config" not in req["body"]
    assert "fallbacks" not in req["body"]
    assert not req["beta"]


def test_effort_env_override(stub, monkeypatch):
    monkeypatch.setenv("LUCIDA_EFFORT", "high")
    stub["replies"] = [TOOL_REPLY]
    _call(stub, effort="low")
    assert stub["requests"][0]["body"]["output_config"] == {"effort": "high"}


def test_default_models_are_current():
    import classifier
    import evaluator
    import image_specialist
    import reflect
    import segmenter
    import specialists
    import text_evaluator

    for mod in (
        classifier,
        evaluator,
        image_specialist,
        reflect,
        segmenter,
        specialists,
        text_evaluator,
    ):
        assert mod.DEFAULT_MODEL == "claude-sonnet-5-5", mod.__name__


def test_breakpoint_defaults_to_1h_and_is_overridable(stub, monkeypatch):
    monkeypatch.delenv("LUCIDA_CACHE_TTL", raising=False)
    stub["replies"] = [TOOL_REPLY, TOOL_REPLY, TOOL_REPLY]
    _call(stub)
    monkeypatch.setenv("LUCIDA_CACHE_TTL", "5m")
    _call(stub)
    _call(stub, ttl="1h")  # per-stage override (the classifier's knob) wins
    ttls = [r["body"]["system"][-1]["cache_control"] for r in stub["requests"]]
    assert ttls == [
        {"type": "ephemeral", "ttl": "1h"},
        {"type": "ephemeral", "ttl": "5m"},
        {"type": "ephemeral", "ttl": "1h"},
    ]
    # the caller's system list is not mutated
    assert SYSTEM[-1]["cache_control"] == {"type": "ephemeral"}


def test_nudge_resends_identical_prefix(stub):
    """The nudge turn must reuse the first request's tools+system bytes so
    it reads the cache the first request wrote."""
    stub["replies"] = [PROSE_REPLY, TOOL_REPLY]
    _call(stub)
    a, b = (r["body"] for r in stub["requests"])
    assert a["system"] == b["system"] and a["tools"] == b["tools"]
    assert a["output_config"] == b["output_config"]
