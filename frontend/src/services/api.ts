export const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

export type TokenPair = {
  access_token: string;
  refresh_token: string;
};

export async function login(username: string, password: string): Promise<TokenPair> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  if (!response.ok) {
    throw new Error("Login failed");
  }
  return response.json();
}

export async function getMe(accessToken: string) {
  const response = await fetch(`${API_BASE}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    throw new Error("Unauthorized");
  }
  return response.json();
}

export async function changePassword(accessToken: string, newPassword: string) {
  const response = await fetch(`${API_BASE}/users/me/change-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ new_password: newPassword })
  });
  if (!response.ok) {
    throw new Error("Password change failed");
  }
  return response.json();
}
