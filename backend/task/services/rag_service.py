import re
from typing import List, Dict, Any
from django.db import transaction
from workspace.models import Workspace, WorkspaceContextItem, WorkspaceContextItemChunk

class RAGService:
    """
    Service responsible for document chunking/ingestion and trusted-source RAG retrieval.
    """

    @staticmethod
    def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> List[str]:
        """
        Splits text primarily on paragraph boundaries, target ~500 chars with ~50 chars overlap.
        Respects sentence/paragraph boundaries where practical.
        """
        if not text:
            return []

        # Split text into paragraphs first
        paragraphs = text.split("\n\n")
        blocks = []
        for para in paragraphs:
            para = para.strip()
            if not para:
                continue
            if len(para) <= chunk_size:
                blocks.append(para)
            else:
                # Split large paragraph into sentences
                sentences = re.split(r'(?<=[.!?])\s+', para)
                current_s = []
                current_s_len = 0
                for s in sentences:
                    s = s.strip()
                    if not s:
                        continue
                    if current_s_len + len(s) > chunk_size and current_s:
                        blocks.append(" ".join(current_s))
                        current_s = [s]
                        current_s_len = len(s)
                    else:
                        current_s.append(s)
                        current_s_len += len(s) + (1 if current_s_len > 0 else 0)
                if current_s:
                    blocks.append(" ".join(current_s))

        # Group blocks into overlapping chunks
        chunks = []
        current_chunk = ""
        for block in blocks:
            if not current_chunk:
                current_chunk = block
            elif len(current_chunk) + len(block) + 2 <= chunk_size:
                current_chunk += "\n\n" + block
            else:
                chunks.append(current_chunk)
                # Compute overlap
                overlap_start = max(0, len(current_chunk) - overlap)
                cut_idx = current_chunk.find(" ", overlap_start)
                if cut_idx == -1 or cut_idx >= len(current_chunk):
                    cut_idx = overlap_start
                overlap_text = current_chunk[cut_idx:].strip()
                current_chunk = (overlap_text + "\n\n" + block) if overlap_text else block

        if current_chunk:
            chunks.append(current_chunk)
        return chunks

    @staticmethod
    def chunk_and_store_document(context_item: WorkspaceContextItem):
        """
        Extracts normalized text, chunks it, and saves it to WorkspaceContextItemChunk.
        Safely replaces existing chunks when a document is re-indexed.
        """
        if context_item.context_type != 'INSTITUTIONAL_REFERENCE':
            return

        with transaction.atomic():
            # Delete existing chunks
            WorkspaceContextItemChunk.objects.filter(context_item=context_item).delete()

            # Chunk the normalized content
            text = context_item.normalized_content or ""
            chunks = RAGService.chunk_text(text)

            # Bulk create chunks
            chunk_objs = []
            for idx, chunk_content in enumerate(chunks):
                chunk_objs.append(
                    WorkspaceContextItemChunk(
                        context_item=context_item,
                        chunk_index=idx,
                        content=chunk_content,
                        metadata={
                            "source": context_item.original_filename or context_item.name,
                            "char_count": len(chunk_content)
                        }
                    )
                )
            if chunk_objs:
                WorkspaceContextItemChunk.objects.bulk_create(chunk_objs)

    @staticmethod
    def retrieve_trusted_knowledge(workspace: Workspace, query: str) -> List[Dict[str, Any]]:
        """
        Retrieves active, non-archived institutional reference chunks in the workspace,
        relevance-ranked and capped to fit within the workspace's context_window_limit.
        """
        # If institutional knowledge is disabled, return empty list
        if not workspace.institutional_knowledge_enabled:
            return []

        # Find candidate chunks
        candidates = WorkspaceContextItemChunk.objects.filter(
            context_item__workspace=workspace,
            context_item__is_active=True,
            context_item__is_archived=False,
            context_item__context_type='INSTITUTIONAL_REFERENCE'
        ).select_related('context_item')

        query_words = [w.strip().lower() for w in re.split(r'\W+', query) if w.strip()]
        stop_words = {
            'a', 'an', 'the', 'is', 'are', 'was', 'were', 'for', 'to', 'of', 'in', 'on', 'at', 'by',
            'and', 'or', 'but', 'if', 'this', 'that', 'with', 'about', 'can'
        }
        keywords = [w for w in query_words if w not in stop_words and len(w) > 1]
        if not keywords:
            keywords = query_words

        scored_candidates = []
        for chunk in candidates:
            score = 0
            content_lower = chunk.content.lower()
            for kw in keywords:
                if kw in content_lower:
                    score += 1
            if score > 0:
                scored_candidates.append((score, chunk))

        # Rank candidates by relevance score descending
        scored_candidates.sort(key=lambda item: item[0], reverse=True)

        # Respect the context budget
        retrieved_chunks = []
        current_char_count = 0
        budget = workspace.context_window_limit

        for score, chunk in scored_candidates:
            chunk_len = len(chunk.content)
            # If adding this chunk exceeds the budget, skip or stop
            if current_char_count + chunk_len > budget:
                if not retrieved_chunks:
                    # Always include at least one top chunk if budget permits
                    retrieved_chunks.append(chunk)
                break
            retrieved_chunks.append(chunk)
            current_char_count += chunk_len

        # Return structured results preserving provenance
        results = []
        for chunk in retrieved_chunks:
            results.append({
                "id": str(chunk.id),
                "content": chunk.content,
                "source": chunk.context_item.original_filename or chunk.context_item.name,
                "document_id": str(chunk.context_item.id),
                "chunk_index": chunk.chunk_index,
                "metadata": chunk.metadata,
                "relevance_score": next((score for score, c in scored_candidates if c.id == chunk.id), 1)
            })
        return results
