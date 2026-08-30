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
from task.models import GrievanceEscalation

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
                        "serverInfo": {"name": "GrievanceEscalationServer", "version": "1.0"}
                    }
                }
            elif method == "tools/list":
                res = {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {
                        "tools": [
                            {
                                "name": "create_grievance",
                                "description": "Create or raise a new grievance/complaint.",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "subject": {"type": "string", "description": "Subject of the grievance"},
                                        "description": {"type": "string", "description": "Detailed description of the issue"},
                                        "department": {"type": "string", "description": "Target department for the grievance (optional)"}
                                    },
                                    "required": ["subject", "description"]
                                }
                            },
                            {
                                "name": "list_grievances",
                                "description": "List all grievances filed by the user.",
                                "inputSchema": {"type": "object", "properties": {}}
                            },
                            {
                                "name": "get_grievance",
                                "description": "Get details of a specific grievance.",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "grievance_id": {"type": "string", "description": "Grievance reference ID"}
                                    },
                                    "required": ["grievance_id"]
                                }
                            },
                            {
                                "name": "update_grievance",
                                "description": "Update details or description of an existing grievance.",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "grievance_id": {"type": "string", "description": "Grievance reference ID"},
                                        "description": {"type": "string", "description": "Updated details"}
                                    },
                                    "required": ["grievance_id"]
                                }
                            },
                            {
                                "name": "escalate_grievance",
                                "description": "Escalate a grievance to a higher authority (Admin/Owner or creator).",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "grievance_id": {"type": "string", "description": "Grievance reference ID"},
                                        "reason": {"type": "string", "description": "Reason for escalation"}
                                    },
                                    "required": ["grievance_id"]
                                }
                            },
                            {
                                "name": "get_grievance_status",
                                "description": "Get current status of a grievance.",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "grievance_id": {"type": "string", "description": "Grievance reference ID"}
                                    },
                                    "required": ["grievance_id"]
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
                        elif tool_name == "create_grievance":
                            if user_role == "VIEWER":
                                result = {"content": [{"type": "text", "text": "Permission Denied: Read-only VIEWER role cannot raise grievances."}], "isError": True}
                            else:
                                subject = arguments.get("subject")
                                description = arguments.get("description")
                                department = arguments.get("department", "")
                                
                                grievance = GrievanceEscalation.objects.create(
                                    workspace=workspace,
                                    user=user,
                                    subject=subject,
                                    description=description,
                                    department=department,
                                    status='OPEN'
                                )
                                text = f"Successfully raised grievance.\nID: {grievance.id}\nSubject: {grievance.subject}\nDepartment: {grievance.department}\nStatus: {grievance.status}"
                                result = {"content": [{"type": "text", "text": text}]}
                        elif tool_name == "list_grievances":
                            if user_role in ['ADMIN', 'OWNER']:
                                grievances = GrievanceEscalation.objects.filter(workspace=workspace)
                            else:
                                grievances = GrievanceEscalation.objects.filter(workspace=workspace, user=user)
                            if grievances.exists():
                                lines = [f"- {g.id}: {g.subject} [{g.status}] (by @{g.user.username})" for g in grievances]
                                text = "Grievances:\n" + "\n".join(lines)
                            else:
                                text = "No grievances found."
                            result = {"content": [{"type": "text", "text": text}]}
                        elif tool_name in ["get_grievance", "get_grievance_status"]:
                            grievance_id = arguments.get("grievance_id")
                            try:
                                if user_role in ['ADMIN', 'OWNER']:
                                    g = GrievanceEscalation.objects.get(id=grievance_id, workspace=workspace)
                                else:
                                    g = GrievanceEscalation.objects.get(id=grievance_id, workspace=workspace, user=user)
                                text = f"Grievance Details:\nID: {g.id}\nSubject: {g.subject}\nDescription: {g.description}\nDepartment: {g.department}\nStatus: {g.status}\nCreated: {g.created_at.isoformat()}"
                            except (GrievanceEscalation.DoesNotExist, ValueError):
                                text = f"Error: Grievance with ID '{grievance_id}' not found."
                            result = {"content": [{"type": "text", "text": text}]}
                        elif tool_name == "update_grievance":
                            if user_role == "VIEWER":
                                result = {"content": [{"type": "text", "text": "Permission Denied: Read-only VIEWER role cannot update grievances."}], "isError": True}
                            else:
                                grievance_id = arguments.get("grievance_id")
                                description = arguments.get("description")
                                try:
                                    if user_role in ['ADMIN', 'OWNER']:
                                        g = GrievanceEscalation.objects.get(id=grievance_id, workspace=workspace)
                                    else:
                                        g = GrievanceEscalation.objects.get(id=grievance_id, workspace=workspace, user=user)
                                    g.description = description
                                    g.save()
                                    text = f"Successfully updated grievance {g.id} description."
                                except (GrievanceEscalation.DoesNotExist, ValueError):
                                    text = f"Error: Grievance with ID '{grievance_id}' not found."
                                result = {"content": [{"type": "text", "text": text}]}
                        elif tool_name == "escalate_grievance":
                            if user_role == "VIEWER":
                                result = {"content": [{"type": "text", "text": "Permission Denied: Read-only VIEWER role cannot escalate grievances."}], "isError": True}
                            else:
                                grievance_id = arguments.get("grievance_id")
                                reason = arguments.get("reason", "")
                                try:
                                    if user_role in ['ADMIN', 'OWNER']:
                                        g = GrievanceEscalation.objects.get(id=grievance_id, workspace=workspace)
                                    else:
                                        g = GrievanceEscalation.objects.get(id=grievance_id, workspace=workspace, user=user)
                                    g.status = 'ESCALATED'
                                    g.description += f"\n[Escalation Reason: {reason}]"
                                    g.save()
                                    text = f"Successfully escalated grievance {g.id}."
                                except (GrievanceEscalation.DoesNotExist, ValueError):
                                    text = f"Error: Grievance with ID '{grievance_id}' not found."
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
