"""Single-tool structured calls against the current Claude models.

Every lucida stage (classifier, segmenter, specialists, evaluators,
reflect) asks Claude for exactly one tool call and reads its input as
structured output. Those call sites used forced tool use
(`tool_choice: {"type": "tool"}`), which Claude Sonnet 5.5 rejects with a
400. This helper is the one place that knows the current request shape:

- tool_choice stays `auto` (the default); the system prompts already
  name the tool. If a reply comes back without the call, one nudge turn
  is appended (append-only, so preserved thinking stays valid) and the
  request re-sent.
- effort is explicit per stage (`output_config.effort`). Thinking is
  left at the model default (adaptive on Sonnet 5.5). Models that reject
  effort (Haiku 4.5, Sonnet 4.5 and older) get no effort field, so the
  LUCIDA_*_MODEL overrides still work for trials.
- On models that support it, refusals fall back server-side
  (`fallbacks: "default"`); a refusal that survives comes back with
  stop_reason "refusal" and no tool_use block, which every caller already
  reports as "no tool_use block (stop_reason=refusal)".

LUCIDA_EFFORT overrides every stage's effort (low|medium|high|xhigh|max)
for sweeps.
"""

from __future__ import annotations

import os
from typing import Any

DEFAULT_MODEL = "claude-sonnet-5-5"

# Thinking counts toward max_tokens; 16K keeps non-streaming requests well
# under the SDK's long-request timeout while leaving room for both.
MAX_TOKENS = 16000

EFFORTS = ("low", "medium", "high", "xhigh", "max")

# Models whose API rejects output_config.effort.
_NO_EFFORT_PREFIXES = (
    "claude-haiku-",
    "claude-sonnet-4-5",
    "claude-sonnet-4-0",
    "claude-sonnet-4-2",
    "claude-opus-4-1",
    "claude-opus-4-0",
    "claude-3",
)

# Models that take the server-side refusal fallback (Claude API, beta).
_FALLBACK_MODELS = ("claude-sonnet-5-5", "claude-opus-5-5", "claude-opus-5", "claude-fable-5-1")
_FALLBACK_BETA = "server-side-fallback-2026-07-01"


def _effort(model: str, effort: str) -> str | None:
    if model.startswith(_NO_EFFORT_PREFIXES):
        return None
    override = os.environ.get("LUCIDA_EFFORT", "").strip().lower()
    if override in EFFORTS:
        effort = override
    # Opus 4.5 stops at high; everything newer takes the full range.
    if model.startswith("claude-opus-4-5") and effort in ("xhigh", "max"):
        effort = "high"
    return effort


def _tool_use(response: Any, tool_name: str) -> bool:
    return any(
        getattr(b, "type", None) == "tool_use" and getattr(b, "name", None) == tool_name
        for b in response.content
    )


def create_tool_call(
    client: Any,
    *,
    model: str,
    system: list[dict],
    tool: dict,
    messages: list[dict],
    effort: str = "low",
    max_tokens: int = MAX_TOKENS,
) -> Any:
    """Send one request that should end in a call to `tool`. Returns the
    final response; callers read the tool_use block by type as before."""
    name = tool["name"]
    kwargs: dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "system": system,
        "tools": [tool],
    }
    eff = _effort(model, effort)
    if eff:
        kwargs["output_config"] = {"effort": eff}

    def send(msgs: list[dict]) -> Any:
        if model in _FALLBACK_MODELS:
            return client.beta.messages.create(
                **kwargs, messages=msgs, betas=[_FALLBACK_BETA], fallbacks="default"
            )
        return client.messages.create(**kwargs, messages=msgs)

    response = send(messages)
    if _tool_use(response, name) or response.stop_reason in ("refusal", "max_tokens"):
        return response
    # Answered in prose instead of calling the tool: append the reply and a
    # one-line nudge rather than editing history.
    nudged = [
        *messages,
        {"role": "assistant", "content": response.content},
        {"role": "user", "content": f"Respond by calling the `{name}` tool."},
    ]
    return send(nudged)


__all__ = ["DEFAULT_MODEL", "MAX_TOKENS", "create_tool_call"]
