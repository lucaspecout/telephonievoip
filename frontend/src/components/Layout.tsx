import { useState } from "react";
import { Link } from "react-router-dom";
import { changePassword } from "../services/api";

type LayoutProps = {
  children: React.ReactNode;
  role: string;
  onLogout: () => void;
  accessToken: string;
  onPasswordChanged: () => void;
  mustChangePassword?: boolean;
};

export default function Layout({
  children,
  role,
  onLogout,
  accessToken,
  onPasswordChanged,
  mustChangePassword
}: LayoutProps) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handlePasswordChange = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setIsSaving(true);
    try {
      await changePassword(accessToken, newPassword);
      setNewPassword("");
      setConfirmPassword("");
      onPasswordChanged();
    } catch (err) {
      setError("Impossible de changer le mot de passe.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">SECours Calls</div>
        <nav>
          <Link to="/">Dashboard</Link>
          <Link to="/calls">Appels</Link>
          {role === "ADMIN" && (
            <>
              <Link to="/users">Utilisateurs</Link>
              <Link to="/settings">Paramètres OVH</Link>
              <Link to="/system">Système</Link>
            </>
          )}
        </nav>
        <button className="logout" onClick={onLogout}>
          Déconnexion
        </button>
      </aside>
      <main className="content">
        {mustChangePassword && (
          <div className="banner">Veuillez changer votre mot de passe (obligatoire).</div>
        )}
        {mustChangePassword && (
          <div className="password-overlay">
            <form className="password-card" onSubmit={handlePasswordChange}>
              <h2>Changement de mot de passe requis</h2>
              <p>Pour continuer, choisissez un nouveau mot de passe.</p>
              <input
                type="password"
                placeholder="Nouveau mot de passe"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                minLength={8}
              />
              <input
                type="password"
                placeholder="Confirmer le mot de passe"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={8}
              />
              {error && <div className="error">{error}</div>}
              <button type="submit" disabled={isSaving}>
                {isSaving ? "Enregistrement..." : "Changer le mot de passe"}
              </button>
            </form>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
