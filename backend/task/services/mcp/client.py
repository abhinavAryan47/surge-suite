import subprocess
import json
import threading
import queue
import time
import sys

class MCPClient:
    def __init__(self, name: str, command: list, env: dict = None):
        self.name = name
        self.command = command
        self.env = env
        self.process = None
        self.response_queues = {}
        self.next_id = 1
        self.lock = threading.Lock()
        self.thread = None
        self.stderr_thread = None

    def start(self):
        import os
        proc_env = os.environ.copy()
        if self.env:
            # Filter out None values and ensure everything is string
            string_env = {str(k): str(v) for k, v in self.env.items() if v is not None}
            proc_env.update(string_env)
        try:
            self.process = subprocess.Popen(
                self.command,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=proc_env,
                text=True,
                bufsize=1
            )
        except Exception as e:
            raise RuntimeError(f"Failed to start MCP server process '{self.name}': {str(e)}")

        self.thread = threading.Thread(target=self._read_loop, daemon=True)
        self.thread.start()

        self.stderr_thread = threading.Thread(target=self._read_stderr_loop, daemon=True)
        self.stderr_thread.start()

    def _read_loop(self):
        try:
            for line in self.process.stdout:
                line_str = line.strip()
                if not line_str:
                    continue
                try:
                    msg = json.loads(line_str)
                    msg_id = msg.get("id")
                    if msg_id is not None:
                        with self.lock:
                            q = self.response_queues.get(msg_id)
                        if q:
                            q.put(msg)
                except Exception as ex:
                    sys.stderr.write(f"[{self.name} client] Error parsing stdout line: {str(ex)}\n")
        except Exception as e:
            sys.stderr.write(f"[{self.name} client] Read loop error: {str(e)}\n")

    def _read_stderr_loop(self):
        try:
            for line in self.process.stderr:
                sys.stderr.write(f"[{self.name} server stderr] {line}")
        except Exception:
            pass

    def send_request(self, method: str, params: dict = None, timeout: float = 10.0) -> dict:
        if not self.process or self.process.poll() is not None:
            return {"error": f"MCP server '{self.name}' is not running."}

        with self.lock:
            msg_id = self.next_id
            self.next_id += 1
            q = queue.Queue()
            self.response_queues[msg_id] = q

        req = {
            "jsonrpc": "2.0",
            "id": msg_id,
            "method": method
        }
        if params is not None:
            req["params"] = params

        try:
            payload = json.dumps(req) + "\n"
            self.process.stdin.write(payload)
            self.process.stdin.flush()
            
            res = q.get(timeout=timeout)
            return res
        except queue.Empty:
            return {"error": f"Timeout ({timeout}s) waiting for response to request '{method}' (id: {msg_id})"}
        except Exception as e:
            return {"error": f"Error sending request: {str(e)}"}
        finally:
            with self.lock:
                self.response_queues.pop(msg_id, None)

    def stop(self):
        if self.process:
            try:
                self.process.stdin.close()
            except Exception:
                pass
            try:
                self.process.terminate()
                self.process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                try:
                    self.process.kill()
                except Exception:
                    pass
            except Exception:
                pass
            self.process = None
