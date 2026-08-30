import json
from .client import MCPClient
from .config import MCP_SERVER_CONFIGS

ROLE_HIERARCHY = {
    "VIEWER": 1,
    "MEMBER": 2,
    "ADMIN": 3,
    "OWNER": 4,
}

TOOL_MINIMUM_ROLES = {
    # Administrative & Highly Sensitive Tools -> ADMIN or OWNER
    "maintenance_tickets.close_maintenance_ticket": "ADMIN",
    "grievance_escalation.escalate_grievance": "ADMIN",
    "filesystem.write_file": "ADMIN",
    "builtin.database.query": "ADMIN",
    "bash.execute": "ADMIN",

    # Mutating / Creation Tools -> MEMBER or higher (blocks VIEWER)
    "certificate_requests.create_certificate_request": "MEMBER",
    "certificate_requests.cancel_certificate_request": "MEMBER",
    "grievance_escalation.create_grievance": "MEMBER",
    "grievance_escalation.update_grievance": "MEMBER",
    "maintenance_tickets.create_maintenance_ticket": "MEMBER",
    "maintenance_tickets.update_maintenance_ticket": "MEMBER",
    "laboratory_bookings.create_lab_booking": "MEMBER",
    "laboratory_bookings.cancel_lab_booking": "MEMBER",

    # Read-Only Inspection Tools -> Open to all members including VIEWER
    "certificate_requests.list_certificate_requests": "VIEWER",
    "certificate_requests.get_certificate_request": "VIEWER",
    "certificate_requests.get_certificate_status": "VIEWER",
    "grievance_escalation.list_grievances": "VIEWER",
    "grievance_escalation.get_grievance": "VIEWER",
    "grievance_escalation.get_grievance_status": "VIEWER",
    "maintenance_tickets.list_maintenance_tickets": "VIEWER",
    "maintenance_tickets.get_maintenance_ticket": "VIEWER",
    "maintenance_tickets.get_ticket_status": "VIEWER",
    "laboratory_bookings.list_laboratories": "VIEWER",
    "laboratory_bookings.get_lab_availability": "VIEWER",
    "laboratory_bookings.get_lab_booking": "VIEWER",
    "laboratory_bookings.list_user_bookings": "VIEWER",
    "filesystem.read_file": "VIEWER",
    "filesystem.list_directory": "VIEWER",
    "search.search_documents": "VIEWER",
}

class MCPRegistry:
    def __init__(self, user=None, workspace=None):
        self.user = user
        self.workspace = workspace
        self.clients = {}
        self.tools = {} # Maps prefixed_name -> (client, tool_info)

    def _resolve_user_role(self, user=None, workspace=None) -> str:
        u = user or self.user
        w = workspace or self.workspace
        if not u and not w:
            return "ADMIN"
        if not u or not w:
            return "ANONYMOUS"
        if w.owner == u:
            return "OWNER"
        membership = w.memberships.filter(user=u).first()
        if membership:
            return membership.role
        return "ANONYMOUS"

    def initialize_servers(self, server_names=None, user=None):
        import os
        resolved_user = user or self.user
        resolved_workspace = self.workspace

        # Build base environment
        base_env = {}
        if resolved_user:
            base_env["SURGE_USER_ID"] = str(resolved_user.id)
        if resolved_workspace:
            base_env["SURGE_WORKSPACE_ID"] = str(resolved_workspace.id)

        user_role = self._resolve_user_role(resolved_user, resolved_workspace)
        base_env["SURGE_USER_ROLE"] = user_role

        import sys
        backend_path = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
        base_env["DJANGO_SETTINGS_MODULE"] = "config.settings"
        base_env["PYTHONPATH"] = backend_path

        # 1. Initialize built-in servers
        for cfg in MCP_SERVER_CONFIGS:
            name = cfg["name"]
            if server_names is not None and name not in server_names:
                continue
            command = cfg["command"]
            try:
                # Merge custom environment
                env_copy = base_env.copy()
                client = MCPClient(name, command, env_copy)
                client.start()
                
                # Perform initialize handshake
                init_res = client.send_request("initialize", {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "SurgeSuiteClient", "version": "1.0"}
                })
                
                if "error" in init_res:
                    print(f"Error initializing MCP server '{name}': {init_res['error']}")
                    client.stop()
                    continue

                # Send notifications/initialized notification
                if client.process and client.process.stdin:
                    client.process.stdin.write(json.dumps({
                        "jsonrpc": "2.0",
                        "method": "notifications/initialized"
                    }) + "\n")
                    client.process.stdin.flush()

                self.clients[name] = client
            except Exception as e:
                print(f"Failed to startup MCP server '{name}': {str(e)}")

        # 2. Initialize custom enabled servers
        if resolved_user:
            from task.models import UserMCPServer
            custom_servers = UserMCPServer.objects.filter(user=resolved_user, is_enabled=True)
            for srv in custom_servers:
                name = srv.name
                if server_names is not None and name not in server_names:
                    continue
                if name in self.clients:
                    continue
                command = srv.configuration.get("command", [])
                args = srv.configuration.get("args", [])
                full_command = command + (args or [])
                env = srv.configuration.get("env", {})
                try:
                    env_copy = base_env.copy()
                    env_copy.update(env)
                    client = MCPClient(name, full_command, env_copy)
                    client.start()
                    
                    init_res = client.send_request("initialize", {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {},
                        "clientInfo": {"name": "SurgeSuiteClient", "version": "1.0"}
                    })
                    
                    if "error" in init_res:
                        print(f"Error initializing custom MCP server '{name}': {init_res['error']}")
                        client.stop()
                        continue
                        
                    if client.process and client.process.stdin:
                        client.process.stdin.write(json.dumps({
                            "jsonrpc": "2.0",
                            "method": "notifications/initialized"
                        }) + "\n")
                        client.process.stdin.flush()
                        
                    self.clients[name] = client
                except Exception as e:
                    print(f"Failed to startup custom MCP server '{name}': {str(e)}")

    def discover_tools(self) -> list:
        discovered = []
        for name, client in self.clients.items():
            try:
                res = client.send_request("tools/list")
                if "error" in res:
                    print(f"Error getting tools for MCP server '{name}': {res['error']}")
                    continue
                
                result_payload = res.get("result", {})
                tools_list = result_payload.get("tools", [])
                for t in tools_list:
                    prefixed_name = f"{name}.{t['name']}"
                    tool_info = {
                        "name": prefixed_name,
                        "server": name,
                        "description": t.get("description", ""),
                        "input_schema": t.get("inputSchema", {}),
                        "type": "mcp",
                        "original_name": t["name"]
                    }
                    self.tools[prefixed_name] = (client, tool_info)
                    discovered.append(tool_info)
            except Exception as e:
                print(f"Error discovering tools for MCP server '{name}': {str(e)}")
        return discovered

    def execute_tool(self, prefixed_name: str, arguments: dict, approved: bool = False) -> dict:
        if prefixed_name not in self.tools:
            return {"error": f"Tool '{prefixed_name}' not found in MCP registry."}

        # 1. Check Role-Based Access Control (RBAC)
        user_role = self._resolve_user_role(self.user, self.workspace)
        min_required_role = TOOL_MINIMUM_ROLES.get(prefixed_name)
        if not min_required_role:
            base_tool_name = prefixed_name.split(".")[-1]
            if any(base_tool_name.startswith(verb) for verb in ["close_", "escalate_", "delete_", "destroy_", "drop_", "write_"]):
                min_required_role = "ADMIN"
            elif any(base_tool_name.startswith(verb) for verb in ["create_", "update_", "add_", "cancel_", "book_"]):
                min_required_role = "MEMBER"
            else:
                min_required_role = "VIEWER"

        user_level = ROLE_HIERARCHY.get(user_role, 0)
        required_level = ROLE_HIERARCHY.get(min_required_role, 2)

        if user_level < required_level:
            return {
                "error": f"Permission Denied: Users with role '{user_role}' are not authorized to execute '{prefixed_name}'. This action requires '{min_required_role}' or higher privilege."
            }

        # 2. Check for missing parameters
        from task.services.uncertainty_detector import UncertaintyDetector
        missing = UncertaintyDetector.check_missing_info(prefixed_name, arguments)
        if missing:
            return {"error": f"Missing required parameters: {', '.join(missing)}. Please ask the user to clarify."}

        # 3. Check Policy Engine
        policy_effect = None
        if self.user and self.workspace:
            from task.services.policy_engine import PolicyEngine
            policy_effect = PolicyEngine.evaluate(
                workspace=self.workspace,
                user=self.user,
                action_type=prefixed_name,
                resource_data=arguments
            )
            if policy_effect == "DENY":
                return {"error": f"Denied by institutional policy: Action '{prefixed_name}' is not allowed."}
            elif policy_effect == "ESCALATE":
                return {"error": f"Escalated: Action '{prefixed_name}' was escalated by policy engine due to conflicts or safety rules."}
            elif policy_effect == "REQUIRES_APPROVAL":
                if not approved:
                    from task.services.capability_registry import ApprovalRequiredException
                    cmd_str = f"mcp:{prefixed_name}({json.dumps(arguments)})"
                    reason = f"Execution of the MCP tool '{prefixed_name}' requires human authorization based on institutional policies."
                    raise ApprovalRequiredException(command=cmd_str, reason=reason, risk="HIGH")

        # 4. Default approval enforcement for mutating institutional tools if not explicitly approved
        if not approved and policy_effect != "ALLOW":
            tools_requiring_approval = {
                "certificate_requests.create_certificate_request",
                "certificate_requests.cancel_certificate_request",
                "maintenance_tickets.create_maintenance_ticket",
                "maintenance_tickets.update_maintenance_ticket",
                "maintenance_tickets.close_maintenance_ticket",
                "laboratory_bookings.create_lab_booking",
                "laboratory_bookings.cancel_lab_booking",
                "grievance_escalation.create_grievance",
                "grievance_escalation.update_grievance",
                "grievance_escalation.escalate_grievance",
            }
            if prefixed_name in tools_requiring_approval:
                from task.services.capability_registry import ApprovalRequiredException
                cmd_str = f"mcp:{prefixed_name}({json.dumps(arguments)})"
                reason = f"Execution of the MCP tool '{prefixed_name}' requires human authorization."
                raise ApprovalRequiredException(command=cmd_str, reason=reason, risk="HIGH")

        client, tool_info = self.tools[prefixed_name]
        try:
            res = client.send_request("tools/call", {
                "name": tool_info["original_name"],
                "arguments": arguments
            })
            
            if "error" in res:
                return {"error": res["error"]}

            result_payload = res.get("result", {})
            if result_payload.get("isError"):
                content_list = result_payload.get("content", [])
                error_msg = content_list[0].get("text") if content_list else "Unknown MCP server execution error."
                return {"error": error_msg}

            content_list = result_payload.get("content", [])
            if content_list and content_list[0].get("type") == "text":
                return {"result": content_list[0].get("text")}
            
            return {"error": "Invalid response payload format from MCP server."}
        except Exception as e:
            return {"error": f"Exception executing MCP tool: {str(e)}"}

    def shutdown(self):
        for name, client in self.clients.items():
            try:
                client.stop()
            except Exception as e:
                print(f"Error stopping client '{name}': {str(e)}")
        self.clients.clear()
        self.tools.clear()
class_name = "MCPRegistry"


def get_all_configs(user=None):
    """
    Returns all MCP configurations, including both built-ins and custom user-configured servers
    (both enabled and disabled).
    """
    configs = []
    
    # 1. Add built-ins
    for cfg in MCP_SERVER_CONFIGS:
        configs.append({
            "name": cfg["name"],
            "command": cfg["command"],
            "env": {},
            "is_custom": False,
            "is_enabled": True,
            "tools": cfg.get("tools", [])
        })
        
    # 2. Add user's custom servers
    if user:
        from task.models import UserMCPServer
        custom_servers = UserMCPServer.objects.filter(user=user)
        for srv in custom_servers:
            configs.append({
                "name": srv.name,
                "command": srv.configuration.get("command", []),
                "env": srv.configuration.get("env", {}),
                "is_custom": True,
                "is_enabled": srv.is_enabled,
                "tools": srv.tools_metadata or []
            })
            
    return configs
