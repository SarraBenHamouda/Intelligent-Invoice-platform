import {
  useNavigate,
} from 'react-router-dom';

function CallToAction() {
  const navigate = useNavigate();

  return (
    <section className="call-to-action-section">
      <div className="public-container">
        <div className="call-to-action-card">
          <div>
            <span className="public-section-label">
              Commencez maintenant
            </span>

            <h2>
              Prêt à simplifier votre gestion
              des factures ?
            </h2>

            <p>
              Créez votre compte et centralisez
              vos factures, vos signatures et leur
              suivi TTN.
            </p>
          </div>

          <div className="call-to-action-buttons">
            <button
              type="button"
              className="public-primary-button"
              onClick={() =>
                navigate('/auth?mode=register')
              }
            >
              Créer un compte
            </button>

            <button
              type="button"
              className="public-secondary-button"
              onClick={() =>
                navigate('/auth?mode=login')
              }
            >
              Se connecter
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default CallToAction;