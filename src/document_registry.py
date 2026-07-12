import json
import os
import uuid
from datetime import datetime
from typing import Dict, List, Optional


class DocumentRegistry:
    """
    Tracks metadata about uploaded documents.
    Persists to a JSON file in the FAISS store directory.
    """

    def __init__(self, persist_dir: str = "faiss_store"):
        self.persist_dir = persist_dir
        self.registry_path = os.path.join(persist_dir, "registry.json")
        self.documents: Dict[str, Dict] = {}
        self._load()

    def _load(self):
        """Load registry from disk."""
        if os.path.exists(self.registry_path):
            try:
                with open(self.registry_path, "r", encoding="utf-8") as f:
                    self.documents = json.load(f)
                print(f"[INFO] Loaded document registry with {len(self.documents)} entries.")
            except (json.JSONDecodeError, IOError) as e:
                print(f"[WARN] Failed to load registry: {e}. Starting fresh.")
                self.documents = {}
        else:
            self.documents = {}

    def _save(self):
        """Save registry to disk."""
        os.makedirs(self.persist_dir, exist_ok=True)
        with open(self.registry_path, "w", encoding="utf-8") as f:
            json.dump(self.documents, f, indent=2, default=str)

    def add_document(
        self,
        filename: str,
        file_size: int,
        file_path: str,
        chunk_count: int = 0,
        status: str = "processing",
    ) -> str:
        """Register a new document. Returns the document ID."""
        doc_id = str(uuid.uuid4())[:8]

        self.documents[doc_id] = {
            "id": doc_id,
            "filename": filename,
            "file_size": file_size,
            "file_path": file_path,
            "chunk_count": chunk_count,
            "status": status,  # "processing", "ready", "error"
            "upload_date": datetime.now().isoformat(),
            "file_type": os.path.splitext(filename)[1].lower(),
        }

        self._save()
        return doc_id

    def update_document(self, doc_id: str, **kwargs):
        """Update fields of a document entry."""
        if doc_id in self.documents:
            self.documents[doc_id].update(kwargs)
            self._save()

    def remove_document(self, doc_id: str) -> Optional[Dict]:
        """Remove a document from the registry. Returns the removed entry."""
        entry = self.documents.pop(doc_id, None)
        if entry:
            self._save()
        return entry

    def get_document(self, doc_id: str) -> Optional[Dict]:
        """Get a single document entry."""
        return self.documents.get(doc_id)

    def get_all_documents(self) -> List[Dict]:
        """Get all document entries as a list."""
        return list(self.documents.values())

    def get_document_count(self) -> int:
        """Return count of registered documents."""
        return len(self.documents)

    def get_total_chunks(self) -> int:
        """Return total chunk count across all documents."""
        return sum(
            doc.get("chunk_count", 0)
            for doc in self.documents.values()
        )
