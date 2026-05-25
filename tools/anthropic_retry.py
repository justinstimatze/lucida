"""Retry-with-exponential-backoff wrapper for Anthropic API calls.

Call sites that hit `client.messages.create(...)` previously failed the
entire mint on any transient error — a single 429 rate-limit or 5xx blip
killed the cell. Wrap the call with `call_with_retry` to recover from
transient SDK errors with bounded exponential backoff.

Default retry set: RateLimitError, APIStatusError(status >= 500),
APIConnectionError, APITimeoutError. 4xx (auth, bad request, 404) and
non-anthropic exceptions re-raise immediately.

Cap retries low (default 3): LLM calls are expensive; over-retry creates
pile-up risk under sustained rate-limit pressure.
"""

from __future__ import annotations

import random
import sys
import time
from collections.abc import Callable
from typing import Any, TypeVar

import anthropic

T = TypeVar("T")


def _default_retryable(exc: BaseException) -> bool:
    """Return True if `exc` is a transient anthropic error worth retrying."""
    if isinstance(
        exc,
        anthropic.RateLimitError | anthropic.APIConnectionError | anthropic.APITimeoutError,
    ):
        return True
    if isinstance(exc, anthropic.APIStatusError):
        status = getattr(exc, "status_code", None)
        return isinstance(status, int) and status >= 500
    return False


def call_with_retry(
    callable_fn: Callable[[], T],
    *,
    max_retries: int = 3,
    base_delay: float = 1.0,
    jitter: float = 0.25,
    retry_on: Callable[[BaseException], bool] | None = None,
) -> T:
    """Invoke `callable_fn()` with bounded exponential backoff on transient
    anthropic errors. Re-raises the last exception unchanged after
    `max_retries` failed attempts. `retry_on` overrides the default
    retryable-exception predicate."""
    predicate = retry_on if retry_on is not None else _default_retryable
    last_exc: BaseException | None = None
    for attempt in range(max_retries + 1):
        try:
            return callable_fn()
        except BaseException as exc:
            last_exc = exc
            if not predicate(exc) or attempt >= max_retries:
                raise
            delay = base_delay * (2**attempt) + random.uniform(0, jitter)
            print(
                f"[anthropic_retry] attempt {attempt + 1}/{max_retries} failed "
                f"({type(exc).__name__}); sleeping {delay:.2f}s",
                file=sys.stderr,
            )
            time.sleep(delay)
    # Unreachable — loop either returns or re-raises. Pacify type checker.
    assert last_exc is not None
    raise last_exc


__all__: list[Any] = ["call_with_retry"]
