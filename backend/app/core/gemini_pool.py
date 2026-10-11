"""
Multi-Key Gemini Failover Pool
Automatically rotates and fails over across multiple Gemini API keys
when quota exhaustion (HTTP 429), rate limits, or transient errors occur,
providing zero-downtime and seamless user experience.
"""
import threading
import logging
from typing import Optional, List
from google import genai
from google.genai import types
from app.core.config import settings

logger = logging.getLogger(__name__)


class GeminiKeyPool:
    def __init__(self):
        self._lock = threading.Lock()
        self._current_index = 0
        self._keys: List[str] = []
        self._clients: List[genai.Client] = []
        self._reload_keys()

    def _reload_keys(self):
        keys = settings.get_gemini_api_keys()
        self._keys = [k for k in keys if k and k != "your_gemini_api_key_here"]
        self._clients = [genai.Client(api_key=k) for k in self._keys]
        if self._clients:
            logger.info(f"Initialized Gemini Key Pool with {len(self._clients)} API key(s).")

    @property
    def has_keys(self) -> bool:
        if not self._clients:
            self._reload_keys()
        return len(self._clients) > 0

    @property
    def total_keys(self) -> int:
        if not self._clients:
            self._reload_keys()
        return len(self._clients)

    def generate_content(
        self,
        model: str,
        contents,
        config: Optional[types.GenerateContentConfig] = None
    ):
        """
        Executes generate_content with instant failover.
        If a key hits a quota limit (429 / ResourceExhausted) or error,
        it immediately tries the next key in the pool without user impact.
        """
        if not self._clients:
            self._reload_keys()

        if not self._clients:
            raise RuntimeError("No valid Gemini API keys configured.")

        total = len(self._clients)
        last_error = None

        with self._lock:
            start_index = self._current_index

        for attempt in range(total):
            idx = (start_index + attempt) % total
            client = self._clients[idx]
            key_preview = f"{self._keys[idx][:6]}...{self._keys[idx][-4:]}"

            try:
                response = client.models.generate_content(
                    model=model,
                    contents=contents,
                    config=config,
                )
                # Successful response! Update active index to this working key
                with self._lock:
                    self._current_index = idx
                return response
            except Exception as e:
                last_error = e
                err_msg = str(e)
                print(f"[Gemini Key Pool] Key {idx + 1}/{total} ({key_preview}) error: {err_msg[:120]}. Switching to next key...")
                # Advance active index to the next key
                with self._lock:
                    self._current_index = (idx + 1) % total

        # If all keys failed, raise the final exception
        if last_error is not None:
            raise last_error
        raise RuntimeError("All Gemini API keys failed.")


gemini_pool = GeminiKeyPool()
