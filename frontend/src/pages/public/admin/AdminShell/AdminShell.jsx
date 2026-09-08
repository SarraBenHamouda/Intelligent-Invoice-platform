import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  NavLink,
  useLocation,
  useNavigate,
} from "react-router-dom";

import {
  getStoredUser,
} from "../../../../services/authService";

import logoDark from "../../../../assets/logo-dark.png";
import logoLight from "../../../../assets/logo-light.png";

import "./AdminShell.css";

/*
|--------------------------------------------------------------------------
| CONFIG
|--------------------------------------------------------------------------
*/

const API_BASE_URL =
  String(
    import.meta.env.VITE_API_URL ||
      "http://localhost:3000",
  ).replace(/\/+$/, "");

const THEME_STORAGE_KEY =
  "admin_theme";

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function getInitialTheme() {
  const storedTheme =
    window.localStorage.getItem(
      THEME_STORAGE_KEY,
    );

  if (
    storedTheme === "light" ||
    storedTheme === "dark"
  ) {
    return storedTheme;
  }

  const prefersDark =
    window.matchMedia &&
    window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;

  return prefersDark
    ? "dark"
    : "light";
}

function getUserInitials(user) {
  const first =
    String(
      user?.firstName ||
        "",
    )
      .trim()
      .charAt(0);

  const last =
    String(
      user?.lastName ||
        "",
    )
      .trim()
      .charAt(0);

  const result =
    `${first}${last}`
      .trim()
      .toUpperCase();

  if (result) {
    return result;
  }

  return String(
    user?.email ||
      "AD",
  )
    .slice(
      0,
      2,
    )
    .toUpperCase();
}

function resolveAvatarUrl(
  avatarUrl,
) {
  if (!avatarUrl) {
    return null;
  }

  const value =
    String(
      avatarUrl,
    ).trim();

  if (
    value.startsWith(
      "http://",
    ) ||
    value.startsWith(
      "https://",
    ) ||
    value.startsWith(
      "data:",
    ) ||
    value.startsWith(
      "blob:",
    )
  ) {
    return value;
  }

  if (
    value.startsWith(
      "/",
    )
  ) {
    return `${API_BASE_URL}${value}`;
  }

  return `${API_BASE_URL}/${value}`;
}

/*
|--------------------------------------------------------------------------
| SHELL
|--------------------------------------------------------------------------
*/

function AdminShell({
  title =
    "Administration",

  eyebrow =
    "Espace administrateur",

  description =
    "",

  subtitle =
    "",

  actions =
    null,

  children,
}) {
  const navigate =
    useNavigate();

  const location =
    useLocation();

  const [
    user,
    setUser,
  ] =
    useState(
      () =>
        getStoredUser(),
    );

  const [
    theme,
    setTheme,
  ] =
    useState(
      getInitialTheme,
    );

  const [
    mobileSidebarOpen,
    setMobileSidebarOpen,
  ] =
    useState(false);

  /*
  |--------------------------------------------------------------------------
  | NAVIGATION
  |--------------------------------------------------------------------------
  */

  const navigation =
    useMemo(
      () => [
        {
          path:
            "/admin/dashboard",

          icon:
            "📊",

          label:
            "Vue d’ensemble",

          section:
            "Administration",
        },

        {
          path:
            "/admin/invoices",

          icon:
            "🧾",

          label:
            "Factures",

          section:
            "Administration",
        },

        {
          path:
            "/admin/clients",

          icon:
            "🏢",

          label:
            "Clients",

          section:
            "Administration",
        },

        {
          path:
            "/admin/users",

          icon:
            "👥",

          label:
            "Utilisateurs",

          section:
            "Administration",
        },

        {
          path:
            "/admin/errors",

          icon:
            "⚠️",

          label:
            "Anomalies",

          section:
            "Supervision",
        },

        {
          path:
            "/admin/executions",

          icon:
            "🔄",

          label:
            "Exécutions",

          section:
            "Supervision",
        },

        {
          path:
            "/admin/retries",

          icon:
            "🔁",

          label:
            "Relances",

          section:
            "Supervision",
        },

        {
          path:
            "/admin/reports",

          icon:
            "📈",

          label:
            "Statistiques",

          section:
            "Analyse",
        },

        {
          path:
            "/admin/audit",

          icon:
            "📜",

          label:
            "Journal d’activité",

          section:
            "Analyse",
        },

        {
          path:
            "/admin/system",

          icon:
            "⚙️",

          label:
            "Système",

          section:
            "Plateforme",
        },
      ],
      [],
    );

  /*
  |--------------------------------------------------------------------------
  | GROUPS
  |--------------------------------------------------------------------------
  */

  const groupedNavigation =
    useMemo(
      () => {
        const sections = [
          "Administration",
          "Supervision",
          "Analyse",
          "Plateforme",
        ];

        return sections
          .map(
            (
              section,
            ) => ({
              section,

              items:
                navigation.filter(
                  (
                    item,
                  ) =>
                    item.section ===
                    section,
                ),
            }),
          )
          .filter(
            (
              group,
            ) =>
              group.items.length >
              0,
          );
      },
      [
        navigation,
      ],
    );

  /*
  |--------------------------------------------------------------------------
  | THEME
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    localStorage.setItem(
      THEME_STORAGE_KEY,
      theme,
    );

    document.documentElement.setAttribute(
      "data-admin-theme",
      theme,
    );

    document.body.setAttribute(
      "data-admin-theme",
      theme,
    );
  }, [
    theme,
  ]);

  /*
  |--------------------------------------------------------------------------
  | PROFILE UPDATE
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    function handleProfileUpdate(
      event,
    ) {
      if (
        event?.detail
      ) {
        setUser(
          event.detail,
        );

        return;
      }

      setUser(
        getStoredUser(),
      );
    }

    window.addEventListener(
      "admin-profile-updated",
      handleProfileUpdate,
    );

    return () => {
      window.removeEventListener(
        "admin-profile-updated",
        handleProfileUpdate,
      );
    };
  }, []);

  /*
  |--------------------------------------------------------------------------
  | MOBILE
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    setMobileSidebarOpen(
      false,
    );
  }, [
    location.pathname,
  ]);

  /*
  |--------------------------------------------------------------------------
  | USER
  |--------------------------------------------------------------------------
  */

  const fullName =
    useMemo(
      () => {
        const stored =
          String(
            user?.fullName ||
              "",
          ).trim();

        if (stored) {
          return stored;
        }

        return (
          [
            user?.firstName,
            user?.lastName,
          ]
            .filter(Boolean)
            .join(" ")
            .trim() ||
          user?.email ||
          "Administrateur"
        );
      },
      [
        user,
      ],
    );

  const initials =
    useMemo(
      () =>
        getUserInitials(
          user,
        ),
      [
        user,
      ],
    );

  const avatar =
    resolveAvatarUrl(
      user?.avatarUrl ||
        user?.avatar_url,
    );

  const currentLogo =
    theme === "dark"
      ? logoLight
      : logoDark;

  /*
  |--------------------------------------------------------------------------
  | ACTIONS
  |--------------------------------------------------------------------------
  */

  function toggleTheme() {
    setTheme(
      (
        current,
      ) =>
        current ===
        "dark"
          ? "light"
          : "dark",
    );
  }

  function handleLogout() {
    localStorage.removeItem(
      "auth_token",
    );

    localStorage.removeItem(
      "auth_user",
    );

    sessionStorage.removeItem(
      "auth_token",
    );

    sessionStorage.removeItem(
      "auth_user",
    );

    navigate(
      "/auth?mode=login",
      {
        replace:
          true,
      },
    );
  }

  const resolvedDescription =
    description ||
    subtitle ||
    "";

  /*
  |--------------------------------------------------------------------------
  | RENDER
  |--------------------------------------------------------------------------
  */

  return (
    <div
      className={`admin-shell admin-shell--${theme}`}
    >
      <div
        className="admin-shell__background"
        aria-hidden="true"
      >
        <span className="admin-shell__background-grid" />

        <span className="admin-shell__background-orb admin-shell__background-orb--one" />

        <span className="admin-shell__background-orb admin-shell__background-orb--two" />

        <span className="admin-shell__background-orb admin-shell__background-orb--three" />
      </div>

      <button
        type="button"
        className="admin-shell__mobile-button"
        onClick={() =>
          setMobileSidebarOpen(
            (
              current,
            ) =>
              !current,
          )
        }
        aria-label="Ouvrir le menu administrateur"
      >
        ☰
      </button>

      {mobileSidebarOpen && (
        <button
          type="button"
          className="admin-shell__mobile-overlay"
          onClick={() =>
            setMobileSidebarOpen(
              false,
            )
          }
          aria-label="Fermer le menu"
        />
      )}

      <aside
        className={`admin-shell__sidebar${
          mobileSidebarOpen
            ? " admin-shell__sidebar--open"
            : ""
        }`}
      >
        <div className="admin-shell__sidebar-main">
          <div className="admin-shell__brand">
            <img
              src={
                currentLogo
              }
              alt="Tenor"
              className="admin-shell__brand-logo"
            />
          </div>

          <nav className="admin-shell__navigation">
            {groupedNavigation.map(
              (
                group,
              ) => (
                <div
                  key={
                    group.section
                  }
                  className="admin-shell__navigation-group"
                >
                  <span className="admin-shell__section-title">
                    {
                      group.section
                    }
                  </span>

                  <div className="admin-shell__navigation-group-links">
                    {group.items.map(
                      (
                        item,
                      ) => (
                        <NavLink
                          key={
                            item.path
                          }
                          to={
                            item.path
                          }
                          className={({
                            isActive,
                          }) =>
                            `admin-shell__navigation-link${
                              isActive
                                ? " admin-shell__navigation-link--active"
                                : ""
                            }`
                          }
                        >
                          <span className="admin-shell__navigation-icon">
                            {
                              item.icon
                            }
                          </span>

                          <span className="admin-shell__navigation-label">
                            {
                              item.label
                            }
                          </span>

                          <span className="admin-shell__navigation-arrow">
                            ›
                          </span>
                        </NavLink>
                      ),
                    )}
                  </div>
                </div>
              ),
            )}
          </nav>
        </div>

        <div className="admin-shell__sidebar-bottom">
          <div className="admin-shell__theme-card">
            <div className="admin-shell__theme-copy">
              <span>
                Apparence
              </span>

              <strong>
                {theme ===
                "dark"
                  ? "Mode sombre"
                  : "Mode clair"}
              </strong>
            </div>

            <button
              type="button"
              className="admin-shell__theme-toggle"
              onClick={
                toggleTheme
              }
              aria-label="Changer le thème"
            >
              {theme ===
              "dark"
                ? "☀️"
                : "🌙"}
            </button>
          </div>

          <button
            type="button"
            className="admin-shell__profile"
            onClick={() =>
              navigate(
                "/admin/profile",
              )
            }
          >
            <span className="admin-shell__avatar">
              {avatar ? (
                <img
                  src={
                    avatar
                  }
                  alt={
                    fullName
                  }
                  className="admin-shell__avatar-image"
                />
              ) : (
                initials
              )}
            </span>

            <span className="admin-shell__profile-copy">
              <strong>
                {
                  fullName
                }
              </strong>

              <small>
                👑 ADMIN
              </small>
            </span>

            <span className="admin-shell__profile-arrow">
              ›
            </span>
          </button>

          <button
            type="button"
            className="admin-shell__logout"
            onClick={
              handleLogout
            }
          >
            <span>
              ↪
            </span>

            <span>
              Déconnexion
            </span>
          </button>
        </div>
      </aside>

      <div className="admin-shell__workspace">
        <header className="admin-shell__header">
          <div className="admin-shell__header-copy">
            <span className="admin-shell__eyebrow">
              {
                eyebrow
              }
            </span>

            <h1>
              {
                title
              }
            </h1>

            {resolvedDescription && (
              <p>
                {
                  resolvedDescription
                }
              </p>
            )}
          </div>

          <div className="admin-shell__header-actions">
            <button
              type="button"
              className="admin-shell__header-theme"
              onClick={
                toggleTheme
              }
              aria-label="Changer le thème"
            >
              {theme ===
              "dark"
                ? "☀️"
                : "🌙"}
            </button>

            {actions && (
              <div className="admin-shell__custom-actions">
                {
                  actions
                }
              </div>
            )}
          </div>
        </header>

        <main className="admin-shell__content">
          {
            children
          }
        </main>
      </div>
    </div>
  );
}

export default AdminShell;