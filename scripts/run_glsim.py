"""
Launches GLSim with Gemini support added.

genlayer-test 0.29.2's GLSim only has two LLM providers hardcoded
(glsim/live_io.py: `_call_openai` -> api.openai.com, `_call_anthropic` ->
api.anthropic.com, nothing else, no configurable base URL). Gemini has a
genuine free tier (no card, Flash/Flash-Lite models, key from
https://aistudio.google.com/apikey) and ships an OpenAI-compatible endpoint
(https://ai.google.dev/gemini-api/docs/openai), so this monkeypatches a third
provider in at runtime rather than editing the installed package directly -
that way it survives a `pip install --upgrade genlayer-test` instead of
getting silently overwritten.

Usage (same flags as the real `glsim` command):
    python scripts/run_glsim.py --llm-provider gemini:gemini-3.6-flash

Note: gemini-2.5-flash (the model suggested in most current docs/blog posts
as of this build) returns a 404 "no longer available to new users" - Google
now points new keys at gemini-3.6-flash instead. Confirmed directly against
the live API with this project's actual key, not assumed from docs.

Requires GEMINI_API_KEY set (in the environment, or in a .env file in the
current directory - python-dotenv is already a dependency of genlayer-test).
"""

import json
import os
from typing import Any, Optional

from dotenv import load_dotenv

load_dotenv()

import glsim.live_io as live_io

_original_create_llm_handler = live_io.create_llm_handler


def _call_gemini(model: str):
    def call(prompt: str, response_format: Optional[str] = None) -> Any:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY not set")

        import httpx

        payload: dict = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
        }
        if response_format == "json":
            payload["response_format"] = {"type": "json_object"}

        resp = httpx.Client(timeout=120).post(
            "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
        text = data["choices"][0]["message"]["content"]

        if response_format == "json":
            try:
                return json.loads(text)
            except (json.JSONDecodeError, TypeError):
                pass
        return text

    return call


def _patched_create_llm_handler(provider_config: str | None = None):
    config = provider_config or ""
    if config.startswith("gemini:") or config == "gemini":
        model = config.split(":", 1)[1] if ":" in config else "gemini-3.6-flash"
        caller = _call_gemini(model)

        def handler(data: Any) -> dict:
            prompt = data.get("prompt", "")
            config_data = data.get("config", {}) or {}
            response_format = config_data.get("response_format")
            try:
                result = caller(prompt, response_format)
                return {"ok": result}
            except Exception as exc:  # noqa: BLE001 - mirrors live_io's own catch-all
                return {"ok": f"live_io LLM error: {exc}"}

        return handler

    return _original_create_llm_handler(provider_config)


live_io.create_llm_handler = _patched_create_llm_handler

if __name__ == "__main__":
    from glsim.__main__ import main

    main()
