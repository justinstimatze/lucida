"""Tests for motion_timeline.sanitize_timeline — the mint-time gate on
animated_svg declarative timelines."""

from motion_timeline import MAX_STEPS, sanitize_timeline

SVG = (
    '<svg viewBox="0 0 100 100">'
    '<path id="m-sweep" d="M0 0 L100 100"/>'
    '<path id="m-shape-b" d="M0 0 L50 50"/>'
    '<circle id="m-dot" class="m-pass big" cx="10" cy="10" r="4"/>'
    "</svg>"
)


def _one(step, svg=SVG):
    tl = sanitize_timeline({"steps": [step]}, svg)
    return None if tl is None else tl["steps"][0]


def test_defaults_and_from_step():
    tl = sanitize_timeline(
        {"steps": [{"target": "#m-dot", "op": "from", "props": {"opacity": 0}}]}, SVG
    )
    assert tl == {
        "repeat": -1,
        "repeat_delay": 1.0,
        "yoyo": False,
        "steps": [
            {
                "target": "#m-dot",
                "op": "from",
                "at": ">",
                "dur": 0.6,
                "ease": "power2.out",
                "props": {"opacity": 0.0},
            }
        ],
    }


def test_rejects_non_dict_and_empty():
    assert sanitize_timeline(None) is None
    assert sanitize_timeline("steps") is None
    assert sanitize_timeline({"steps": []}) is None
    assert sanitize_timeline({"steps": [{"target": "#m-dot", "op": "eval"}]}, SVG) is None


def test_selector_whitelist():
    for bad in ("svg circle", "#m-dot, body", "[onload]", "#m-dot:hover", "*", "m-dot"):
        assert _one({"target": bad, "op": "set", "props": {"opacity": 1}}, None) is None
    assert _one({"target": ".m-pass", "op": "set", "props": {"opacity": 1}}) is not None


def test_drops_targets_missing_from_svg():
    assert _one({"target": "#m-nope", "op": "set", "props": {"opacity": 1}}) is None
    # class match is token-exact: "m-pas" must not match "m-pass"
    assert _one({"target": ".m-pas", "op": "set", "props": {"opacity": 1}}) is None
    assert _one({"target": ".big", "op": "set", "props": {"opacity": 1}}) is not None


def test_props_whitelist_and_clamps():
    step = _one(
        {
            "target": "#m-dot",
            "op": "to",
            "props": {
                "opacity": 5,
                "rotation": 99999,
                "href": "javascript:alert(1)",
                "onload": "x",
                "style": "background:red",
                "fill": "$accent",
                "stroke": "url(javascript:1)",
                "r": True,
            },
        }
    )
    assert step["props"] == {"opacity": 1.0, "rotation": 3600.0, "fill": "$accent"}


def test_step_without_usable_props_dropped():
    assert _one({"target": "#m-dot", "op": "to", "props": {"href": "x"}}) is None


def test_timing_normalization():
    step = _one(
        {
            "target": "#m-dot",
            "op": "from",
            "props": {"y": 10},
            "at": "+=99",
            "dur": 60,
            "ease": "Function('x')",
            "stagger": 7,
        }
    )
    assert step["at"] == "+=10"
    assert step["dur"] == 6.0
    assert step["ease"] == "power2.out"
    assert step["stagger"] == 1.0
    assert _one({"target": "#m-dot", "op": "set", "props": {"y": 1}, "at": "soon"})["at"] == ">"
    assert _one({"target": "#m-dot", "op": "set", "props": {"y": 1}, "at": 2.5})["at"] == 2.5


def test_draw_morph_follow():
    assert _one({"target": "#m-sweep", "op": "draw", "draw": [10, 500]})["draw"] == [10.0, 100.0]
    assert _one({"target": "#m-sweep", "op": "draw"})["draw"] == [0.0, 100.0]
    assert _one({"target": "#m-sweep", "op": "morph", "morph_to": "#m-shape-b"})["morph_to"] == (
        "#m-shape-b"
    )
    assert _one({"target": "#m-sweep", "op": "morph", "morph_to": "#m-missing"}) is None
    assert _one({"target": "#m-sweep", "op": "morph", "morph_to": ".m-pass"}) is None
    f = _one({"target": "#m-dot", "op": "follow", "path": "#m-sweep", "auto_rotate": 1})
    assert f["path"] == "#m-sweep" and f["auto_rotate"] is True


def test_repeat_and_step_cap():
    steps = [{"target": "#m-dot", "op": "set", "props": {"x": i}} for i in range(100)]
    tl = sanitize_timeline({"steps": steps, "repeat": 50, "repeat_delay": -3, "yoyo": 1}, SVG)
    assert len(tl["steps"]) == MAX_STEPS
    assert tl["repeat"] == 5
    assert tl["repeat_delay"] == 0.0
    assert tl["yoyo"] is True
    assert sanitize_timeline({"steps": steps[:1], "repeat": -7}, SVG)["repeat"] == -1


def test_provenance_kept_only_when_valid():
    assert _one({"target": "#m-dot", "op": "set", "props": {"x": 1}, "why": "direct"})["why"] == (
        "direct"
    )
    assert "why" not in _one({"target": "#m-dot", "op": "set", "props": {"x": 1}, "why": "vibes"})


def test_animated_svg_specialist_attaches_sanitized_motion(monkeypatch):
    import specialists

    fake_input = {
        "spec": SVG,
        "caption": "c",
        "should_demote_to_text": False,
        "demotion_reason": "",
        "timeline": {
            "steps": [
                {"target": "#m-sweep", "op": "draw"},
                {"target": "#m-renamed", "op": "set", "props": {"opacity": 1}},
            ]
        },
    }
    raw = {
        "input": fake_input,
        "cache_read_tokens": 0,
        "cache_creation_tokens": 0,
        "input_tokens": 0,
        "output_tokens": 0,
    }
    monkeypatch.setattr(specialists, "_call_specialist", lambda *a, **k: raw)
    result = specialists.generate_animated_svg_spec("snippet")
    assert result.spec == SVG
    assert [s["target"] for s in result.motion["steps"]] == ["#m-sweep"]

    fake_input.pop("timeline")
    assert specialists.generate_animated_svg_spec("snippet").motion is None
