
def _login(client, username, password):
    response = client.post("/auth/login", json={"username": username, "password": password})
    return response.json()["access_token"]


def test_operator_cannot_create_user(client):
    token = _login(client, "operator", "operatorpassword")
    response = client.post(
        "/users",
        headers={"Authorization": f"Bearer {token}"},
        json={"username": "newuser", "password": "password123", "role": "OPERATEUR"},
    )
    assert response.status_code == 403


def test_calls_endpoint_requires_auth(client):
    response = client.get("/calls")
    assert response.status_code == 401
