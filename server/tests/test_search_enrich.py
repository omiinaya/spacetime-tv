"""Tests for search.py routes — /api/search/enrich endpoint.

Uses the existing TestClient fixtures. The search enrich endpoint relies
on TMDB_API_KEY or fallback tmdb-enrich CLI tool which isn't available in
the test environment, so these tests verify structural responses.
"""


def test_search_enrich_empty_body(client):
    """POST /api/search/enrich with empty body returns empty dicts."""
    resp = client.post("/api/v1/search/enrich", json={})
    assert resp.status_code == 200
    data = resp.json()
    assert data == {"movies": {}, "series": {}}


def test_search_enrich_no_body(client):
    """POST /api/search/enrich with no JSON returns 422."""
    resp = client.post("/api/v1/search/enrich", json=None)
    assert resp.status_code == 422


def test_search_enrich_with_movies_structure(client):
    """POST /api/search/enrich with movies returns structured response."""
    resp = client.post("/api/v1/search/enrich", json={
        "movies": [{"stream_id": 1, "tmdb_id": "550"}],
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "movies" in data
    assert "series" in data
    # enrichment will be empty since TMDB/CLI unavailable in tests
    assert isinstance(data["movies"], dict)
    assert isinstance(data["series"], dict)


def test_search_enrich_with_both_sections(client):
    """POST /api/search/enrich with movies and series returns both sections."""
    resp = client.post("/api/v1/search/enrich", json={
        "movies": [{"stream_id": 1, "tmdb_id": "550"}],
        "series": [{"series_id": 10, "tmdb_id": "1399"}],
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "movies" in data
    assert "series" in data


def test_search_enrich_invalid_body_handled(client):
    """POST /api/search/enrich with null items gracefully handled."""
    resp = client.post("/api/v1/search/enrich", json={
        "movies": None,
        "series": None,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data == {"movies": {}, "series": {}}
