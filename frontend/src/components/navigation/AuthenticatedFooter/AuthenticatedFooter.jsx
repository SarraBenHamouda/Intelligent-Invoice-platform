import {
  Link,
} from 'react-router-dom';

import Logo from '../Logo/Logo';

import './AuthenticatedFooter.css';


function MailIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4 6.75H20V17.25H4V6.75Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />

      <path
        d="M4.6 7.4L12 13L19.4 7.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}


function PhoneIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M7.4 4.5L9.7 8.2L8.25 10.05C9.22 12.1 10.88 13.76 12.93 14.73L14.78 13.28L18.5 15.6C18.9 15.85 19.08 16.34 18.94 16.79C18.5 18.19 17.2 19.15 15.72 19.15C9.72 19.15 4.85 14.28 4.85 8.28C4.85 6.8 5.81 5.5 7.21 5.06C7.66 4.92 8.15 5.1 8.4 5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}


function LocationIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 21C12 21 18 15.35 18 9.75C18 6.44 15.31 3.75 12 3.75C8.69 3.75 6 6.44 6 9.75C6 15.35 12 21 12 21Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />

      <circle
        cx="12"
        cy="9.75"
        r="2.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  );
}


function AuthenticatedFooter() {
  const currentYear =
    new Date().getFullYear();

  return (
    <footer className="authenticated-footer">

      <div className="authenticated-footer__main">
        <div className="authenticated-footer__container">

          {/* BRAND */}

          <div className="authenticated-footer__company">

            <Link
              to="/client"
              className="authenticated-footer__brand"
              aria-label="Ténor Afrique - Portail Client"
            >
              <Logo
                className="authenticated-footer__logo"
              />

              <span className="authenticated-footer__brand-text">
                <strong>
                  Portail Client
                </strong>

                <small>
                  Facturation électronique
                </small>
              </span>
            </Link>

            <p className="authenticated-footer__description">
              Centralisez, suivez et consultez vos factures
              électroniques depuis un espace sécurisé.
            </p>

          </div>


          {/* NAVIGATION */}

          <div className="authenticated-footer__column">

            <span className="authenticated-footer__title">
              Navigation
            </span>

            <nav className="authenticated-footer__nav">

              <Link to="/client">
                Tableau de bord
              </Link>

              <Link to="/client/invoices">
                Mes factures
              </Link>

              <Link to="/client/invoices/upload">
                Importer une facture
              </Link>

              <Link to="/client/profile">
                Mon profil
              </Link>

            </nav>

          </div>


          {/* CONTACT */}

          <div
            className="
              authenticated-footer__column
              authenticated-footer__contact
            "
          >

            <span className="authenticated-footer__title">
              Contact
            </span>


            <a
              href="mailto:contact@tenorafrique.com"
              className="authenticated-footer__contact-item"
            >
              <span
                className="authenticated-footer__contact-icon"
                aria-hidden="true"
              >
                <MailIcon />
              </span>

              <span className="authenticated-footer__contact-content">

                <small>
                  E-mail
                </small>

                <strong>
                  contact@tenorafrique.com
                </strong>

              </span>
            </a>


            <a
              href="tel:+21629965538"
              className="authenticated-footer__contact-item"
            >
              <span
                className="authenticated-footer__contact-icon"
                aria-hidden="true"
              >
                <PhoneIcon />
              </span>

              <span className="authenticated-footer__contact-content">

                <small>
                  Téléphone
                </small>

                <strong>
                  (+216) 29 965 538
                </strong>

              </span>
            </a>


            <a
              href="https://www.google.com/maps/search/?api=1&query=Residence+ARCHE+Les+Jardins+de+Carthage+Tunisie"
              target="_blank"
              rel="noreferrer"
              className="authenticated-footer__contact-item"
            >
              <span
                className="authenticated-footer__contact-icon"
                aria-hidden="true"
              >
                <LocationIcon />
              </span>

              <span className="authenticated-footer__contact-content">

                <small>
                  Siège
                </small>

                <strong>
                  Résidence ARCHE
                  <br />
                  Les Jardins de Carthage, Tunisie
                </strong>

              </span>
            </a>

          </div>

        </div>
      </div>


      {/* BOTTOM */}

      <div className="authenticated-footer__bottom">

        <div className="authenticated-footer__bottom-container">

          <div className="authenticated-footer__copyright">

            <span>
              © {currentYear} Ténor Afrique
            </span>

            <span className="authenticated-footer__separator">
              ·
            </span>

            <span>
              InvoiceFlow
            </span>

          </div>



        </div>

      </div>

    </footer>
  );
}


export default AuthenticatedFooter;