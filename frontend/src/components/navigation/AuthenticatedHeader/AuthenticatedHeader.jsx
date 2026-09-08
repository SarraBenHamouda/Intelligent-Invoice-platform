import {
  Link,
  NavLink,
  useNavigate,
} from 'react-router-dom';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import Logo from '../Logo/Logo';
import ThemeToggle from '../ThemeToggle/ThemeToggle';

import NotificationBell from '../../notifications/NotificationBell';
import InvoiceAssistant from '../../assistant/InvoiceAssistant/InvoiceAssistant.jsx';

import {
  getStoredUser,
  logout,
} from '../../../services/authService';

import {
  getProfile,
} from '../../../services/profileService';

import './AuthenticatedHeader.css';


function getInitials(
  firstName,
  lastName,
  displayName,
) {
  const first =
    String(firstName || '')
      .trim()
      .charAt(0)
      .toUpperCase();

  const last =
    String(lastName || '')
      .trim()
      .charAt(0)
      .toUpperCase();

  if (first || last) {
    return `${first}${last}`;
  }

  return String(displayName || 'U')
    .trim()
    .charAt(0)
    .toUpperCase();
}


function getAvatarSource(profile) {
  if (!profile) {
    return null;
  }

  const avatar =
    profile.avatar_absolute_url ||
    profile.avatar_url ||
    null;

  if (!avatar) {
    return null;
  }

  if (
    avatar.startsWith('http://') ||
    avatar.startsWith('https://')
  ) {
    return avatar;
  }

  return (
    `http://${window.location.hostname}:3000` +
    avatar
  );
}


function AuthenticatedHeader({
  profile: receivedProfile = null,
}) {
  const navigate =
    useNavigate();

  const storedUser =
    getStoredUser();

  /*
  |--------------------------------------------------------------------------
  | PROFILE
  |--------------------------------------------------------------------------
  */

  const [
    profile,
    setProfile,
  ] =
    useState(
      receivedProfile,
    );

  /*
  |--------------------------------------------------------------------------
  | LOAD PROFILE
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (receivedProfile) {
      setProfile(
        receivedProfile,
      );

      return;
    }

    let cancelled =
      false;

    async function loadProfile() {
      try {
        const response =
          await getProfile();

        if (!cancelled) {
          setProfile(
            response?.profile ||
            null,
          );
        }
      } catch (error) {
        console.warn(
          'Header profile load failed:',
          error,
        );
      }
    }

    loadProfile();

    return () => {
      cancelled =
        true;
    };
  }, [
    receivedProfile,
  ]);

  /*
  |--------------------------------------------------------------------------
  | ROLE
  |--------------------------------------------------------------------------
  */

  const role =
    String(
      profile?.role ||
      storedUser?.role ||
      '',
    )
      .trim()
      .toUpperCase();

  const isAdmin =
    role === 'ADMIN';

  /*
  |--------------------------------------------------------------------------
  | DISPLAY NAME
  |--------------------------------------------------------------------------
  */

  const displayName =
    profile?.full_name ||
    [
      profile?.first_name,
      profile?.last_name,
    ]
      .filter(Boolean)
      .join(' ') ||
    storedUser?.fullName ||
    [
      storedUser?.firstName,
      storedUser?.lastName,
    ]
      .filter(Boolean)
      .join(' ') ||
    storedUser?.email ||
    'Utilisateur';

  /*
  |--------------------------------------------------------------------------
  | INITIALS
  |--------------------------------------------------------------------------
  */

  const initials =
    useMemo(
      () =>
        getInitials(
          profile?.first_name ||
            storedUser?.firstName,

          profile?.last_name ||
            storedUser?.lastName,

          displayName,
        ),

      [
        profile,
        storedUser,
        displayName,
      ],
    );

  /*
  |--------------------------------------------------------------------------
  | AVATAR
  |--------------------------------------------------------------------------
  */

  const avatarSource =
    useMemo(
      () =>
        getAvatarSource(
          profile,
        ),

      [
        profile,
      ],
    );

  /*
  |--------------------------------------------------------------------------
  | PROFILE CLICK
  |--------------------------------------------------------------------------
  */

  function handleProfileClick() {
    if (isAdmin) {
      navigate('/admin');

      return;
    }

    navigate('/client/profile');
  }

  /*
  |--------------------------------------------------------------------------
  | LOGOUT
  |--------------------------------------------------------------------------
  */

  async function handleLogout() {
    try {
      await logout();
    } finally {
      navigate(
        '/auth?mode=login',
        {
          replace: true,
        },
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | RENDER
  |--------------------------------------------------------------------------
  */

  return (
    <>
      <header className="authenticated-header">
        <div className="authenticated-header__container">

          <Link
            to={
              isAdmin
                ? '/admin'
                : '/client'
            }
            className="authenticated-header__brand"
          >
            <Logo className="authenticated-header__logo" />

            <span className="authenticated-header__brand-text">
              <strong>
                {isAdmin
                  ? 'Portail Admin'
                  : 'Portail Client'}
              </strong>

              <small>
                Facturation électronique
              </small>
            </span>
          </Link>

          <nav className="authenticated-header__navigation">
            {isAdmin ? (
              <>
                <NavLink
                  to="/admin"
                  end
                  className={({ isActive }) =>
                    isActive
                      ? 'authenticated-header__link active'
                      : 'authenticated-header__link'
                  }
                >
                  Tableau de bord
                </NavLink>

                <NavLink
                  to="/admin/clients"
                  end
                  className={({ isActive }) =>
                    isActive
                      ? 'authenticated-header__link active'
                      : 'authenticated-header__link'
                  }
                >
                  Clients
                </NavLink>

                <NavLink
                  to="/admin/invoices"
                  end
                  className={({ isActive }) =>
                    isActive
                      ? 'authenticated-header__link active'
                      : 'authenticated-header__link'
                  }
                >
                  Factures
                </NavLink>

                <NavLink
                  to="/admin/statistics"
                  end
                  className={({ isActive }) =>
                    isActive
                      ? 'authenticated-header__link active'
                      : 'authenticated-header__link'
                  }
                >
                  Statistiques
                </NavLink>
              </>
            ) : (
              <>
                <NavLink
                  to="/client"
                  end
                  className={({ isActive }) =>
                    isActive
                      ? 'authenticated-header__link active'
                      : 'authenticated-header__link'
                  }
                >
                  Tableau de bord
                </NavLink>

                <NavLink
                  to="/client/invoices"
                  end
                  className={({ isActive }) =>
                    isActive
                      ? 'authenticated-header__link active'
                      : 'authenticated-header__link'
                  }
                >
                  Mes factures
                </NavLink>

                <NavLink
                  to="/client/invoices/upload"
                  end
                  className={({ isActive }) =>
                    isActive
                      ? 'authenticated-header__link active'
                      : 'authenticated-header__link'
                  }
                >
                  Importer
                </NavLink>
              </>
            )}
          </nav>

          <div className="authenticated-header__actions">
            <ThemeToggle />

            <NotificationBell
              pollInterval={15000}
            />

            <button
              type="button"
              className="authenticated-header__user"
              onClick={handleProfileClick}
              title="Ouvrir mon profil"
            >
              <span className="authenticated-header__avatar">
                {avatarSource ? (
                  <img
                    src={avatarSource}
                    alt=""
                  />
                ) : (
                  initials
                )}
              </span>

              <span className="authenticated-header__user-info">
                <strong>
                  {displayName}
                </strong>

                <small>
                  {isAdmin
                    ? 'Administrateur'
                    : 'Client'}
                </small>
              </span>

           
            </button>

            <button
              type="button"
              className="authenticated-header__logout"
              onClick={handleLogout}
            >
              <span>
                Déconnexion
              </span>

              <strong aria-hidden="true">
                ↪
              </strong>
            </button>
          </div>
        </div>
      </header>

      <InvoiceAssistant />
    </>
  );
}

export default AuthenticatedHeader;