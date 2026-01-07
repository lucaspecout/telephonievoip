import { useState } from "react";
import { login } from "../services/api";

type LoginPageProps = {
  onLogin: (tokens: { access_token: string; refresh_token: string }) => void;
};

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const tokens = await login(username, password);
      onLogin(tokens);
    } catch (err) {
      setError("Identifiants invalides");
    }
  };

  return (
    <div className="login">
      <form onSubmit={handleSubmit}>
        <h1>SECours Calls Dashboard</h1>
        <p>Connexion sécurisée pour la Protection Civile.</p>
        {error && <div className="error">{error}</div>}
        <label>
          Nom d'utilisateur
          <input value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label>
          Mot de passe
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button type="submit">Se connecter</button>
      </form>
    </div>
  );
}
