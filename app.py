from src.data_loader import load_all_documents
from src.embedding import EmbeddingPipeline
from src.vectorstore import FaissVectorStore
from src.search import RAGSearch

# Example usage
if __name__ == "__main__":
    
    # docs = load_all_documents("data")
    # print(docs)

    # chunks=EmbeddingPipeline().chunk_documents(docs)
    # chunk_vector=EmbeddingPipeline().embed_chunks(chunks)
    # print(chunk_vector)

    store = FaissVectorStore("faiss_store")
    # store.build_from_documents(docs)
    store.load()
    print(store.query("Who is Asraful Hasan?", top_k=3))
    rag_search = RAGSearch()
    query = "Who is Asraful Hasan?"
    summary = rag_search.search_and_summarize(query, top_k=3)
    print("Summary:", summary)
