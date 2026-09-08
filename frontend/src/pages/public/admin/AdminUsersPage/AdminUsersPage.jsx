import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import AdminShell from "../AdminShell/AdminShell";

import {
  getAccessToken,
  getStoredUser,
} from "../../../../services/authService";

import "./AdminUsersPage.css";

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

const AUTO_REFRESH_INTERVAL =
  15000;

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function safeArray(
  value,
) {
  return Array.isArray(
    value,
  )
    ? value
    : [];
}

function normalizeRole(
  value,
) {
  return String(
    value || "",
  )
    .trim()
    .toUpperCase();
}

function normalizeProvider(
  value,
) {
  return String(
    value || "local",
  )
    .trim()
    .toLowerCase();
}

function formatInteger(
  value,
) {
  const number =
    Number(value);

  return new Intl.NumberFormat(
    "fr-FR",
  ).format(
    Number.isFinite(
      number,
    )
      ? number
      : 0,
  );
}

function formatDate(
  value,
) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "fr-FR",
    {
      day:
        "2-digit",

      month:
        "short",

      year:
        "numeric",
    },
  ).format(
    date,
  );
}

function formatDateTime(
  value,
) {
  if (!value) {
    return "Aucune activité";
  }

  const date =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "Aucune activité";
  }

  return new Intl.DateTimeFormat(
    "fr-FR",
    {
      dateStyle:
        "short",

      timeStyle:
        "short",
    },
  ).format(
    date,
  );
}

function getInitials(
  user,
) {
  const first =
    String(
      user?.first_name ||
        user?.firstName ||
        "",
    )
      .trim()
      .charAt(0);

  const last =
    String(
      user?.last_name ||
        user?.lastName ||
        "",
    )
      .trim()
      .charAt(0);

  const initials =
    `${first}${last}`
      .trim()
      .toUpperCase();

  if (
    initials
  ) {
    return initials;
  }

  return String(
    user?.email ||
      "US",
  )
    .slice(
      0,
      2,
    )
    .toUpperCase();
}

function getProviderData(
  value,
) {
  const provider =
    normalizeProvider(
      value,
    );

  if (
    provider ===
    "google"
  ) {
    return {
      label:
        "Google",

      icon:
        "🌐",

      className:
        "admin-users-provider--google",
    };
  }

  if (
    provider ===
    "github"
  ) {
    return {
      label:
        "GitHub",

      icon:
        "💻",

      className:
        "admin-users-provider--github",
    };
  }

  return {
    label:
      "Local",

    icon:
      "🔑",

    className:
      "admin-users-provider--local",
  };
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
| PAGE
|--------------------------------------------------------------------------
*/

function AdminUsersPage() {
  const currentUser =
    getStoredUser();

  const [
    users,
    setUsers,
  ] =
    useState([]);

  const [
    stats,
    setStats,
  ] =
    useState({});

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] =
    useState("");

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    roleFilter,
    setRoleFilter,
  ] =
    useState("");

  const [
    statusFilter,
    setStatusFilter,
  ] =
    useState("");

  const [
    providerFilter,
    setProviderFilter,
  ] =
    useState("");

  const [
    organizationFilter,
    setOrganizationFilter,
  ] =
    useState("");

  const [
    updatingUserId,
    setUpdatingUserId,
  ] =
    useState(null);

  /*
  |--------------------------------------------------------------------------
  | LOAD
  |--------------------------------------------------------------------------
  */

  const loadUsers =
    useCallback(
      async ({
        silent = false,
      } = {}) => {
        const token =
          getAccessToken();

        if (!token) {
          setError(
            "Session administrateur introuvable.",
          );

          setLoading(
            false,
          );

          return;
        }

        if (silent) {
          setRefreshing(
            true,
          );
        } else {
          setLoading(
            true,
          );
        }

        try {
          const response =
            await fetch(
              `${API_BASE_URL}/api/admin/users`,
              {
                method:
                  "GET",

                headers: {
                  Accept:
                    "application/json",

                  Authorization:
                    `Bearer ${token}`,
                },

                cache:
                  "no-store",
              },
            );

          const text =
            await response.text();

          let data =
            {};

          if (
            text
          ) {
            try {
              data =
                JSON.parse(
                  text,
                );
            } catch {
              data = {
                message:
                  text,
              };
            }
          }

          if (
            !response.ok
          ) {
            throw new Error(
              data?.message ||
                `Erreur HTTP ${response.status}`,
            );
          }

          setUsers(
            safeArray(
              data?.users,
            ),
          );

          setStats(
            data?.stats ||
              {},
          );

          setError(
            "",
          );
        } catch (
          loadError
        ) {
          console.error(
            "Admin users error:",
            loadError,
          );

          setError(
            loadError?.message ||
              "Impossible de charger les utilisateurs.",
          );
        } finally {
          setLoading(
            false,
          );

          setRefreshing(
            false,
          );
        }
      },
      [],
    );

  /*
  |--------------------------------------------------------------------------
  | INITIAL + AUTO REFRESH
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    loadUsers();

    const interval =
      window.setInterval(
        () => {
          loadUsers({
            silent:
              true,
          });
        },
        AUTO_REFRESH_INTERVAL,
      );

    return () => {
      window.clearInterval(
        interval,
      );
    };
  }, [
    loadUsers,
  ]);

  /*
  |--------------------------------------------------------------------------
  | ORGANIZATIONS
  |--------------------------------------------------------------------------
  */

  const organizations =
    useMemo(
      () =>
        [
          ...new Set(
            users
              .map(
                (
                  user,
                ) =>
                  String(
                    user.organization_name ||
                      "",
                  ).trim(),
              )
              .filter(Boolean),
          ),
        ].sort(),
      [
        users,
      ],
    );

  /*
  |--------------------------------------------------------------------------
  | FILTER
  |--------------------------------------------------------------------------
  */

  const filteredUsers =
    useMemo(
      () => {
        const needle =
          search
            .trim()
            .toLowerCase();

        return users.filter(
          (
            user,
          ) => {
            const role =
              normalizeRole(
                user.role,
              );

            const provider =
              normalizeProvider(
                user.auth_provider,
              );

            if (
              roleFilter &&
              role !==
                roleFilter
            ) {
              return false;
            }

            if (
              statusFilter ===
                "ACTIVE" &&
              !user.is_active
            ) {
              return false;
            }

            if (
              statusFilter ===
                "INACTIVE" &&
              user.is_active
            ) {
              return false;
            }

            if (
              providerFilter &&
              provider !==
                providerFilter
            ) {
              return false;
            }

            if (
              organizationFilter &&
              user.organization_name !==
                organizationFilter
            ) {
              return false;
            }

            if (
              !needle
            ) {
              return true;
            }

            const haystack =
              [
                user.full_name,
                user.first_name,
                user.last_name,
                user.email,
                user.organization_name,
                user.organization_country,
                user.role,
                user.auth_provider,
              ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return haystack.includes(
              needle,
            );
          },
        );
      },
      [
        users,
        search,
        roleFilter,
        statusFilter,
        providerFilter,
        organizationFilter,
      ],
    );

  /*
  |--------------------------------------------------------------------------
  | RESET
  |--------------------------------------------------------------------------
  */

  function resetFilters() {
    setSearch(
      "",
    );

    setRoleFilter(
      "",
    );

    setStatusFilter(
      "",
    );

    setProviderFilter(
      "",
    );

    setOrganizationFilter(
      "",
    );
  }

  /*
  |--------------------------------------------------------------------------
  | CHANGE USER STATUS
  |--------------------------------------------------------------------------
  */

  async function handleStatusChange(
    user,
  ) {
    const currentUserId =
      String(
        currentUser?.id ||
          "",
      ).toLowerCase();

    const targetUserId =
      String(
        user?.id ||
          "",
      ).toLowerCase();

    const nextStatus =
      !user.is_active;

    if (
      currentUserId &&
      currentUserId ===
        targetUserId &&
      nextStatus === false
    ) {
      setError(
        "Vous ne pouvez pas désactiver votre propre compte administrateur.",
      );

      return;
    }

    const action =
      nextStatus
        ? "activer"
        : "désactiver";

    const confirmed =
      window.confirm(
        `Voulez-vous vraiment ${action} le compte de ${user.full_name || user.email} ?`,
      );

    if (
      !confirmed
    ) {
      return;
    }

    const token =
      getAccessToken();

    if (!token) {
      setError(
        "Session administrateur introuvable.",
      );

      return;
    }

    setUpdatingUserId(
      user.id,
    );

    setError(
      "",
    );

    setSuccessMessage(
      "",
    );

    try {
      const response =
        await fetch(
          `${API_BASE_URL}/api/admin/users/${user.id}/status`,
          {
            method:
              "PATCH",

            headers: {
              Accept:
                "application/json",

              "Content-Type":
                "application/json",

              Authorization:
                `Bearer ${token}`,
            },

            body:
              JSON.stringify({
                is_active:
                  nextStatus,
              }),
          },
        );

      const text =
        await response.text();

      let data =
        {};

      if (
        text
      ) {
        try {
          data =
            JSON.parse(
              text,
            );
        } catch {
          data = {
            message:
              text,
          };
        }
      }

      if (
        !response.ok
      ) {
        throw new Error(
          data?.message ||
            "Impossible de modifier le compte.",
        );
      }

      setUsers(
        (
          current,
        ) =>
          current.map(
            (
              currentUserItem,
            ) =>
              currentUserItem.id ===
              user.id
                ? {
                    ...currentUserItem,

                    is_active:
                      nextStatus,
                  }
                : currentUserItem,
          ),
      );

      setStats(
        (
          current,
        ) => ({
          ...current,

          active:
            Number(
              current.active ||
                0,
            ) +
            (nextStatus
              ? 1
              : -1),

          inactive:
            Number(
              current.inactive ||
                0,
            ) +
            (nextStatus
              ? -1
              : 1),
        }),
      );

      setSuccessMessage(
        nextStatus
          ? "Utilisateur activé avec succès."
          : "Utilisateur désactivé avec succès.",
      );
    } catch (
      updateError
    ) {
      console.error(
        "Update user status error:",
        updateError,
      );

      setError(
        updateError?.message ||
          "Impossible de modifier l'utilisateur.",
      );
    } finally {
      setUpdatingUserId(
        null,
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | HEADER ACTIONS
  |--------------------------------------------------------------------------
  */

  const actions = (
    <button
      type="button"
      className="admin-action-btn"
      onClick={() =>
        loadUsers({
          silent:
            true,
        })
      }
      disabled={
        refreshing
      }
    >
      {refreshing
        ? "Actualisation..."
        : "↻ Actualiser"}
    </button>
  );

  return (
    <AdminShell
      eyebrow="Gestion des accès"
      title="Utilisateurs"
      actions={
        actions
      }
    >
      <section className="admin-users">
        {/*
        |--------------------------------------------------------------------------
        | MESSAGES
        |--------------------------------------------------------------------------
        */}

        {error && (
          <div className="admin-users-message admin-users-message--error">
            <div>
              <strong>
                ⚠ Une action nécessite votre attention
              </strong>

              <p>
                {
                  error
                }
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setError(
                  "",
                )
              }
            >
              ×
            </button>
          </div>
        )}

        {successMessage && (
          <div className="admin-users-message admin-users-message--success">
            <div>
              <strong>
                ✓ Modification enregistrée
              </strong>

              <p>
                {
                  successMessage
                }
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setSuccessMessage(
                  "",
                )
              }
            >
              ×
            </button>
          </div>
        )}

        {/*
        |--------------------------------------------------------------------------
        | STATS
        |--------------------------------------------------------------------------
        */}

        <div className="admin-users__stats">
          <button
            type="button"
            className="admin-users-stat admin-users-stat--purple"
            onClick={
              resetFilters
            }
          >
            <span>
              👥 Utilisateurs
            </span>

            <strong>
              {formatInteger(
                stats.total,
              )}
            </strong>

            <small>
              Tous les comptes
            </small>
          </button>

          <button
            type="button"
            className="admin-users-stat admin-users-stat--green"
            onClick={() =>
              setStatusFilter(
                "ACTIVE",
              )
            }
          >
            <span>
              🟢 Actifs
            </span>

            <strong>
              {formatInteger(
                stats.active,
              )}
            </strong>

            <small>
              Accès autorisé
            </small>
          </button>

          <button
            type="button"
            className="admin-users-stat admin-users-stat--blue"
            onClick={() =>
              setRoleFilter(
                "CLIENT",
              )
            }
          >
            <span>
              👤 Clients
            </span>

            <strong>
              {formatInteger(
                stats.clients,
              )}
            </strong>

            <small>
              Comptes clients
            </small>
          </button>

          <button
            type="button"
            className="admin-users-stat admin-users-stat--orange"
            onClick={() =>
              setRoleFilter(
                "ADMIN",
              )
            }
          >
            <span>
              👑 Administrateurs
            </span>

            <strong>
              {formatInteger(
                stats.admins,
              )}
            </strong>

            <small>
              Accès global
            </small>
          </button>
        </div>

        {/*
        |--------------------------------------------------------------------------
        | ACCESS OVERVIEW
        |--------------------------------------------------------------------------
        */}

        <article className="admin-users-access">
          <div className="admin-users-access__copy">
            <span className="admin-users-access__icon">
              🔐
            </span>

            <div>
              <span>
                Contrôle des accès
              </span>

              <strong>
                {formatInteger(
                  stats.active,
                )} compte(s) autorisé(s)
              </strong>

              <p>
                Vous pouvez désactiver un compte sans le supprimer de la base de données.
              </p>
            </div>
          </div>

          <div className="admin-users-access__providers">
            <div>
              <span>
                🌐 Google
              </span>

              <strong>
                {formatInteger(
                  stats.google,
                )}
              </strong>
            </div>

            <div>
              <span>
                💻 GitHub
              </span>

              <strong>
                {formatInteger(
                  stats.github,
                )}
              </strong>
            </div>

            <div>
              <span>
                🔑 Local
              </span>

              <strong>
                {formatInteger(
                  stats.local,
                )}
              </strong>
            </div>
          </div>
        </article>

        {/*
        |--------------------------------------------------------------------------
        | FILTERS
        |--------------------------------------------------------------------------
        */}

        <article className="admin-users__filters">
          <div className="admin-users-search">
            <span>
              🔎
            </span>

            <input
              type="search"
              value={
                search
              }
              onChange={(
                event,
              ) =>
                setSearch(
                  event.target.value,
                )
              }
              placeholder="Nom, e-mail, organisation..."
            />
          </div>

          <select
            value={
              roleFilter
            }
            onChange={(
              event,
            ) =>
              setRoleFilter(
                event.target.value,
              )
            }
          >
            <option value="">
              Tous les rôles
            </option>

            <option value="ADMIN">
              Administrateurs
            </option>

            <option value="CLIENT">
              Clients
            </option>
          </select>

          <select
            value={
              statusFilter
            }
            onChange={(
              event,
            ) =>
              setStatusFilter(
                event.target.value,
              )
            }
          >
            <option value="">
              Tous les états
            </option>

            <option value="ACTIVE">
              Actifs
            </option>

            <option value="INACTIVE">
              Inactifs
            </option>
          </select>

          <select
            value={
              providerFilter
            }
            onChange={(
              event,
            ) =>
              setProviderFilter(
                event.target.value,
              )
            }
          >
            <option value="">
              Toutes les connexions
            </option>

            <option value="google">
              Google
            </option>

            <option value="github">
              GitHub
            </option>

            <option value="local">
              Local
            </option>
          </select>

          <select
            value={
              organizationFilter
            }
            onChange={(
              event,
            ) =>
              setOrganizationFilter(
                event.target.value,
              )
            }
          >
            <option value="">
              Toutes les organisations
            </option>

            {organizations.map(
              (
                organization,
              ) => (
                <option
                  key={
                    organization
                  }
                  value={
                    organization
                  }
                >
                  {
                    organization
                  }
                </option>
              ),
            )}
          </select>

          <button
            type="button"
            className="admin-users__reset"
            onClick={
              resetFilters
            }
          >
            Réinitialiser
          </button>
        </article>

        {/*
        |--------------------------------------------------------------------------
        | USERS PANEL
        |--------------------------------------------------------------------------
        */}

        <article className="admin-users__panel">
          <header className="admin-users__panel-header">
            <div>
              <span>
                Comptes enregistrés
              </span>

              <h2>
                Répertoire utilisateurs
              </h2>

              <p>
                {formatInteger(
                  filteredUsers.length,
                )} résultat(s)
              </p>
            </div>
          </header>

          {loading ? (
            <div className="admin-users__loading">
              <span />

              <p>
                Chargement des utilisateurs...
              </p>
            </div>
          ) : filteredUsers.length ===
            0 ? (
            <div className="admin-users__empty">
              <span>
                👥
              </span>

              <h3>
                Aucun utilisateur
              </h3>

              <p>
                Aucun compte ne correspond aux filtres sélectionnés.
              </p>
            </div>
          ) : (
            <div className="admin-users-table-wrapper">
              <table className="admin-users-table">
                <thead>
                  <tr>
                    <th>
                      Utilisateur
                    </th>

                    <th>
                      Organisation
                    </th>

                    <th>
                      Rôle
                    </th>

                    <th>
                      Connexion
                    </th>

                    <th>
                      Factures
                    </th>

                    <th>
                      Activité
                    </th>

                    <th>
                      Création
                    </th>

                    <th>
                      État
                    </th>

                    <th>
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredUsers.map(
                    (
                      user,
                    ) => {
                      const provider =
                        getProviderData(
                          user.auth_provider,
                        );

                      const avatar =
                        resolveAvatarUrl(
                          user.avatar_url,
                        );

                      const isCurrentUser =
                        String(
                          currentUser?.id ||
                            "",
                        ).toLowerCase() ===
                        String(
                          user.id ||
                            "",
                        ).toLowerCase();

                      const isUpdating =
                        updatingUserId ===
                        user.id;

                      return (
                        <tr
                          key={
                            user.id
                          }
                        >
                          <td>
                            <div className="admin-users-user">
                              <span className="admin-users-avatar">
                                {avatar ? (
                                  <img
                                    src={
                                      avatar
                                    }
                                    alt={
                                      user.full_name
                                    }
                                  />
                                ) : (
                                  getInitials(
                                    user,
                                  )
                                )}
                              </span>

                              <div>
                                <strong>
                                  {user.full_name ||
                                    user.email}
                                </strong>

                                <small>
                                  {
                                    user.email
                                  }
                                </small>

                                {isCurrentUser && (
                                  <em>
                                    Vous
                                  </em>
                                )}
                              </div>
                            </div>
                          </td>

                          <td>
                            <div className="admin-users-organization">
                              <strong>
                                {user.organization_name ||
                                  "Sans organisation"}
                              </strong>

                              <small>
                                {user.organization_country ||
                                  "—"}
                              </small>
                            </div>
                          </td>

                          <td>
                            <span
                              className={`admin-users-role ${
                                normalizeRole(
                                  user.role,
                                ) ===
                                "ADMIN"
                                  ? "admin-users-role--admin"
                                  : "admin-users-role--client"
                              }`}
                            >
                              {normalizeRole(
                                user.role,
                              ) ===
                              "ADMIN"
                                ? "👑 ADMIN"
                                : "👤 CLIENT"}
                            </span>
                          </td>

                          <td>
                            <span
                              className={`admin-users-provider ${provider.className}`}
                            >
                              {
                                provider.icon
                              }

                              {
                                provider.label
                              }
                            </span>
                          </td>

                          <td>
                            <div className="admin-users-invoices">
                              <strong>
                                {formatInteger(
                                  user.invoice_count,
                                )}
                              </strong>

                              <small>
                                {formatInteger(
                                  user.accepted_invoice_count,
                                )} acceptée(s)
                              </small>
                            </div>
                          </td>

                          <td>
                            <span className="admin-users-date">
                              {formatDateTime(
                                user.last_invoice_activity,
                              )}
                            </span>
                          </td>

                          <td>
                            <span className="admin-users-date">
                              {formatDate(
                                user.created_at,
                              )}
                            </span>
                          </td>

                          <td>
                            <span
                              className={`admin-users-status ${
                                user.is_active
                                  ? "admin-users-status--active"
                                  : "admin-users-status--inactive"
                              }`}
                            >
                              {user.is_active
                                ? "● Actif"
                                : "● Inactif"}
                            </span>
                          </td>

                          <td>
                            <button
                              type="button"
                              className={`admin-users-state-button ${
                                user.is_active
                                  ? "admin-users-state-button--disable"
                                  : "admin-users-state-button--enable"
                              }`}
                              onClick={() =>
                                handleStatusChange(
                                  user,
                                )
                              }
                              disabled={
                                isUpdating ||
                                (
                                  isCurrentUser &&
                                  user.is_active
                                )
                              }
                              title={
                                isCurrentUser
                                  ? "Votre propre compte administrateur ne peut pas être désactivé."
                                  : user.is_active
                                  ? "Désactiver le compte"
                                  : "Activer le compte"
                              }
                            >
                              {isUpdating
                                ? "…"
                                : user.is_active
                                ? "🔒 Désactiver"
                                : "🔓 Activer"}
                            </button>
                          </td>
                        </tr>
                      );
                    },
                  )}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </section>
    </AdminShell>
  );
}

export default AdminUsersPage;