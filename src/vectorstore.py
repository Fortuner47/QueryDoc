import os
import faiss
import numpy as np
import pickle
from typing import List, Any, Dict, Optional
from sentence_transformers import SentenceTransformer
from src.embedding import EmbeddingPipeline


class FaissVectorStore:

    def __init__(
        self,
        persist_dir: str = "faiss_store",
        embedding_model: str = "all-MiniLM-L6-v2",
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
    ):
        self.persist_dir = persist_dir
        os.makedirs(self.persist_dir, exist_ok=True)

        self.index = None
        self.metadata = []

        self.embedding_model = embedding_model
        self.model = SentenceTransformer(embedding_model)

        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

        print(f"[INFO] Loaded embedding model: {embedding_model}")

    def build_from_documents(self, documents: List[Any]):
        print(f"[INFO] Building vector store from {len(documents)} raw documents...")

        emb_pipe = EmbeddingPipeline(
            model_name=self.embedding_model,
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
        )

        chunks = emb_pipe.chunk_documents(documents)
        embeddings = emb_pipe.embed_chunks(chunks)

        metadatas = [
            {"text": chunk.page_content}
            for chunk in chunks
        ]

        self.add_embeddings(
            np.array(embeddings).astype("float32"),
            metadatas,
        )

        self.save()

        print(f"[INFO] Vector store built and saved to {self.persist_dir}")

    def add_documents(self, documents: List[Any], source_id: str = None) -> int:
        """
        Add documents incrementally to the existing index.
        Returns the number of chunks added.
        """
        emb_pipe = EmbeddingPipeline(
            model_name=self.embedding_model,
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
        )

        chunks = emb_pipe.chunk_documents(documents)
        embeddings = emb_pipe.embed_chunks(chunks)

        metadatas = []
        for chunk in chunks:
            meta = {"text": chunk.page_content}
            if source_id:
                meta["source_id"] = source_id
            # Preserve any existing metadata from the document
            if hasattr(chunk, "metadata") and chunk.metadata:
                meta["source_filename"] = chunk.metadata.get("source_filename", "")
                meta["source_path"] = chunk.metadata.get("source_path", "")
                meta["page"] = chunk.metadata.get("page", -1)
            metadatas.append(meta)

        self.add_embeddings(
            np.array(embeddings).astype("float32"),
            metadatas,
        )

        self.save()

        print(f"[INFO] Incrementally added {len(chunks)} chunks for source: {source_id}")
        return len(chunks)

    def delete_by_source(self, source_id: str) -> bool:
        """
        Delete all embeddings associated with a source_id.
        Rebuilds the index without those vectors.
        """
        if self.index is None or not self.metadata:
            return False

        # Find indices to keep
        keep_indices = []
        for i, meta in enumerate(self.metadata):
            if meta.get("source_id") != source_id:
                keep_indices.append(i)

        if len(keep_indices) == len(self.metadata):
            print(f"[INFO] No vectors found for source: {source_id}")
            return False

        removed_count = len(self.metadata) - len(keep_indices)

        if len(keep_indices) == 0:
            # All vectors removed, reset index
            self.index = None
            self.metadata = []
        else:
            # Reconstruct index with remaining vectors
            dim = self.index.d
            all_vectors = np.array([
                self.index.reconstruct(i) for i in keep_indices
            ]).astype("float32")

            new_index = faiss.IndexFlatL2(dim)
            new_index.add(all_vectors)

            new_metadata = [self.metadata[i] for i in keep_indices]

            self.index = new_index
            self.metadata = new_metadata

        self.save()
        print(f"[INFO] Deleted {removed_count} vectors for source: {source_id}")
        return True

    def add_embeddings(
        self,
        embeddings: np.ndarray,
        metadatas: List[Any] = None,
    ):
        dim = embeddings.shape[1]

        if self.index is None:
            self.index = faiss.IndexFlatL2(dim)

        self.index.add(embeddings)

        if metadatas:
            self.metadata.extend(metadatas)

        print(f"[INFO] Added {embeddings.shape[0]} vectors to Faiss index.")

    def save(self):
        faiss_path = os.path.join(self.persist_dir, "faiss.index")
        meta_path = os.path.join(self.persist_dir, "metadata.pkl")

        if self.index is not None:
            faiss.write_index(self.index, faiss_path)
        else:
            # Remove old index files if index is empty
            if os.path.exists(faiss_path):
                os.remove(faiss_path)
            if os.path.exists(meta_path):
                os.remove(meta_path)
            return

        with open(meta_path, "wb") as f:
            pickle.dump(self.metadata, f)

        print(f"[INFO] Saved Faiss index and metadata to {self.persist_dir}")

    def load(self):
        faiss_path = os.path.join(self.persist_dir, "faiss.index")
        meta_path = os.path.join(self.persist_dir, "metadata.pkl")

        if not os.path.exists(faiss_path):
            print(f"[WARN] No Faiss index found at {faiss_path}. Starting empty.")
            return

        self.index = faiss.read_index(faiss_path)

        with open(meta_path, "rb") as f:
            self.metadata = pickle.load(f)

        print(f"[INFO] Loaded Faiss index and metadata from {self.persist_dir}")

    def search(
        self,
        query_embedding: np.ndarray,
        top_k: int = 5,
    ):
        if self.index is None or self.index.ntotal == 0:
            return []

        # Clamp top_k to available vectors
        actual_k = min(top_k, self.index.ntotal)
        D, I = self.index.search(query_embedding, actual_k)

        results = []

        for idx, dist in zip(I[0], D[0]):
            if idx < 0:
                continue
            meta = self.metadata[idx] if idx < len(self.metadata) else None

            # Convert L2 distance to a similarity score (0-1 range)
            # For normalized vectors: similarity = 1 - (distance / 2)
            # For general case, use exponential decay
            similarity = float(1.0 / (1.0 + dist))

            results.append(
                {
                    "index": int(idx),
                    "distance": float(dist),
                    "similarity": similarity,
                    "metadata": meta,
                }
            )

        return results

    def query(
        self,
        query_text: str,
        top_k: int = 5,
        min_similarity: float = 0.0,
    ) -> List[Dict]:
        """
        Query the vector store with optional minimum similarity filtering.
        """
        print(f"[INFO] Querying vector store for: '{query_text}'")

        if self.index is None or self.index.ntotal == 0:
            print("[WARN] Vector store is empty.")
            return []

        query_emb = self.model.encode(
            [query_text]
        ).astype("float32")

        results = self.search(
            query_emb,
            top_k=top_k,
        )

        # Filter by minimum similarity
        if min_similarity > 0:
            results = [r for r in results if r["similarity"] >= min_similarity]

        return results

    def get_stats(self) -> Dict:
        """Return index statistics."""
        if self.index is None:
            return {
                "total_vectors": 0,
                "dimension": 0,
                "index_loaded": False,
            }

        return {
            "total_vectors": int(self.index.ntotal),
            "dimension": int(self.index.d),
            "index_loaded": True,
        }

    def get_chunks_by_source(self, source_id: str) -> int:
        """Count chunks belonging to a specific source."""
        return sum(
            1 for m in self.metadata
            if m.get("source_id") == source_id
        )