import { Link } from "react-router-dom";

import Logo from "../Logo/Logo";
import "./PublicFooter.css";

function PublicFooter() {
  return (
    <footer className="notion-footer">
      <div className="notion-shell notion-footer-grid">
        <div className="notion-footer-brand">
          <Logo className="notion-footer-logo" />

          <p>
            Plateforme intelligente de dématérialisation et de suivi des
            factures électroniques.
          </p>
        </div>

        <div>
          <strong>Produit</strong>

          <Link to="/features">
            Fonctionnalités
          </Link>

          <Link to="/how-it-works">
            Comment ça marche
          </Link>
        </div>

        <div>
          <strong>Entreprise</strong>

          <Link to="/about">
            À propos
          </Link>

          <Link to="/contact">
            Contact
          </Link>
        </div>

        <div>
          <strong>Accès</strong>

          <Link to="/auth?mode=login">
            Se connecter
          </Link>

          <Link to="/auth?mode=register">
            Créer un compte
          </Link>
        </div>
      </div>

      <div className="notion-footer-bottom">
        © 2026 Tenor Afrique. Tous droits réservés.
      </div>
    </footer>
  );
}

export default PublicFooter;