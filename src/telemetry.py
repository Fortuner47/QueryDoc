import os
import json
import time
import uuid
from typing import Dict, Any, Optional

class TelemetryTracer:
    """Lightweight local telemetry for tracking RAG metrics (latency, cost)."""
    
    def __init__(self, log_file: str = "telemetry_logs.jsonl"):
        self.log_file = log_file
        
        # Approximate cost for llama-3.1-8b-instant
        self.cost_per_1k_input = 0.00005
        self.cost_per_1k_output = 0.00008

    def log_request(
        self, 
        query: str, 
        retrieval_time_ms: float, 
        rerank_time_ms: float, 
        generation_time_ms: float,
        input_tokens: int,
        output_tokens: int,
        chunks_retrieved: int,
        success: bool = True
    ):
        total_time_ms = retrieval_time_ms + rerank_time_ms + generation_time_ms
        
        cost = (input_tokens / 1000.0 * self.cost_per_1k_input) + \
               (output_tokens / 1000.0 * self.cost_per_1k_output)
               
        log_entry = {
            "trace_id": str(uuid.uuid4()),
            "timestamp": time.time(),
            "query": query,
            "success": success,
            "latency_ms": {
                "retrieval": round(retrieval_time_ms, 2),
                "rerank": round(rerank_time_ms, 2),
                "generation": round(generation_time_ms, 2),
                "total": round(total_time_ms, 2),
            },
            "tokens": {
                "input": input_tokens,
                "output": output_tokens,
                "total": input_tokens + output_tokens,
            },
            "cost_usd": cost,
            "chunks_retrieved": chunks_retrieved,
        }
        
        with open(self.log_file, "a") as f:
            f.write(json.dumps(log_entry) + "\n")
            
        return log_entry
