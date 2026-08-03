import os
import json
import sys
from dotenv import load_dotenv

# Ensure we can import src
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.search import RAGSearch

def run_evaluation():
    load_dotenv()
    
    print("Initializing RAG Engine for Evaluation...")
    try:
        rag_engine = RAGSearch(persist_dir="faiss_store")
    except Exception as e:
        print(f"Failed to initialize RAG Engine: {e}")
        sys.exit(1)
        
    eval_file = os.path.join(os.path.dirname(__file__), "test_dataset.json")
    with open(eval_file, "r") as f:
        dataset = json.load(f)
        
    print(f"Loaded {len(dataset)} evaluation queries.")
    
    total_score = 0
    
    for item in dataset:
        query = item["question"]
        expected_context = item["expected_context"].lower()
        
        print(f"\nEvaluating: '{query}'")
        
        # Test Retrieval Pipeline
        results = rag_engine.search_with_metadata(query, top_k=3)
        sources = results.get("sources", [])
        
        # 1. Context Precision / Recall (Basic keyword check in retrieved context)
        context_text = " ".join([s["text_preview"] for s in sources]).lower()
        
        if expected_context in context_text or not expected_context:
            print(" - [PASS] Context Retrieval")
            total_score += 1
        else:
            print(f" - [FAIL] Context Retrieval (missing '{expected_context}')")
            
    # Regression threshold: Need at least 50% pass for this dummy check
    # In a real scenario, this would be an LLM-as-a-judge score.
    max_score = len(dataset)
    pass_rate = total_score / max_score if max_score > 0 else 0
    
    print(f"\n--- Evaluation Complete ---")
    print(f"Pass Rate: {pass_rate*100:.1f}% ({total_score}/{max_score})")
    
    if pass_rate < 0.5:
        print("ERROR: Regression detected! Pass rate below 50%.")
        sys.exit(1)
    else:
        print("SUCCESS: Evaluation passed.")
        sys.exit(0)

if __name__ == "__main__":
    run_evaluation()
