import sys
import os
from django.conf import settings

# Active python interpreter running this django process
PYTHON_EXECUTABLE = sys.executable

# Absolute paths to our subprocess python MCP servers
FILESYSTEM_SERVER_PATH = os.path.abspath(os.path.join(
    settings.BASE_DIR, 'task', 'services', 'mcp', 'servers', 'filesystem_server.py'
))

SEARCH_SERVER_PATH = os.path.abspath(os.path.join(
    settings.BASE_DIR, 'task', 'services', 'mcp', 'servers', 'search_server.py'
))

CERTIFICATE_REQUESTS_SERVER_PATH = os.path.abspath(os.path.join(
    settings.BASE_DIR, 'task', 'services', 'mcp', 'servers', 'certificate_requests_server.py'
))

MAINTENANCE_TICKETS_SERVER_PATH = os.path.abspath(os.path.join(
    settings.BASE_DIR, 'task', 'services', 'mcp', 'servers', 'maintenance_tickets_server.py'
))

LABORATORY_BOOKINGS_SERVER_PATH = os.path.abspath(os.path.join(
    settings.BASE_DIR, 'task', 'services', 'mcp', 'servers', 'laboratory_bookings_server.py'
))

GRIEVANCE_ESCALATION_SERVER_PATH = os.path.abspath(os.path.join(
    settings.BASE_DIR, 'task', 'services', 'mcp', 'servers', 'grievance_escalation_server.py'
))

# Dynamically discoverable servers config
MCP_SERVER_CONFIGS = [
    {
        "name": "filesystem",
        "command": [PYTHON_EXECUTABLE, FILESYSTEM_SERVER_PATH],
        "tools": [
            {
                "name": "list_directory",
                "description": "List files and directories in the workspace root or subdirectories."
            }
        ]
    },
    {
        "name": "search",
        "command": [PYTHON_EXECUTABLE, SEARCH_SERVER_PATH],
        "tools": [
            {
                "name": "search_web",
                "description": "Search the web for up-to-date information."
            }
        ]
    },
    {
        "name": "certificate_requests",
        "command": [PYTHON_EXECUTABLE, CERTIFICATE_REQUESTS_SERVER_PATH],
        "tools": [
            {"name": "create_certificate_request", "description": "Create a new certificate request (e.g. Migration, Transfer, Character certificate)."},
            {"name": "list_certificate_requests", "description": "List all certificate requests created by the user."},
            {"name": "get_certificate_request", "description": "Get details of a specific certificate request."},
            {"name": "get_certificate_status", "description": "Get current approval or issuance status of a certificate request."},
            {"name": "cancel_certificate_request", "description": "Cancel a pending certificate request."}
        ]
    },
    {
        "name": "maintenance_tickets",
        "command": [PYTHON_EXECUTABLE, MAINTENANCE_TICKETS_SERVER_PATH],
        "tools": [
            {"name": "create_maintenance_ticket", "description": "Create a new maintenance or service request ticket for room/facility issues."},
            {"name": "list_maintenance_tickets", "description": "List all maintenance tickets."},
            {"name": "get_maintenance_ticket", "description": "Get details of a specific maintenance ticket."},
            {"name": "update_maintenance_ticket", "description": "Update details or description of a maintenance ticket."},
            {"name": "close_maintenance_ticket", "description": "Close a maintenance ticket with a closure reason."},
            {"name": "get_ticket_status", "description": "Get current status of a maintenance ticket."}
        ]
    },
    {
        "name": "laboratory_bookings",
        "command": [PYTHON_EXECUTABLE, LABORATORY_BOOKINGS_SERVER_PATH],
        "tools": [
            {"name": "list_laboratories", "description": "List all laboratories available for bookings."},
            {"name": "get_lab_availability", "description": "Inspect available time slots for a laboratory on a given date."},
            {"name": "create_lab_booking", "description": "Book a laboratory slot for a specific time range."},
            {"name": "get_lab_booking", "description": "Get details of a specific laboratory booking."},
            {"name": "cancel_lab_booking", "description": "Cancel an existing laboratory booking."},
            {"name": "list_user_bookings", "description": "List all laboratory bookings made by the user."}
        ]
    },
    {
        "name": "grievance_escalation",
        "command": [PYTHON_EXECUTABLE, GRIEVANCE_ESCALATION_SERVER_PATH],
        "tools": [
            {"name": "create_grievance", "description": "Create or raise a new grievance/complaint."},
            {"name": "list_grievances", "description": "List all grievances filed by the user."},
            {"name": "get_grievance", "description": "Get details of a specific grievance."},
            {"name": "update_grievance", "description": "Update details or description of an existing grievance."},
            {"name": "escalate_grievance", "description": "Escalate a grievance to a higher authority."},
            {"name": "get_grievance_status", "description": "Get current status of a grievance."}
        ]
    }
]

