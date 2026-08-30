import sys
import re
import os
from django.core.exceptions import ValidationError

def validate_mcp_config(configuration):
    """
    Validates a custom MCP configuration dict containing "command", "args", and "env".
    Raises django.core.exceptions.ValidationError if configuration is invalid or insecure.
    """
    if not isinstance(configuration, dict):
        raise ValidationError("Configuration must be a JSON object.")
        
    command = configuration.get("command")
    if not command:
        raise ValidationError("Configuration must specify a 'command' list.")
        
    if not isinstance(command, list):
        raise ValidationError("The 'command' field must be a list of strings.")
        
    for item in command:
        if not isinstance(item, str):
            raise ValidationError("All elements in the 'command' list must be strings.")
            
    if not command:
        raise ValidationError("Command list cannot be empty.")

    args = configuration.get("args")
    if args is not None:
        if not isinstance(args, list):
            raise ValidationError("The 'args' field must be a list of strings.")
        for item in args:
            if not isinstance(item, str):
                raise ValidationError("All elements in the 'args' list must be strings.")

    # Executable safety checks on the first element of command
    executable = command[0]
    exe_name = os.path.basename(executable).lower()
    
    # We prohibit shell wrappers and dangerous system-modifying executables from being run directly.
    # Note that we do not restrict to a small whitelist (e.g., node, python, bun, deno, uv, uvx are allowed).
    blocked_executables = {
        "sudo", "bash", "sh", "zsh", "cmd", "cmd.exe", "powershell",
        "powershell.exe", "pwsh", "ash", "csh", "tcsh", "fish", "ksh",
        "rm", "chmod", "chown", "curl", "wget"
    }
    
    if exe_name in blocked_executables:
        raise ValidationError(
            f"Executable '{executable}' is blocked. Directly executing shell interpreters or sudo/dangerous utilities is prohibited."
        )
        
    # Reject shell metacharacters in command or args
    full_command = command + (args or [])
    for arg in full_command:
        # Reject shell metacharacters: &&, ;, |, >, <, `
        metacharacters = ["&&", ";", "|", ">", "<", "`"]
        for mc in metacharacters:
            if mc in arg:
                raise ValidationError(f"Shell metacharacters (e.g. '{mc}') are prohibited in commands/arguments.")
                
    # Check environment variables
    env = configuration.get("env")
    if env is not None:
        if not isinstance(env, dict):
            raise ValidationError("The 'env' field must be a JSON object.")
        for k, v in env.items():
            if not isinstance(k, str) or not isinstance(v, str):
                raise ValidationError("All environment variable keys and values must be strings.")


def test_handshake_and_discover_tools(configuration: dict) -> list:
    """
    Launches the MCP client with the given configuration, performs initialize handshake,
    calls tools/list, terminates, and returns the list of tools.
    Raises ValidationError if any step fails.
    """
    from task.services.mcp.client import MCPClient
    import json
    
    command = configuration.get("command", [])
    args = configuration.get("args", [])
    full_command = command + (args or [])
    env = configuration.get("env", {})
    
    client = MCPClient("handshake-temp", full_command, env)
    try:
        client.start()
    except Exception as e:
        raise ValidationError(f"Failed to start MCP server subprocess: {str(e)}")
        
    try:
        # Perform initialize handshake (with 10s timeout)
        init_res = client.send_request("initialize", {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "SurgeSuiteHandshake", "version": "1.0"}
        }, timeout=10.0)
        
        if "error" in init_res:
            raise ValidationError(f"Initialize error: {init_res['error']}")
            
        # Send initialized notification
        if client.process and client.process.stdin:
            client.process.stdin.write(json.dumps({
                "jsonrpc": "2.0",
                "method": "notifications/initialized"
            }) + "\n")
            client.process.stdin.flush()
            
        # List tools (with 10s timeout)
        res = client.send_request("tools/list", timeout=10.0)
        if "error" in res:
            raise ValidationError(f"List tools error: {res['error']}")
            
        result_payload = res.get("result", {})
        tools = result_payload.get("tools", [])
        return tools
    except Exception as e:
        if isinstance(e, ValidationError):
            raise e
        raise ValidationError(f"Handshake failed: {str(e)}")
    finally:
        try:
            client.stop()
        except Exception:
            pass
