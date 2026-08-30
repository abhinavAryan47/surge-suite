import os
import sys
import json
import datetime
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
from task.models import LaboratoryBooking

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
                        "serverInfo": {"name": "LaboratoryBookingsServer", "version": "1.0"}
                    }
                }
            elif method == "tools/list":
                res = {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {
                        "tools": [
                            {
                                "name": "list_laboratories",
                                "description": "List all laboratories available for bookings.",
                                "inputSchema": {"type": "object", "properties": {}}
                            },
                            {
                                "name": "get_lab_availability",
                                "description": "Inspect available time slots for a laboratory on a given date.",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "lab_name": {"type": "string", "description": "Name of the laboratory"},
                                        "date": {"type": "string", "description": "Date in YYYY-MM-DD format"}
                                    },
                                    "required": ["lab_name", "date"]
                                }
                            },
                            {
                                "name": "create_lab_booking",
                                "description": "Book a laboratory slot for a specific time range.",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "lab_name": {"type": "string", "description": "Name of the laboratory"},
                                        "date": {"type": "string", "description": "Date in YYYY-MM-DD format"},
                                        "start_time": {"type": "string", "description": "Start time (e.g. 14:00)"},
                                        "end_time": {"type": "string", "description": "End time (e.g. 16:00)"}
                                    },
                                    "required": ["lab_name", "date", "start_time", "end_time"]
                                }
                            },
                            {
                                "name": "get_lab_booking",
                                "description": "Get details of a specific laboratory booking.",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "booking_id": {"type": "string", "description": "Booking reference ID"}
                                    },
                                    "required": ["booking_id"]
                                }
                            },
                            {
                                "name": "cancel_lab_booking",
                                "description": "Cancel an existing laboratory booking.",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "booking_id": {"type": "string", "description": "Booking reference ID"}
                                    },
                                    "required": ["booking_id"]
                                }
                            },
                            {
                                "name": "list_user_bookings",
                                "description": "List all laboratory bookings made by the user.",
                                "inputSchema": {"type": "object", "properties": {}}
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
                        elif tool_name == "list_laboratories":
                            text = "Available Laboratories:\n- Chemistry Lab\n- Physics Lab\n- Computer Science Lab\n- Biology Lab"
                            result = {"content": [{"type": "text", "text": text}]}
                        elif tool_name == "get_lab_availability":
                            lab_name = arguments.get("lab_name")
                            date_str = arguments.get("date")
                            try:
                                target_date = datetime.datetime.strptime(date_str, "%Y-%m-%d").date()
                                bookings = LaboratoryBooking.objects.filter(workspace=workspace, lab_name__iexact=lab_name, date=target_date, status='CONFIRMED')
                                if bookings.exists():
                                    lines = [f"- Booked: {b.start_time.strftime('%H:%M')} to {b.end_time.strftime('%H:%M')}" for b in bookings]
                                    text = f"Availability for {lab_name} on {date_str}:\n" + "\n".join(lines)
                                else:
                                    text = f"All time slots are currently available for {lab_name} on {date_str}."
                            except ValueError:
                                text = f"Error: Invalid date format '{date_str}'. Use YYYY-MM-DD."
                            result = {"content": [{"type": "text", "text": text}]}
                        elif tool_name == "create_lab_booking":
                            if user_role == "VIEWER":
                                result = {"content": [{"type": "text", "text": "Permission Denied: Read-only VIEWER role cannot book laboratories."}], "isError": True}
                            else:
                                lab_name = arguments.get("lab_name")
                                date_str = arguments.get("date")
                                start_str = arguments.get("start_time")
                                end_str = arguments.get("end_time")
                                
                                try:
                                    target_date = datetime.datetime.strptime(date_str, "%Y-%m-%d").date()
                                    start_t = datetime.datetime.strptime(start_str, "%H:%M").time()
                                    end_t = datetime.datetime.strptime(end_str, "%H:%M").time()
                                    
                                    if start_t >= end_t:
                                        text = "Error: Booking start_time must be earlier than end_time."
                                    else:
                                        # Check overlaps
                                        overlapping = LaboratoryBooking.objects.filter(
                                            workspace=workspace,
                                            lab_name__iexact=lab_name,
                                            date=target_date,
                                            status='CONFIRMED',
                                            start_time__lt=end_t,
                                            end_time__gt=start_t
                                        )
                                        if overlapping.exists():
                                            text = f"Error: The requested time slot conflicts with an existing booking in {lab_name}."
                                        else:
                                            booking = LaboratoryBooking.objects.create(
                                                workspace=workspace,
                                                user=user,
                                                lab_name=lab_name,
                                                date=target_date,
                                                start_time=start_t,
                                                end_time=end_t,
                                                status='CONFIRMED'
                                            )
                                            text = f"Successfully created laboratory booking.\nID: {booking.id}\nLab: {booking.lab_name}\nDate: {booking.date}\nTime: {booking.start_time.strftime('%H:%M')} - {booking.end_time.strftime('%H:%M')}\nStatus: {booking.status}"
                                except ValueError:
                                    text = "Error: Invalid date/time formatting. Use YYYY-MM-DD and HH:MM."
                                result = {"content": [{"type": "text", "text": text}]}
                        elif tool_name == "get_lab_booking":
                            booking_id = arguments.get("booking_id")
                            try:
                                if user_role in ['ADMIN', 'OWNER']:
                                    b = LaboratoryBooking.objects.get(id=booking_id, workspace=workspace)
                                else:
                                    b = LaboratoryBooking.objects.get(id=booking_id, workspace=workspace, user=user)
                                text = f"Laboratory Booking Details:\nID: {b.id}\nLab: {b.lab_name}\nDate: {b.date.isoformat()}\nTime: {b.start_time.strftime('%H:%M')} - {b.end_time.strftime('%H:%M')}\nStatus: {b.status}"
                            except (LaboratoryBooking.DoesNotExist, ValueError):
                                text = f"Error: Booking with ID '{booking_id}' not found."
                            result = {"content": [{"type": "text", "text": text}]}
                        elif tool_name == "cancel_lab_booking":
                            if user_role == "VIEWER":
                                result = {"content": [{"type": "text", "text": "Permission Denied: Read-only VIEWER role cannot cancel lab bookings."}], "isError": True}
                            else:
                                booking_id = arguments.get("booking_id")
                                try:
                                    if user_role in ['ADMIN', 'OWNER']:
                                        b = LaboratoryBooking.objects.get(id=booking_id, workspace=workspace)
                                    else:
                                        b = LaboratoryBooking.objects.get(id=booking_id, workspace=workspace, user=user)
                                    if b.status != 'CANCELLED':
                                        b.status = 'CANCELLED'
                                        b.save()
                                        text = f"Successfully cancelled booking {b.id}."
                                    else:
                                        text = f"Booking {b.id} is already cancelled."
                                except (LaboratoryBooking.DoesNotExist, ValueError):
                                    text = f"Error: Booking with ID '{booking_id}' not found."
                                result = {"content": [{"type": "text", "text": text}]}
                        elif tool_name == "list_user_bookings":
                            if user_role in ['ADMIN', 'OWNER']:
                                bookings = LaboratoryBooking.objects.filter(workspace=workspace)
                            else:
                                bookings = LaboratoryBooking.objects.filter(workspace=workspace, user=user)
                            if bookings.exists():
                                lines = [f"- {b.id}: {b.lab_name} on {b.date.isoformat()} ({b.start_time.strftime('%H:%M')}-{b.end_time.strftime('%H:%M')}) [{b.status}] (by @{b.user.username})" for b in bookings]
                                text = "Laboratory bookings:\n" + "\n".join(lines)
                            else:
                                text = "No laboratory bookings found."
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
