"""The coach's brains. Each provider turns a prompt into text (JSON).

- template  : no AI at all; handled in template.py, not here.
- ollama    : a local model (slow on CPU, but free and private).
- anthropic : Claude through the official SDK, only when ANTHROPIC_API_KEY is set.

Providers only send text in and get text back. They never see the database or the engine.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Optional

import httpx

from .. import settings


class ProviderError(Exception):
    """The AI provider failed (not running, timed out, bad key...). The service falls back to the template."""


@dataclass
class ProviderResult:
    text: str
    model: str
    prompt_tokens: Optional[int]
    completion_tokens: Optional[int]
    duration_ms: int


class Provider:
    name = "base"

    @property
    def model(self) -> str:
        return ""

    def complete(self, system: str, user: str, schema: dict) -> ProviderResult:
        raise NotImplementedError


class OllamaProvider(Provider):
    name = "ollama"

    @property
    def model(self) -> str:
        return settings.ollama_model()

    def complete(self, system: str, user: str, schema: dict) -> ProviderResult:
        started = time.monotonic()
        body = {
            "model": self.model,
            "stream": False,
            "format": schema,                       # Ollama forces the reply to match this JSON schema
            "keep_alive": settings.ollama_keep_alive(),   # keep the model in memory between calls
            "options": {
                "temperature": 0.3,
                "num_predict": settings.ollama_num_predict(),  # cap the length of the answer
                "num_ctx": settings.ollama_num_ctx(),          # a smaller memory window is faster
            },
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        }
        try:
            resp = httpx.post(f"{settings.ollama_url()}/api/chat", json=body, timeout=settings.ollama_timeout())
            resp.raise_for_status()
            data = resp.json()
            text = data["message"]["content"]
        except httpx.TimeoutException as exc:
            raise ProviderError("the local model took too long to answer") from exc
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            raise ProviderError(f"the local model could not be reached: {exc}") from exc
        return ProviderResult(text, self.model, data.get("prompt_eval_count"), data.get("eval_count"),
                              int((time.monotonic() - started) * 1000))


class AnthropicProvider(Provider):
    name = "anthropic"

    @property
    def model(self) -> str:
        return settings.anthropic_model()

    def complete(self, system: str, user: str, schema: dict) -> ProviderResult:
        import anthropic

        key = settings.anthropic_api_key()
        if not key:
            raise ProviderError("ANTHROPIC_API_KEY is not set")
        started = time.monotonic()
        try:
            client = anthropic.Anthropic(api_key=key, timeout=settings.anthropic_timeout(), max_retries=1)
            response = client.messages.create(
                model=self.model,
                max_tokens=4000,
                system=system + "\n\nReply with a single JSON object only, no other text.",
                messages=[{"role": "user", "content": user}],
                output_config={"effort": "low"},
            )
        except anthropic.APITimeoutError as exc:
            raise ProviderError("Claude took too long to answer") from exc
        except anthropic.APIError as exc:
            raise ProviderError(f"Claude could not be reached: {exc}") from exc
        text = "".join(b.text for b in response.content if b.type == "text")
        return ProviderResult(text, self.model, response.usage.input_tokens, response.usage.output_tokens,
                              int((time.monotonic() - started) * 1000))


def make_provider(name: str) -> Optional[Provider]:
    """None means "use the template" (also when the chosen provider cannot work at all)."""
    if name == "ollama":
        return OllamaProvider()
    if name == "anthropic" and settings.anthropic_api_key():
        return AnthropicProvider()
    return None
