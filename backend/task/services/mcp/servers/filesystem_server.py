import sys
import json
import os

def main():
    # Workspace root is 4 levels up from this script (servers/ -> mcp/ -> services/ -> task/ -> backend/)
    # Wait, let's resolve it dynamically using absolute path
    base_dir = os.path.dirname(os.path.abspath(__file__))
    workspace_root = os.path.abspath(os.path.join(base_dir, '..', '..', '..', '..'))

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
                        "serverInfo": {"name": "FilesystemServer", "version": "1.0"}
                    }
                }
            elif method == "tools/list":
                res = {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {
                        "tools": [
                            {
                                "name": "list_directory",
                                "description": "List files and directories in the workspace root or subdirectories.",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "path": {"type": "string", "description": "Relative path to list within the workspace root"}
                                    },
                                    "required": ["path"]
                                }
                            }
                        ]
                    }
                }
            elif method == "tools/call":
                params = req.get("params", {})
                tool_name = params.get("name")
                arguments = params.get("arguments", {})
                
                if tool_name == "list_directory":
                    path = arguments.get("path", ".")
                    target_path = os.path.abspath(os.path.join(workspace_root, path))
                    
                    if not target_path.startswith(workspace_root):
                        result = {"content": [{"type": "text", "text": "Error: Path traversal detected."}], "isError": True}
                    elif not os.path.exists(target_path):
                        result = {"content": [{"type": "text", "text": f"Error: Path '{path}' does not exist."}], "isError": True}
                    else:
                        try:
                            items = os.listdir(target_path)
                            files = [i for i in items if os.path.isfile(os.path.join(target_path, i))]
                            dirs = [i for i in items if os.path.isdir(os.path.join(target_path, i))]
                            text = f"Files: {', '.join(files)}\nDirectories: {', '.join(dirs)}"
                            result = {"content": [{"type": "text", "text": text}]}
                        except Exception as ex:
                            result = {"content": [{"type": "text", "text": f"Error reading path: {str(ex)}"}], "isError": True}
                else:
                    result = {"content": [{"type": "text", "text": f"Error: Unknown tool {tool_name}"}], "isError": True}
                
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
