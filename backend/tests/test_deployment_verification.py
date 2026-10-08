from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import subprocess
import threading

import pytest


@pytest.mark.parametrize("failed_route,status,manifest", [
    (None, 200, {"shards": [{"id": 0}]}),
    ("/robots.txt", 404, {"shards": [{"id": 0}]}),
    ("/", 500, {"shards": [{"id": 0}]}),
    ("/sitemap-merchants-0.xml", 503, {"shards": [{"id": 0}]}),
    ("/api/health", 503, {"shards": [{"id": 0}]}),
    (None, 200, {"shards": [{"id": "../invalid"}]}),
])
def test_verification_fails_on_bad_routes_and_keeps_log(tmp_path, failed_route, status, manifest):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(status if self.path == failed_route else 200)
            self.end_headers()
            self.wfile.write(json.dumps(manifest).encode() if self.path == "/api/sitemaps/manifest" else b"response")

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        script = Path(__file__).resolve().parents[2] / "scripts/verify_deployment.sh"
        result = subprocess.run(
            ["bash", str(script), f"http://127.0.0.1:{server.server_port}"],
            env={**os.environ, "DEPLOY_LOG_DIR": str(tmp_path)}, capture_output=True, text=True, timeout=15,
        )
    finally:
        server.shutdown()
        server.server_close()
        worker.join()
    valid = failed_route is None and manifest["shards"][0]["id"] == 0
    assert (result.returncode == 0) == valid, result.stdout + result.stderr
    assert ("所有路由驗收通過" in result.stdout) == valid
    logs = list(tmp_path.glob("verification-*.log"))
    assert len(logs) == 1
    if failed_route:
        assert f"{failed_route} HTTP {status}" in logs[0].read_text()
