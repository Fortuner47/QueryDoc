from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/api", tags=["chat"])


class ChatRequest(BaseModel):
    query: str
    top_k: Optional[int] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    min_similarity: Optional[float] = None


# Global reference set by server.py at startup
rag_engine = None
settings_store = None


def init_chat(rag, settings):
    global rag_engine, settings_store
    rag_engine = rag
    settings_store = settings


@router.post("/chat")
async def chat(request: ChatRequest):
    if rag_engine is None:
        raise HTTPException(status_code=503, detail="RAG engine not initialized")

    # Use request values or fall back to global settings
    s = settings_store or {}
    top_k = request.top_k or s.get("top_k", 5)
    temperature = request.temperature if request.temperature is not None else s.get("temperature", 0.7)
    max_tokens = request.max_tokens or s.get("max_tokens", 1024)
    min_similarity = request.min_similarity if request.min_similarity is not None else s.get("min_similarity", 0.0)

    try:
        result = rag_engine.search_with_metadata(
            query=request.query,
            top_k=top_k,
            temperature=temperature,
            max_tokens=max_tokens,
            min_similarity=min_similarity,
        )
        return result
    except Exception as e:
        print(f"[ERROR] Chat failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate response: {str(e)}")
