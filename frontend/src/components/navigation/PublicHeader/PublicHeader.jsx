import { NavLink } from 'react-router-dom';

import Logo from '../Logo/Logo';
import ThemeToggle from '../ThemeToggle/ThemeToggle';
import LanguageSwitcher from '../LanguageSwitcher/LanguageSwitcher';
import './PublicHeader.css';

const navigationItems = [
  {
    label: 'Accueil',
    path: '/',
  },
  {
    label: 'Fonctionnalités',
    path: '/fonctionnalites',
  },
  {
    label: 'Sécurité',
    path: '/securite',
  },
  {
    label: 'Démonstration',
    path: '/demonstration',
  },
  {
    label: 'Contact',
    path: '/contact',
  },
];

function PublicHeader() {
  return (
    <header className="public-header">
      <div className="public-header__container">
        <NavLink to="/" className="public-header__logo">
          <Logo alt="InvoiceFlow" />
        </NavLink>

        <nav className="public-header__navigation">
          {navigationItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                isActive
                  ? 'public-header__link public-header__link--active'
                  : 'public-header__link'
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="public-header__actions">
          <LanguageSwitcher />
          <ThemeToggle />

          <NavLink
            to="/login"
            className="public-header__login"
          >
            Se connecter
          </NavLink>

          <NavLink
            to="/register"
            className="public-header__register"
          >
            Créer un compte
          </NavLink>
        </div>
      </div>
    </header>
  );
}

export default PublicHeader;
