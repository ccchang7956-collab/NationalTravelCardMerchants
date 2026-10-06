"""Task4 ops config (TDD RED -> GREEN). Static file assertions, no secrets."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_nginx_has_safety_limits():
    t = (ROOT / "nginx.conf").read_text()
    assert "client_max_body_size" in t
    assert "server_tokens off" in t


def test_backend_cors_tight_and_trusted_host():
    t = (ROOT / "backend" / "main.py").read_text()
    assert '"GET"' in t and '"OPTIONS"' in t
    assert "TrustedHost" in t


def test_compose_has_logging_and_nginx_limits():
    base = (ROOT / "docker-compose.yml").read_text()
    prod = (ROOT / "docker-compose.prod.yml").read_text()
    assert "max-size" in base
    assert "mem_limit" in prod
    assert "healthcheck" in prod.lower()


def test_dockerfiles_have_healthcheck():
    assert "HEALTHCHECK" in (ROOT / "backend" / "Dockerfile").read_text()
    assert "HEALTHCHECK" in (ROOT / "frontend" / "Dockerfile").read_text()
    assert "HEALTHCHECK" in (ROOT / "scheduler" / "Dockerfile").read_text()
