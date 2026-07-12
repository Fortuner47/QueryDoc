import os
import shutil
from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import List

router = APIRouter(prefix="/api", tags=["documents"])

# Global references set by server.py
vectorstore = None
doc_registry = None
data_loader_module = None

UPLOAD_DIR = "uploads"


def init_documents(vs, registry, loader):
    global vectorstore, doc_registry, data_loader_module
    vectorstore = vs
    doc_registry = registry
    data_loader_module = loader
    os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/documents/upload")
async def upload_documents(files: List[UploadFile] = File(...)):
    """Upload one or more documents, process and index them."""
    if vectorstore is None:
        raise HTTPException(status_code=503, detail="Vector store not initialized")

    results = []

    for file in files:
        # Validate file type
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in {".pdf", ".docx", ".txt", ".md"}:
            results.append({
                "filename": file.filename,
                "status": "error",
                "message": f"Unsupported file type: {ext}. Supported: .pdf, .docx, .txt, .md",
            })
            continue

        # Save to uploads directory
        file_path = os.path.join(UPLOAD_DIR, file.filename)
        try:
            with open(file_path, "wb") as f:
                content = await file.read()
                f.write(content)
            file_size = len(content)
        except Exception as e:
            results.append({
                "filename": file.filename,
                "status": "error",
                "message": f"Failed to save file: {str(e)}",
            })
            continue

        # Register document
        doc_id = doc_registry.add_document(
            filename=file.filename,
            file_size=file_size,
            file_path=file_path,
            status="processing",
        )

        # Load and index
        try:
            documents = data_loader_module.load_single_document(file_path)

            if not documents:
                doc_registry.update_document(doc_id, status="error", chunk_count=0)
                results.append({
                    "filename": file.filename,
                    "doc_id": doc_id,
                    "status": "error",
                    "message": "Document appears to be empty.",
                })
                continue

            chunk_count = vectorstore.add_documents(documents, source_id=doc_id)

            doc_registry.update_document(
                doc_id,
                status="ready",
                chunk_count=chunk_count,
            )

            results.append({
                "filename": file.filename,
                "doc_id": doc_id,
                "status": "ready",
                "chunk_count": chunk_count,
                "file_size": file_size,
                "message": f"Successfully indexed {chunk_count} chunks.",
            })

        except Exception as e:
            doc_registry.update_document(doc_id, status="error")
            results.append({
                "filename": file.filename,
                "doc_id": doc_id,
                "status": "error",
                "message": f"Processing failed: {str(e)}",
            })

    return {"results": results}


@router.get("/documents")
async def list_documents():
    """List all indexed documents."""
    if doc_registry is None:
        raise HTTPException(status_code=503, detail="Document registry not initialized")

    docs = doc_registry.get_all_documents()

    # Format file sizes
    for doc in docs:
        size = doc.get("file_size", 0)
        if size < 1024:
            doc["file_size_display"] = f"{size} B"
        elif size < 1024 * 1024:
            doc["file_size_display"] = f"{size / 1024:.1f} KB"
        else:
            doc["file_size_display"] = f"{size / (1024 * 1024):.1f} MB"

    return {"documents": docs, "total": len(docs)}


@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str):
    """Delete a document and its embeddings."""
    if doc_registry is None or vectorstore is None:
        raise HTTPException(status_code=503, detail="Not initialized")

    doc = doc_registry.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Remove from vector store
    vectorstore.delete_by_source(doc_id)

    # Remove uploaded file
    file_path = doc.get("file_path", "")
    if file_path and os.path.exists(file_path):
        try:
            os.remove(file_path)
        except OSError:
            pass

    # Remove from registry
    doc_registry.remove_document(doc_id)

    return {"message": f"Document '{doc.get('filename')}' deleted successfully."}


@router.post("/documents/{doc_id}/reindex")
async def reindex_document(doc_id: str):
    """Re-index a specific document."""
    if doc_registry is None or vectorstore is None:
        raise HTTPException(status_code=503, detail="Not initialized")

    doc = doc_registry.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = doc.get("file_path", "")
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Source file not found on disk")

    # Remove old embeddings
    vectorstore.delete_by_source(doc_id)

    # Re-process
    doc_registry.update_document(doc_id, status="processing")

    try:
        documents = data_loader_module.load_single_document(file_path)
        chunk_count = vectorstore.add_documents(documents, source_id=doc_id)
        doc_registry.update_document(doc_id, status="ready", chunk_count=chunk_count)

        return {
            "message": f"Document '{doc.get('filename')}' re-indexed with {chunk_count} chunks.",
            "chunk_count": chunk_count,
        }
    except Exception as e:
        doc_registry.update_document(doc_id, status="error")
        raise HTTPException(status_code=500, detail=f"Re-indexing failed: {str(e)}")
