from pydantic import BaseModel, Field
from typing import List, Optional

class AskRequest(BaseModel):
    question: str = Field(..., min_length=1, description="Question to ask the RAG system")
    top_k: int = Field(default=4, ge=1, le=10, description="Number of context chunks to retrieve")

class SourceItem(BaseModel):
    index: int
    distance: float
    text: str

class AskResponse(BaseModel):
    question: str
    answer: str
    sources: List[SourceItem] = []
