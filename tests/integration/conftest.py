"""Shared fixtures for integration tests.

Integration tests call real APIs (Anthropic). They are skipped when
ANTHROPIC_API_KEY is not set so CI can run them as an optional suite.

Run explicitly with:
    pytest tests/integration/ -m integration

Or include in a full run with:
    pytest --run-integration
"""
from __future__ import annotations

import os

import pytest


def pytest_configure(config):
    config.addinivalue_line(
        "markers", "integration: mark test as requiring live API access"
    )


@pytest.fixture(scope="session", autouse=True)
def require_api_key():
    """Skip the entire integration suite if ANTHROPIC_API_KEY is not set."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        pytest.skip("ANTHROPIC_API_KEY not set — skipping integration tests")
