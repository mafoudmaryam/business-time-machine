"""CORS must accept any localhost/127.0.0.1 port (the frontend dev server's
port isn't fixed -- Vite may pick 5174 etc, or the browser may use 127.0.0.1),
but not arbitrary origins."""


def _preflight(client, origin):
    return client.options("/businesses", headers={
        "Origin": origin,
        "Access-Control-Request-Method": "GET",
    })


def test_preflight_allows_a_non_default_localhost_port(client):
    resp = _preflight(client, "http://localhost:5174")
    assert resp.status_code == 200
    assert resp.headers["access-control-allow-origin"] == "http://localhost:5174"


def test_preflight_allows_127_0_0_1(client):
    resp = _preflight(client, "http://127.0.0.1:5173")
    assert resp.status_code == 200
    assert resp.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"


def test_preflight_rejects_other_origins(client):
    resp = _preflight(client, "http://evil.example.com")
    assert "access-control-allow-origin" not in resp.headers
