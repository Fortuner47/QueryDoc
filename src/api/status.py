from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api", tags=["status"])

# Global references set by server.py
rag_engine = None
doc_registry = None


def init_status(rag, registry):
    global rag_engine, doc_registry
    rag_engine = rag
    doc_registry = registry


@router.get("/status")
async def get_status():
    """Return system status information."""
    if rag_engine is None:
        raise HTTPException(status_code=503, detail="RAG engine not initialized")

    vs_stats = rag_engine.vectorstore.get_stats()

    return {
        "embedding_model": rag_engine.embedding_model_name,
        "llm_model": rag_engine.llm_model_name,
        "indexed_documents": doc_registry.get_document_count() if doc_registry else 0,
        "total_chunks": vs_stats.get("total_vectors", 0),
        "vector_dimension": vs_stats.get("dimension", 0),
        "vector_db_status": "connected" if vs_stats.get("index_loaded") else "empty",
        "total_registered_chunks": doc_registry.get_total_chunks() if doc_registry else 0,
    }
