"""Unit tests for tools.anthropic_retry.call_with_retry.

Mocks anthropic SDK exceptions by subclassing them and bypassing the real
constructor (APIStatusError requires an httpx.Response, which we don't
want to fabricate in unit tests). Uses monkeypatch on time.sleep so the
exponential backoff doesn't actually delay the suite.
"""

from __future__ import annotations

import anthropic
import pytest

from tools import anthropic_retry
from tools.anthropic_retry import call_with_retry


@pytest.fixture(autouse=True)
def _no_sleep(monkeypatch):
    """Patch time.sleep in the module under test so backoff is instant."""
    monkeypatch.setattr(anthropic_retry.time, "sleep", lambda _s: None)


def _make_rate_limit_error(msg: str = "rate limited") -> anthropic.RateLimitError:
    """Build a RateLimitError without invoking the real __init__ (which
    requires an httpx.Response). status_code is set so the default
    predicate's hasattr check still passes."""
    exc = anthropic.RateLimitError.__new__(anthropic.RateLimitError)
    exc.args = (msg,)
    exc.status_code = 429
    return exc


def _make_api_status_error(status: int, msg: str = "status err") -> anthropic.APIStatusError:
    exc = anthropic.APIStatusError.__new__(anthropic.APIStatusError)
    exc.args = (msg,)
    exc.status_code = status
    return exc


# --- happy path ---------------------------------------------------------


def test_call_with_retry_passthrough():
    """Successful call returns the result without retry."""
    calls = {"n": 0}

    def fn():
        calls["n"] += 1
        return "ok"

    assert call_with_retry(fn) == "ok"
    assert calls["n"] == 1


# --- transient retry then success --------------------------------------


def test_call_with_retry_retries_on_rate_limit_then_succeeds():
    """RateLimitError on first call, success on second — returns success."""
    calls = {"n": 0}

    def fn():
        calls["n"] += 1
        if calls["n"] == 1:
            raise _make_rate_limit_error()
        return "ok"

    assert call_with_retry(fn, max_retries=3, base_delay=0.0) == "ok"
    assert calls["n"] == 2


# --- give up after max -------------------------------------------------


def test_call_with_retry_gives_up_after_max():
    """Always-failing call re-raises after exhausting max_retries."""
    calls = {"n": 0}

    def fn():
        calls["n"] += 1
        raise _make_rate_limit_error()

    with pytest.raises(anthropic.RateLimitError):
        call_with_retry(fn, max_retries=2, base_delay=0.0)

    # 1 initial attempt + 2 retries = 3 total calls
    assert calls["n"] == 3


# --- non-retryable 4xx -------------------------------------------------


def test_call_with_retry_does_not_retry_4xx():
    """APIStatusError with status=400 (bad request) is re-raised immediately."""
    calls = {"n": 0}

    def fn():
        calls["n"] += 1
        raise _make_api_status_error(400)

    with pytest.raises(anthropic.APIStatusError):
        call_with_retry(fn, max_retries=3, base_delay=0.0)

    assert calls["n"] == 1


# --- unrelated exception passes through --------------------------------


def test_call_with_retry_does_not_retry_unrelated_exception():
    """ValueError (not an anthropic transient error) re-raises immediately."""
    calls = {"n": 0}

    def fn():
        calls["n"] += 1
        raise ValueError("boom")

    with pytest.raises(ValueError, match="boom"):
        call_with_retry(fn, max_retries=3, base_delay=0.0)

    assert calls["n"] == 1


# --- 5xx is retryable --------------------------------------------------


def test_call_with_retry_retries_5xx_then_succeeds():
    """APIStatusError with status>=500 is treated as transient."""
    calls = {"n": 0}

    def fn():
        calls["n"] += 1
        if calls["n"] == 1:
            raise _make_api_status_error(503)
        return "ok"

    assert call_with_retry(fn, max_retries=2, base_delay=0.0) == "ok"
    assert calls["n"] == 2


# --- custom retry_on predicate override --------------------------------


def test_call_with_retry_honors_custom_retry_on():
    """Callers may pass retry_on to override the default predicate."""
    calls = {"n": 0}

    def fn():
        calls["n"] += 1
        if calls["n"] == 1:
            raise ValueError("transient-via-custom-predicate")
        return "ok"

    result = call_with_retry(
        fn,
        max_retries=2,
        base_delay=0.0,
        retry_on=lambda exc: isinstance(exc, ValueError),
    )
    assert result == "ok"
    assert calls["n"] == 2
