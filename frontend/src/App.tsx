import { useEffect, useState } from "react";
import { Route, Routes, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import CallsPage from "./pages/CallsPage";
import UsersPage from "./pages/UsersPage";
import SettingsPage from "./pages/SettingsPage";
import SystemPage from "./pages/SystemPage";
import { getMe } from "./services/api";

const TOKEN_KEY = "secours_tokens";

type Tokens = {
  access_token: string;
  refresh_token: string;
};

type User = {
  username: string;
  role: string;
  must_change_password: boolean;
};

export default function App() {
  const [tokens, setTokens] = useState<Tokens | null>(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    return stored ? JSON.parse(stored) : null;
  });
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!tokens) return;
    getMe(tokens.access_token)
      .then((data) => setUser(data))
      .catch(() => {
        setTokens(null);
        setUser(null);
        localStorage.removeItem(TOKEN_KEY);
      });
  }, [tokens]);

  const handleLogin = (newTokens: Tokens) => {
    setTokens(newTokens);
    localStorage.setItem(TOKEN_KEY, JSON.stringify(newTokens));
  };

  const handleLogout = () => {
    setTokens(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
  };

  if (!tokens) {
    return <LoginPage onLogin={handleLogin} />;
  }

  if (!user) {
    return <div className="loading">Chargement...</div>;
  }

  return (
    <Layout role={user.role} onLogout={handleLogout} mustChangePassword={user.must_change_password}>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/calls" element={<CallsPage />} />
        {user.role === "ADMIN" && (
          <>
            <Route path="/users" element={<UsersPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/system" element={<SystemPage />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  );
}
