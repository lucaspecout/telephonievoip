import { Link } from "react-router-dom";

type LayoutProps = {
  children: React.ReactNode;
  role: string;
  onLogout: () => void;
  mustChangePassword?: boolean;
};

export default function Layout({ children, role, onLogout, mustChangePassword }: LayoutProps) {
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
        {children}
      </main>
    </div>
  );
}
