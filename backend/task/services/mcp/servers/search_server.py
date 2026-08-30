import sys
import json

def main():
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
                        "serverInfo": {"name": "SearchServer", "version": "1.0"}
                    }
                }
            elif method == "tools/list":
                res = {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {
                        "tools": [
                            {
                                "name": "search_web",
                                "description": "Search the web for up-to-date information. (Development/mock search backend)",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "query": {"type": "string", "description": "The search query"}
                                    },
                                    "required": ["query"]
                                }
                            }
                        ]
                    }
                }
            elif method == "tools/call":
                params = req.get("params", {})
                tool_name = params.get("name")
                arguments = params.get("arguments", {})
                
                if tool_name == "search_web":
                    query = arguments.get("query", "").lower()
                    if "ocr" in query:
                        text = (
                            "[Development/Mock Search Results]\n"
                            "Tesseract OCR: Open source engine supporting 100+ languages.\n"
                            "EasyOCR: Ready-to-use Python OCR library.\n"
                            "PaddleOCR: Production-grade toolkit."
                        )
                    else:
                        text = f"[Development/Mock Search Results] Results for query: {query}"
                    result = {"content": [{"type": "text", "text": text}]}
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
