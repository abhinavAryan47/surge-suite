from typing import List, Dict, Any, Optional
from django.db.models import Q
from task.models import InstitutionalPolicy

RESOURCE_ALIASES = {
    "certificate": "certificate_requests",
    "maintenance": "maintenance_tickets",
    "laboratory": "laboratory_bookings",
    "grievance": "grievance_escalation",
}

class PolicyEngine:
    """
    Evaluates institutional policies for action calls in a workspace.
    Supports effects: ALLOW, DENY, REQUIRES_APPROVAL, ESCALATE.
    Applies priority precedence and resolves conflicts safely as ESCALATE.
    """

    @staticmethod
    def _target_resource_matches(target: str, action_type: str) -> bool:
        if target == "*":
            return True

        normalized_target = target.lower()
        
        # If it ends with ".*", resolve the prefix
        if normalized_target.endswith(".*"):
            prefix = normalized_target[:-2]
            resolved_prefix = RESOURCE_ALIASES.get(prefix, prefix)
            normalized_target = f"{resolved_prefix}.*"
        else:
            # If target matches one of the aliases, it should match the entire server as a wildcard
            if normalized_target in RESOURCE_ALIASES:
                normalized_target = f"{RESOURCE_ALIASES[normalized_target]}.*"

        # Match wildcard
        if normalized_target.endswith(".*"):
            prefix = normalized_target[:-2]
            return action_type.startswith(prefix)

        # Match exact action
        return normalized_target == action_type.lower()

    @staticmethod
    def _policy_matches(policy: InstitutionalPolicy, user, action_type: str, resource_data: dict) -> bool:
        rules = policy.rules or {}

        # 1. Target Resource check
        target = rules.get("target_resource", "*")
        if not PolicyEngine._target_resource_matches(target, action_type):
            return False

        # 2. User constraints (e.g. username filter)
        username_contains = rules.get("username_contains")
        if username_contains:
            if username_contains.lower() not in user.username.lower():
                return False

        # 3. Role constraints
        roles = rules.get("roles") or rules.get("target_roles") or rules.get("applicable_roles")
        if roles and isinstance(roles, list):
            user_role = "OWNER" if policy.workspace.owner == user else (
                policy.workspace.memberships.filter(user=user).values_list('role', flat=True).first() or "ANONYMOUS"
            )
            if user_role not in roles:
                return False

        # 4. Resource Data checks
        # Matches specific fields like lab_name, certificate_type, etc.
        reserved_keys = {"target_resource", "username_contains", "roles", "target_roles", "applicable_roles", "allowed_roles", "denied_roles", "min_role"}
        for key, expected_val in rules.items():
            if key in reserved_keys:
                continue
            if key in resource_data:
                val = resource_data[key]
                if isinstance(val, str) and isinstance(expected_val, str):
                    if val.lower() != expected_val.lower():
                        return False
                elif val != expected_val:
                    return False
            else:
                # Expected key is missing from arguments
                return False

        return True

    @staticmethod
    def evaluate(workspace, user, action_type: str, resource_data: dict) -> str:
        """
        Evaluates policies for a workspace/user/action.
        Resolves priorities and conflicts.
        """
        if not workspace.policy_engine_enabled:
            return "ALLOW"

        # Load all policies for this workspace
        policies = InstitutionalPolicy.objects.filter(workspace=workspace)
        if not policies.exists():
            return "ALLOW"

        matching_policies = []
        for policy in policies:
            if PolicyEngine._policy_matches(policy, user, action_type, resource_data):
                matching_policies.append(policy)

        if not matching_policies:
            return "ALLOW"

        # Sort matching policies by priority descending
        matching_policies.sort(key=lambda p: p.priority, reverse=True)

        highest_priority = matching_policies[0].priority
        highest_priority_policies = [p for p in matching_policies if p.priority == highest_priority]

        # Check for conflicts (different effects at the highest priority level)
        effects = set(p.effect for p in highest_priority_policies)
        if len(effects) > 1:
            # Safe conflict resolution -> ESCALATE
            return "ESCALATE"

        return highest_priority_policies[0].effect
