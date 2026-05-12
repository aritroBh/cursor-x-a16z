import pytest
from fastapi.testclient import TestClient
from memory_service.app import app
import os
import urllib.parse

client = TestClient(app)

def test_valid_page():
    pass

def test_path_traversal_graph():
    # Because httpx handles ".." natively, we need to pass the raw path or use url encoding to bypass client-side resolution
    url = "/wiki/pages/" + urllib.parse.quote("../graph.json", safe="")
    response = client.get(url)
    assert response.status_code == 403

def test_path_traversal_passwd():
    url = "/wiki/pages/" + urllib.parse.quote("../../../../../../../etc/passwd", safe="")
    response = client.get(url)
    assert response.status_code == 403
