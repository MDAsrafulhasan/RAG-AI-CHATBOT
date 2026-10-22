import os
import sys
import re
import time
from typing import List

# Ensure project root is in Python path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from dotenv import load_dotenv
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.schemas import AskRequest, AskResponse, SourceItem
from src.search import RAGSearch

app = FastAPI(
    title="RAG Intelligence API",
    description="Backend API for Document Question Answering using FAISS and Groq LLM",
    version="1.0.0"
)

# Enable CORS for local frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global RAG engine instance
rag_engine: RAGSearch = None

@app.on_event("startup")
def startup_event():
    global rag_engine
    print("[BACKEND] Initializing RAGSearch engine...")
    persist_dir = os.path.join(PROJECT_ROOT, "faiss_store")
    rag_engine = RAGSearch(persist_dir=persist_dir)
    print("[BACKEND] RAGSearch ready to serve queries.")

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "engine_ready": rag_engine is not None,
        "model": getattr(rag_engine, "llm", None).model_name if rag_engine and hasattr(rag_engine, "llm") else "unknown"
    }

@app.post("/api/ask", response_model=AskResponse)
async def ask_question(request: AskRequest):
    global rag_engine
    if rag_engine is None:
        raise HTTPException(status_code=503, detail="RAG Engine is still initializing. Please retry in a few seconds.")

    question = request.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    try:
        # Retrieve context chunks from vector store
        raw_results = rag_engine.vectorstore.query(question, top_k=request.top_k)

        source_items: List[SourceItem] = []
        texts: List[str] = []

        for r in raw_results:
            meta = r.get("metadata") or {}
            chunk_text = meta.get("text", "")
            if chunk_text:
                texts.append(chunk_text)
            source_items.append(
                SourceItem(
                    index=int(r.get("index", -1)),
                    distance=round(float(r.get("distance", 0.0)), 4),
                    text=chunk_text
                )
            )

        # Generate answer with LLM using the retrieved context
        if not texts:
            answer = "I don't have enough information in my knowledge base to answer that."
        else:
            context = "\n\n".join(texts)
            prompt = (
                f"You are a friendly, knowledgeable, and real-time AI assistant.\n"
                f"Answer the user's question directly, clearly, and conversationally based on the knowledge provided below.\n\n"
                f"RULES:\n"
                f"- Never begin with 'Based on the provided context', 'According to the context', 'From the text', or similar meta phrases.\n"
                f"- Speak naturally and directly to the user as a real conversational chatbot.\n"
                f"- Keep formatting clean with bullet points or paragraphs where appropriate.\n"
                f"- If the answer is not in the knowledge base, simply state: 'I don't have enough details in my knowledge base to answer that.'\n\n"
                f"Knowledge Base:\n{context}\n\n"
                f"Question: {question}\n\n"
                f"Answer:"
            )
            response = rag_engine.llm.invoke([prompt])
            answer = response.content.strip()

            # Strip any residual meta prefixes
            meta_patterns = [
                r"^Based on (the\s+)?(provided|given)?\s*(context|documents?|information|text)[,:\s-]*",
                r"^According to (the\s+)?(provided|given)?\s*(context|documents?|information|text)[,:\s-]*",
                r"^From the (provided|given)?\s*(context|documents?|information|text)[,:\s-]*"
            ]
            for pat in meta_patterns:
                answer = re.sub(pat, "", answer, flags=re.IGNORECASE).strip()

            if answer:
                answer = answer[0].upper() + answer[1:]


        return AskResponse(
            question=question,
            answer=answer,
            sources=source_items
        )
    except Exception as e:
        print(f"[ERROR] Failed to process question: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Mount frontend directory for seamless single-server access
frontend_dir = os.path.join(PROJECT_ROOT, "frontend")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")

