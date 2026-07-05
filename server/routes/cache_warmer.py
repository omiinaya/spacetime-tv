"""Cache warmer state and launcher — shared between main.py and admin.py.

Provides a singleton: start_cache_warmer() plus _warm_task tracking.
Both main.py and admin.py import from here instead of across each other,
breaking the circular import that forced ``import main as m`` in admin.py.
"""

import asyncio
import logging
from typing import Optional

log = logging.getLogger("spacetime-tv")

_warm_task: Optional[asyncio.Task] = None


def start_cache_warmer() -> None:
    """Launch cache warming in background (non-blocking).

    Imports warm_cache lazily from main to avoid circular import at module
    level — admin.py is loaded before warm_cache is defined in main.py.
    """
    global _warm_task
    if _warm_task is None or _warm_task.done():
        from main import warm_cache  # pylint: disable=import-outside-toplevel

        _warm_task = asyncio.create_task(warm_cache())


def is_warm_running() -> bool:
    """Return True if a warm task exists and hasn't finished."""
    return _warm_task is not None and not _warm_task.done()


async def get_warm_task() -> Optional[asyncio.Task]:
    """FastAPI dependency: returns the current warm task (if any)."""
    return _warm_task
