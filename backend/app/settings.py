"""Settings read from environment variables (and backend/.env if it exists).

Values are read when asked for, not at import time, so tests can change them.
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")  # real environment variables win

PROVIDERS = ("template", "ollama", "anthropic")


def _flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def coach_enabled() -> bool:
    return _flag("COACH_ENABLED", True)


def coach_show_mode() -> bool:
    """Whether the frontend may show which coach is active (off for the user study)."""
    return _flag("COACH_SHOW_MODE", False)


def coach_provider() -> str:
    name = os.getenv("COACH_PROVIDER", "template").strip().lower() or "template"
    return name if name in PROVIDERS else "template"


def ollama_url() -> str:
    return os.getenv("OLLAMA_URL", "http://localhost:11434").rstrip("/")


def ollama_model() -> str:
    return os.getenv("OLLAMA_MODEL", "qwen2.5:7b")


def ollama_timeout() -> float:
    return float(os.getenv("OLLAMA_TIMEOUT", "300"))


def ollama_keep_alive() -> str:
    return os.getenv("OLLAMA_KEEP_ALIVE", "30m")


def ollama_num_predict() -> int:
    return int(os.getenv("OLLAMA_NUM_PREDICT", "450"))


def ollama_num_ctx() -> int:
    return int(os.getenv("OLLAMA_NUM_CTX", "4096"))


def anthropic_api_key() -> str:
    return os.getenv("ANTHROPIC_API_KEY", "").strip()


def anthropic_model() -> str:
    return os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5-5")


def anthropic_timeout() -> float:
    return float(os.getenv("ANTHROPIC_TIMEOUT", "60"))
