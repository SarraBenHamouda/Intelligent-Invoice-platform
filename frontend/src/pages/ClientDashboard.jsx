import { useNavigate } from 'react-router-dom';

import Logo from '../components/navigation/Logo/Logo';
import ThemeToggle from '../components/navigation/ThemeToggle/ThemeToggle';

import {
  getStoredUser,
  logout as logoutUser,
} from '../services/authService';

function ClientDashboard() {
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
            <h1>Espace client</h1>

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
          <h2>Compte connecté</h2>

          <div className="account-information">
            <p>
              <strong>Nom :</strong>{' '}
              {user?.fullName}
            </p>

            <p>
              <strong>E-mail :</strong>{' '}
              {user?.email}
            </p>

            <p>
              <strong>Rôle :</strong>{' '}
              {user?.role}
            </p>

            <p>
              <strong>Organisation :</strong>{' '}
              {user?.organizationId}
            </p>
          </div>
        </section>

        <section className="dashboard-card">
          <h2>Mes factures</h2>

          <p className="dashboard-description">
            La liste des factures acceptées,
            rejetées et en attente sera affichée
            dans cette section.
          </p>
        </section>
      </main>
    </div>
  );
}

export default ClientDashboard;