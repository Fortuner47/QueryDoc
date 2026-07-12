import os
import time
from dotenv import load_dotenv
from src.vectorstore import FaissVectorStore
from langchain_groq import ChatGroq
from typing import Dict, Any, Optional

load_dotenv()


class RAGSearch:
    def __init__(
        self,
        persist_dir: str = "faiss_store",
        embedding_model: str = "all-MiniLM-L6-v2",
        llm_model: str = "llama-3.1-8b-instant"
    ):
        self.persist_dir = persist_dir
        self.embedding_model_name = embedding_model
        self.llm_model_name = llm_model

        self.vectorstore = FaissVectorStore(persist_dir, embedding_model)

        # Load or build vector store
        faiss_path = os.path.join(persist_dir, "faiss.index")
        meta_path = os.path.join(persist_dir, "metadata.pkl")

        if os.path.exists(faiss_path) and os.path.exists(meta_path):
            self.vectorstore.load()
        else:
            print("[INFO] No existing FAISS index found. Starting with empty store.")

        groq_api_key = os.getenv("GROQ_API_KEY")

        self.llm = ChatGroq(
            groq_api_key=groq_api_key,
            model_name=llm_model
        )

        self.default_temperature = 0.7
        self.default_max_tokens = 1024

        print(f"[INFO] Groq LLM initialized: {llm_model}")

    def search_and_summarize(self, query: str, top_k: int = 5) -> str:
        results = self.vectorstore.query(query, top_k=top_k)

        texts = [
            r["metadata"].get("text", "")
            for r in results
            if r["metadata"]
        ]

        context = "\n\n".join(texts)

        if not context:
            return "No relevant documents found."

        prompt = f"""Summarize the following context for the query: '{query}'

Context:
{context}

Answer:
"""

        response = self.llm.invoke([prompt])

        return response.content

    def search_with_metadata(
        self,
        query: str,
        top_k: int = 5,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        min_similarity: float = 0.0,
    ) -> Dict[str, Any]:
        """
        Enhanced search that returns the AI response along with retrieval metadata.
        Used by the web API.
        """
        start_time = time.time()

        # Query vector store with similarity filtering
        results = self.vectorstore.query(
            query,
            top_k=top_k,
            min_similarity=min_similarity,
        )

        retrieval_time = (time.time() - start_time) * 1000  # ms

        # Build context from results
        texts = [
            r["metadata"].get("text", "")
            for r in results
            if r.get("metadata")
        ]

        context = "\n\n".join(texts)

        # Build source information
        sources = []
        for i, r in enumerate(results):
            meta = r.get("metadata", {}) or {}
            sources.append({
                "document": meta.get("source_filename", "Unknown"),
                "chunk_index": r.get("index", -1),
                "similarity_score": round(r.get("similarity", 0), 4),
                "text_preview": meta.get("text", "")[:200] + "..." if len(meta.get("text", "")) > 200 else meta.get("text", ""),
                "page": meta.get("page", -1),
            })

        if not context:
            return {
                "response": "No relevant documents found for your query. Please upload some documents first or try a different question.",
                "sources": [],
                "metadata": {
                    "total_chunks_searched": self.vectorstore.get_stats().get("total_vectors", 0),
                    "chunks_retrieved": 0,
                    "retrieval_time_ms": round(retrieval_time, 2),
                },
            }

        # Build the prompt
        prompt = f"""You are a helpful AI assistant. Answer the user's question based on the provided context from their documents. 
Be thorough and precise. If the context doesn't contain enough information to fully answer, say so.
Use markdown formatting for your response when appropriate (headers, lists, code blocks, bold, etc.).

User Question: {query}

Context from documents:
{context}

Answer:"""

        # Configure LLM with provided settings
        temp = temperature if temperature is not None else self.default_temperature
        tokens = max_tokens if max_tokens is not None else self.default_max_tokens

        llm = ChatGroq(
            groq_api_key=os.getenv("GROQ_API_KEY"),
            model_name=self.llm_model_name,
            temperature=temp,
            max_tokens=tokens,
        )

        generation_start = time.time()
        response = llm.invoke([prompt])
        generation_time = (time.time() - generation_start) * 1000

        total_time = (time.time() - start_time) * 1000

        return {
            "response": response.content,
            "sources": sources,
            "metadata": {
                "total_chunks_searched": self.vectorstore.get_stats().get("total_vectors", 0),
                "chunks_retrieved": len(sources),
                "retrieval_time_ms": round(retrieval_time, 2),
                "generation_time_ms": round(generation_time, 2),
                "total_time_ms": round(total_time, 2),
            },
        }