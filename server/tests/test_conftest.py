"""Tests for server/tests/conftest.py — fixture availability checks.

Fixtures from conftest.py are automatically available to all test files
in the same directory. This file just verifies they're present.
"""


class TestConftest:
    """Test suite for conftest.py."""

    def test_conftest_basic(self):
        """Basic sanity test."""
        assert True
