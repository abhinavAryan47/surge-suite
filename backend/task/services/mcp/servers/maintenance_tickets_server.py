import os
import sys
import json
import django

# Initialize Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
try:
    django.setup()
except Exception as e:
    sys.stderr.write(f"Django setup error: {str(e)}\n")
    sys.stderr.flush()

from django.contrib.auth.models import User
from workspace.models import Workspace
from task.models import MaintenanceTicket

def main():
    user_id = os.environ.get("SURGE_USER_ID")
    workspace_id = os.environ.get("SURGE_WORKSPACE_ID")
    user_role = os.environ.get("SURGE_USER_ROLE", "MEMBER")

    for line in sys.stdin:
        try:
            line_str = line.strip()
            if not line_str:
                continue
            req = json.loads(line_str)
            method = req.get("method")
            msg_id = req.get("id")
            
            if method == "initialize":
                res = {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {"tools": {}},
                        "serverInfo": {"name": "MaintenanceTicketsServer", "version": "1.0"}
                    }
                }
            elif method == "tools/list":
                res = {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {
                        "tools": [
                            {
                                "name": "create_maintenance_ticket",
                                "description": "Create a new maintenance or service request ticket for room/facility issues.",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "category": {"type": "string", "description": "Category of maintenance (e.g. electrical, plumbing, HVAC)"},
                                        "description": {"type": "string", "description": "Detailed description of the issue"},
                                        "location": {"type": "string", "description": "Location of the issue (e.g. Room 102, Hostel B)"}
                                    },
                                    "required": ["category", "description", "location"]
                                }
                            },
                            {
                                "name": "list_maintenance_tickets",
                                "description": "List all maintenance tickets.",
                                "inputSchema": {"type": "object", "properties": {}}
                            },
                            {
                                "name": "get_maintenance_ticket",
                                "description": "Get details of a specific maintenance ticket.",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "ticket_id": {"type": "string", "description": "Ticket reference ID"}
                                    },
                                    "required": ["ticket_id"]
                                }
                            },
                            {
                                "name": "update_maintenance_ticket",
                                "description": "Update details or description of a maintenance ticket.",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "ticket_id": {"type": "string", "description": "Ticket reference ID"},
                                        "description": {"type": "string", "description": "Updated details"}
                                    },
                                    "required": ["ticket_id"]
                                }
                            },
                            {
                                "name": "close_maintenance_ticket",
                                "description": "Close a maintenance ticket with a closure reason (Admin/Owner only).",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "ticket_id": {"type": "string", "description": "Ticket reference ID"},
                                        "reason": {"type": "string", "description": "Reason for closure"}
                                    },
                                    "required": ["ticket_id"]
                                }
                            },
                            {
                                "name": "get_ticket_status",
                                "description": "Get current status of a maintenance ticket.",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "ticket_id": {"type": "string", "description": "Ticket reference ID"}
                                    },
                                    "required": ["ticket_id"]
                                }
                            }
                        ]
                    }
                }
            elif method == "tools/call":
                params = req.get("params", {})
                tool_name = params.get("name")
                arguments = params.get("arguments", {})

                if not user_id or not workspace_id:
                    result = {"content": [{"type": "text", "text": "Error: User or Workspace context is missing in environment variables."}], "isError": True}
                else:
                    try:
                        workspace = Workspace.objects.get(id=workspace_id)
                        user = User.objects.get(id=user_id)
                        
                        if not workspace.workflow_execution_enabled:
                            result = {"content": [{"type": "text", "text": "Error: Institutional workflow execution is disabled for this workspace."}], "isError": True}
                        elif tool_name == "create_maintenance_ticket":
                            if user_role == "VIEWER":
                                result = {"content": [{"type": "text", "text": "Permission Denied: Read-only VIEWER role cannot create maintenance tickets."}], "isError": True}
                            else:
                                category = arguments.get("category")
                                description = arguments.get("description")
                                location = arguments.get("location")
                                
                                ticket = MaintenanceTicket.objects.create(
                                    workspace=workspace,
                                    user=user,
                                    category=category,
                                    description=description,
                                    location=location,
                                    status='OPEN'
                                )
                                text = f"Successfully created maintenance ticket.\nID: {ticket.id}\nCategory: {ticket.category}\nLocation: {ticket.location}\nStatus: {ticket.status}"
                                result = {"content": [{"type": "text", "text": text}]}
                        elif tool_name == "list_maintenance_tickets":
                            if user_role in ['ADMIN', 'OWNER']:
                                tickets = MaintenanceTicket.objects.filter(workspace=workspace)
                            else:
                                tickets = MaintenanceTicket.objects.filter(workspace=workspace, user=user)
                            if tickets.exists():
                                lines = [f"- {t.id}: {t.category} at {t.location} [{t.status}] (by @{t.user.username})" for t in tickets]
                                text = "Maintenance tickets:\n" + "\n".join(lines)
                            else:
                                text = "No maintenance tickets found."
                            result = {"content": [{"type": "text", "text": text}]}
                        elif tool_name in ["get_maintenance_ticket", "get_ticket_status"]:
                            ticket_id = arguments.get("ticket_id")
                            try:
                                if user_role in ['ADMIN', 'OWNER']:
                                    t = MaintenanceTicket.objects.get(id=ticket_id, workspace=workspace)
                                else:
                                    t = MaintenanceTicket.objects.get(id=ticket_id, workspace=workspace, user=user)
                                text = f"Maintenance Ticket Details:\nID: {t.id}\nCategory: {t.category}\nDescription: {t.description}\nLocation: {t.location}\nStatus: {t.status}\nCreated: {t.created_at.isoformat()}"
                            except (MaintenanceTicket.DoesNotExist, ValueError):
                                text = f"Error: Maintenance ticket with ID '{ticket_id}' not found."
                            result = {"content": [{"type": "text", "text": text}]}
                        elif tool_name == "update_maintenance_ticket":
                            if user_role == "VIEWER":
                                result = {"content": [{"type": "text", "text": "Permission Denied: Read-only VIEWER role cannot update maintenance tickets."}], "isError": True}
                            else:
                                ticket_id = arguments.get("ticket_id")
                                description = arguments.get("description")
                                try:
                                    if user_role in ['ADMIN', 'OWNER']:
                                        t = MaintenanceTicket.objects.get(id=ticket_id, workspace=workspace)
                                    else:
                                        t = MaintenanceTicket.objects.get(id=ticket_id, workspace=workspace, user=user)
                                    t.description = description
                                    t.save()
                                    text = f"Successfully updated maintenance ticket {t.id} description."
                                except (MaintenanceTicket.DoesNotExist, ValueError):
                                    text = f"Error: Maintenance ticket with ID '{ticket_id}' not found."
                                result = {"content": [{"type": "text", "text": text}]}
                        elif tool_name == "close_maintenance_ticket":
                            if user_role not in ['ADMIN', 'OWNER']:
                                result = {"content": [{"type": "text", "text": "Permission Denied: Only ADMIN or OWNER can close maintenance tickets."}], "isError": True}
                            else:
                                ticket_id = arguments.get("ticket_id")
                                reason = arguments.get("reason", "")
                                try:
                                    t = MaintenanceTicket.objects.get(id=ticket_id, workspace=workspace)
                                    t.status = 'CLOSED'
                                    t.description += f"\n[Closure Reason: {reason}]"
                                    t.save()
                                    text = f"Successfully closed maintenance ticket {t.id}."
                                except (MaintenanceTicket.DoesNotExist, ValueError):
                                    text = f"Error: Maintenance ticket with ID '{ticket_id}' not found."
                                result = {"content": [{"type": "text", "text": text}]}
                        else:
                            result = {"content": [{"type": "text", "text": f"Error: Unknown tool '{tool_name}'"}], "isError": True}
                    except Workspace.DoesNotExist:
                        result = {"content": [{"type": "text", "text": "Error: Workspace not found."}], "isError": True}
                    except User.DoesNotExist:
                        result = {"content": [{"type": "text", "text": "Error: User not found."}], "isError": True}
                    except Exception as ex:
                        result = {"content": [{"type": "text", "text": f"Error: {str(ex)}"}], "isError": True}

                res = {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": result
                }
            else:
                res = {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {}
                }
                
            sys.stdout.write(json.dumps(res) + "\n")
            sys.stdout.flush()
        except Exception as e:
            sys.stderr.write(f"Error: {str(e)}\n")
            sys.stderr.flush()

if __name__ == "__main__":
    main()
