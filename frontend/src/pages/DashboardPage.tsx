export default function DashboardPage() {
  return (
    <div>
      <h2>Dashboard</h2>
      <div className="kpi-grid">
        <div className="card">Appels entrants aujourd'hui</div>
        <div className="card">Manqués aujourd'hui</div>
        <div className="card">Derniers 7 jours</div>
        <div className="card">Temps total</div>
      </div>
      <div className="card">
        <h3>Derniers appels</h3>
        <p>Les données s'afficheront après la synchronisation OVH.</p>
      </div>
    </div>
  );
}
