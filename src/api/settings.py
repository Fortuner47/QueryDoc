from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/api", tags=["settings"])

# Global settings dict
_settings = {
    "top_k": 5,
    "temperature": 0.7,
    "max_tokens": 1024,
    "min_similarity": 0.0,
    "embedding_model": "all-MiniLM-L6-v2",
    "llm_model": "llama-3.1-8b-instant",
}


class SettingsUpdate(BaseModel):
    top_k: Optional[int] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    min_similarity: Optional[float] = None


def get_settings():
    return _settings


@router.get("/settings")
async def get_current_settings():
    """Return current application settings."""
    return _settings


@router.put("/settings")
async def update_settings(update: SettingsUpdate):
    """Update application settings."""
    if update.top_k is not None:
        _settings["top_k"] = max(1, min(10, update.top_k))
    if update.temperature is not None:
        _settings["temperature"] = max(0.0, min(1.0, update.temperature))
    if update.max_tokens is not None:
        _settings["max_tokens"] = max(100, min(8192, update.max_tokens))
    if update.min_similarity is not None:
        _settings["min_similarity"] = max(0.0, min(1.0, update.min_similarity))

    return _settings
