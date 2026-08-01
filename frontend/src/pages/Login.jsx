import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  loginUser,
} from '../services/authService';

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState(
    'sara.auth.final@test.tn'
  );

  const [password, setPassword] =
    useState('TestPassword123');

  const [error, setError] =
    useState('');

  const [loading, setLoading] =
    useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    setError('');
    setLoading(true);

    try {
      const result = await loginUser(
        email,
        password
      );

      if (result.user.role === 'ADMIN') {
        navigate('/admin');
      } else {
        navigate('/client');
      }
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="brand">
          <h1>Invoice Platform</h1>

          <p>
            Plateforme intelligente de
            dématérialisation des factures
          </p>
        </div>

        <h2>Connexion</h2>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">
              Adresse e-mail
            </label>

            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              placeholder="nom@entreprise.tn"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">
              Mot de passe
            </label>

            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) =>
                setPassword(
                  event.target.value
                )
              }
              placeholder="Votre mot de passe"
              required
            />
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
          >
            {loading
              ? 'Connexion...'
              : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;