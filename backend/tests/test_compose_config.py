import json
import os
from pathlib import Path
import shutil
import subprocess

import pytest


def test_environment_options_reach_base_and_production_services():
    if not shutil.which("docker"):
        pytest.skip("Docker Compose CLI unavailable")
    env = {**os.environ,"DATA_STALE_AFTER_HOURS":"72","NOTIFY_WEBHOOK_URL":"https://example.invalid/test-only","MASS_DELETE_MIN_OLD":"500","MASS_DELETE_RATIO":"0.75"}
    root = Path(__file__).resolve().parents[2]
    for files in (("docker-compose.yml",),("docker-compose.yml","docker-compose.prod.yml")):
        command = ["docker","compose"]
        for file in files:
            command.extend(["-f",file])
        result = subprocess.run([*command,"config","--format","json"],cwd=root,env=env,capture_output=True,text=True,check=True)
        services = json.loads(result.stdout)["services"]
        assert services["backend"]["environment"]["DATA_STALE_AFTER_HOURS"] == "72"
        assert services["scheduler"]["environment"]["MASS_DELETE_MIN_OLD"] == "500"
        assert services["scheduler"]["environment"]["MASS_DELETE_RATIO"] == "0.75"
        assert services["scheduler"]["environment"]["NOTIFY_WEBHOOK_URL"] == env["NOTIFY_WEBHOOK_URL"]
        assert "api/ready" in " ".join(services["backend"]["healthcheck"]["test"])
