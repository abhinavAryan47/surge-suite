import re
from typing import List, Dict, Any, Tuple

class UncertaintyStatus:
    VERIFIED = 'VERIFIED'
    PARTIALLY_VERIFIED = 'PARTIALLY_VERIFIED'
    CONFLICTING = 'CONFLICTING'
    INSUFFICIENT_EVIDENCE = 'INSUFFICIENT_EVIDENCE'

class UncertaintyDetector:
    """
    Detects missing parameters, conflicting institutional information,
    and classifies overall query/evidence verification status.
    """

    # Map tools to their required arguments
    REQUIRED_ARGS = {
        "certificate_requests.create_certificate_request": ["certificate_type"],
        "maintenance_tickets.create_maintenance_ticket": ["category", "description", "location"],
        "laboratory_bookings.create_lab_booking": ["lab_name", "date", "start_time", "end_time"],
        "grievance_escalation.create_grievance": ["subject", "description"]
    }

    @classmethod
    def check_missing_info(cls, action_type: str, arguments: dict) -> List[str]:
        """
        Returns a list of missing argument names for the specified institutional tool.
        """
        required = cls.REQUIRED_ARGS.get(action_type, [])
        missing = []
        for arg in required:
            val = arguments.get(arg)
            if val is None or (isinstance(val, str) and not val.strip()):
                missing.append(arg)
        return missing

    @classmethod
    def check_rag_conflicts(cls, chunks: List[Dict[str, Any]], query: str) -> bool:
        """
        Programmatically detects contradictory claims in RAG chunks.
        For example, if one chunk specifies '2 hours' and another specifies '4 hours'
        for the same query context, it flags a conflict.
        """
        if len(chunks) < 2:
            return False

        # Extract all numbers from each chunk
        chunk_numbers = []
        for c in chunks:
            content = c["content"].lower()
            # Extract numbers like '2 hours', '4 hours', or standalone digits
            numbers = set(re.findall(r'\b\d+(?:\.\d+)?\b', content))
            if numbers:
                chunk_numbers.append((c["source"], numbers))

        # Check if query asks about numeric limits (hours, days, fees, limit, duration)
        query_lower = query.lower()
        has_limit_intent = any(kw in query_lower for kw in [
            "limit", "max", "maximum", "duration", "hour", "day", "fee", "cost", "price", "deadline"
        ])

        if has_limit_intent and len(chunk_numbers) >= 2:
            # Check if different sources contain different numeric values
            first_source, first_nums = chunk_numbers[0]
            for source, nums in chunk_numbers[1:]:
                if source != first_source and nums != first_nums:
                    # Found different numbers in different documents for a limit query -> CONFLICT!
                    return True

        # Check for explicit contradictory keyword rules
        # e.g., if one source says "online application is available" and another says "cannot apply online"
        has_online_intent = "online" in query_lower
        if has_online_intent:
            has_yes = False
            has_no = False
            for c in chunks:
                content = c["content"].lower()
                if any(x in content for x in ["available online", "apply online", "can apply online"]):
                    has_yes = True
                if any(x in content for x in ["not available online", "cannot apply online", "no online"]):
                    has_no = True
            if has_yes and has_no:
                return True

        return False

    @classmethod
    def classify_verification(cls, chunks: List[Dict[str, Any]], query: str, missing_params: List[str] = None) -> str:
        """
        Classifies the overall verification status.
        """
        if missing_params:
            return UncertaintyStatus.INSUFFICIENT_EVIDENCE

        if not chunks:
            return UncertaintyStatus.INSUFFICIENT_EVIDENCE

        if cls.check_rag_conflicts(chunks, query):
            return UncertaintyStatus.CONFLICTING

        # If we have matches with high relevance, it's VERIFIED
        max_relevance = max(c.get("relevance_score", 0) for c in chunks)
        if max_relevance >= 2:
            return UncertaintyStatus.VERIFIED
        else:
            return UncertaintyStatus.PARTIALLY_VERIFIED
