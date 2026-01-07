from app.schemas import TokenPair


def test_login_success(client):
    response = client.post("/auth/login", json={"username": "admin", "password": "adminpassword"})
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data


def test_login_failure(client):
    response = client.post("/auth/login", json={"username": "admin", "password": "wrong"})
    assert response.status_code == 401
