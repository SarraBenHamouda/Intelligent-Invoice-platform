import { useNavigate } from 'react-router-dom';

import Logo from '../components/navigation/Logo/Logo';
import ThemeToggle from '../components/navigation/ThemeToggle/ThemeToggle';

import {
  getStoredUser,
  logout as logoutUser,
} from '../services/authService';

function AdminDashboard() {
  const navigate = useNavigate();
  const user = getStoredUser();

  function handleLogout() {
    logoutUser();
    navigate('/auth');
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <Logo className="dashboard-logo" />

          <div>
            <h1>Administration</h1>

            <p>
              Bienvenue {user?.fullName}
            </p>
          </div>
        </div>

        <div className="dashboard-actions">
          <ThemeToggle />

          <button
            type="button"
            className="logout-button"
            onClick={handleLogout}
          >
            Déconnexion
          </button>
        </div>
      </header>

      <main className="dashboard-content">
        <section className="dashboard-card">
          <h2>Tableau de bord</h2>

          <p className="dashboard-description">
            Les statistiques des clients,
            des factures et des signatures
            seront affichées ici.
          </p>
        </section>

        <section className="dashboard-card">
          <h2>Gestion des factures</h2>

          <p className="dashboard-description">
            Les factures acceptées, rejetées
            et en attente seront affichées dans
            cette section.
          </p>
        </section>
      </main>
    </div>
  );
}

export default AdminDashboard;