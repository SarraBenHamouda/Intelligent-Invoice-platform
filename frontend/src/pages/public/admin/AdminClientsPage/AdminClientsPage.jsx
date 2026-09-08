import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Link,
} from "react-router-dom";

import AdminShell from "../AdminShell/AdminShell";

import {
  getAccessToken,
} from "../../../../services/authService";

import "./AdminClientsPage.css";

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

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function toNumber(
  value,
  fallback = 0,
) {
  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function formatInteger(value) {
  return new Intl.NumberFormat(
    "fr-FR",
  ).format(
    toNumber(value),
  );
}

function formatPercent(value) {
  return `${toNumber(
    value,
  ).toFixed(1)} %`;
}

function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

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
      dateStyle:
        "short",

      timeStyle:
        "short",
    },
  ).format(date);
}

function formatRelativeDate(value) {
  if (!value) {
    return "Aucune activité";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "Aucune activité";
  }

  const difference =
    Date.now() -
    date.getTime();

  if (
    difference < 0
  ) {
    return formatDateTime(
      value,
    );
  }

  const minutes =
    Math.floor(
      difference /
      60000,
    );

  if (
    minutes < 1
  ) {
    return "À l'instant";
  }

  if (
    minutes < 60
  ) {
    return `Il y a ${minutes} min`;
  }

  const hours =
    Math.floor(
      minutes /
      60,
    );

  if (
    hours < 24
  ) {
    return `Il y a ${hours} h`;
  }

  const days =
    Math.floor(
      hours /
      24,
    );

  if (
    days < 7
  ) {
    return `Il y a ${days} j`;
  }

  return formatDateTime(
    value,
  );
}

function getOrganizationInitials(
  value,
) {
  const words =
    String(
      value ||
        "Organisation",
    )
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  const initials =
    words
      .slice(
        0,
        2,
      )
      .map(
        (word) =>
          word
            .charAt(0)
            .toUpperCase(),
      )
      .join("");

  return (
    initials ||
    "OR"
  );
}

function getStatusClass(
  isActive,
) {
  return isActive
    ? "admin-clients-status admin-clients-status--active"
    : "admin-clients-status admin-clients-status--inactive";
}

/*
|--------------------------------------------------------------------------
| PAGE
|--------------------------------------------------------------------------
*/

function AdminClientsPage() {
  const [
    clients,
    setClients,
  ] =
    useState([]);

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
    search,
    setSearch,
  ] =
    useState("");

  const [
    activityFilter,
    setActivityFilter,
  ] =
    useState("");

  /*
  |--------------------------------------------------------------------------
  | DELETE STATE
  |--------------------------------------------------------------------------
  */

  const [
    deleteTarget,
    setDeleteTarget,
  ] =
    useState(null);

  const [
    deletingClient,
    setDeletingClient,
  ] =
    useState(false);

  const [
    deleteError,
    setDeleteError,
  ] =
    useState("");

  /*
  |--------------------------------------------------------------------------
  | LOAD CLIENTS
  |--------------------------------------------------------------------------
  */

  const loadClients =
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
              `${API_BASE_URL}/api/admin/clients`,
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

          const responseText =
            await response.text();

          let data =
            {};

          if (
            responseText
          ) {
            try {
              data =
                JSON.parse(
                  responseText,
                );
            } catch {
              data = {
                message:
                  responseText,
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

          const list =
            safeArray(
              data?.clients ||
                data?.organizations ||
                data?.data ||
                data,
            );

          setClients(
            list,
          );

          setError(
            "",
          );
        } catch (
          loadError
        ) {
          console.error(
            "Admin clients error:",
            loadError,
          );

          setError(
            loadError?.message ||
              "Impossible de charger les clients.",
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
  | INITIAL LOAD + AUTO REFRESH
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    loadClients();

    const interval =
      window.setInterval(
        () => {
          loadClients({
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
    loadClients,
  ]);

  /*
  |--------------------------------------------------------------------------
  | DELETE MODAL BODY LOCK
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (!deleteTarget) {
      return undefined;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    function handleEscape(event) {
      if (
        event.key === "Escape" &&
        !deletingClient
      ) {
        setDeleteTarget(null);
        setDeleteError("");
      }
    }

    window.addEventListener(
      "keydown",
      handleEscape,
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        "keydown",
        handleEscape,
      );
    };
  }, [
    deleteTarget,
    deletingClient,
  ]);

  /*
  |--------------------------------------------------------------------------
  | NORMALIZED CLIENTS
  |--------------------------------------------------------------------------
  */

  const normalizedClients =
    useMemo(
      () =>
        clients.map(
          (
            client,
          ) => {
            const totalInvoices =
              toNumber(
                client.total_invoices ??
                  client.invoice_count,
              );

            const acceptedInvoices =
              toNumber(
                client.accepted_invoices ??
                  client.accepted_count,
              );

            const actionRequired =
              toNumber(
                client.action_required ??
                  client.action_required_count,
              );

            const usersCount =
              toNumber(
                client.users_count ??
                  client.user_count,
              );

            const acceptanceRate =
              totalInvoices > 0
                ? (
                    acceptedInvoices /
                    totalInvoices
                  ) *
                  100
                : 0;

            return {
              ...client,

              organization_name:
                client.organization_name ||
                client.name ||
                "Organisation sans nom",

              country_code:
                client.country_code ||
                client.country ||
                "—",

              users_count:
                usersCount,

              total_invoices:
                totalInvoices,

              accepted_invoices:
                acceptedInvoices,

              action_required:
                actionRequired,

              acceptance_rate:
                client.acceptance_rate ??
                acceptanceRate,

              last_activity:
                client.last_activity ||
                client.updated_at ||
                client.last_invoice_at ||
                null,

              is_active:
                client.is_active !==
                false,
            };
          },
        ),
      [
        clients,
      ],
    );

  /*
  |--------------------------------------------------------------------------
  | FILTER
  |--------------------------------------------------------------------------
  */

  const filteredClients =
    useMemo(
      () => {
        const needle =
          search
            .trim()
            .toLowerCase();

        return normalizedClients.filter(
          (
            client,
          ) => {
            if (
              activityFilter ===
                "active" &&
              !client.is_active
            ) {
              return false;
            }

            if (
              activityFilter ===
                "inactive" &&
              client.is_active
            ) {
              return false;
            }

            if (
              activityFilter ===
                "attention" &&
              client.action_required <=
                0
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
                client.organization_name,
                client.country_code,
                client.tax_identifier,
                client.email,
                client.contact_email,
                client.contact_name,
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
        normalizedClients,
        search,
        activityFilter,
      ],
    );

  /*
  |--------------------------------------------------------------------------
  | GLOBAL STATS
  |--------------------------------------------------------------------------
  */

  const statistics =
    useMemo(
      () => {
        let active =
          0;

        let users =
          0;

        let invoices =
          0;

        let attention =
          0;

        for (
          const client
          of normalizedClients
        ) {
          if (
            client.is_active
          ) {
            active +=
              1;
          }

          users +=
            client.users_count;

          invoices +=
            client.total_invoices;

          attention +=
            client.action_required;
        }

        return {
          total:
            normalizedClients.length,

          active,

          users,

          invoices,

          attention,
        };
      },
      [
        normalizedClients,
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

    setActivityFilter(
      "",
    );
  }

  /*
  |--------------------------------------------------------------------------
  | OPEN DELETE MODAL
  |--------------------------------------------------------------------------
  */

  function requestDeleteClient(
    client,
  ) {
    setDeleteError(
      "",
    );

    setDeleteTarget(
      client,
    );
  }

  /*
  |--------------------------------------------------------------------------
  | CLOSE DELETE MODAL
  |--------------------------------------------------------------------------
  */

  function closeDeleteClientModal() {
    if (
      deletingClient
    ) {
      return;
    }

    setDeleteError(
      "",
    );

    setDeleteTarget(
      null,
    );
  }

  /*
  |--------------------------------------------------------------------------
  | DELETE CLIENT
  |--------------------------------------------------------------------------
  */

  async function handleDeleteClient() {
    if (
      !deleteTarget
    ) {
      return;
    }

    const clientId =
      deleteTarget.id ||
      deleteTarget.organization_id;

    if (!clientId) {
      setDeleteError(
        "Impossible de déterminer l'identifiant de ce client.",
      );

      return;
    }

    const token =
      getAccessToken();

    if (!token) {
      setDeleteError(
        "Session administrateur introuvable.",
      );

      return;
    }

    try {
      setDeletingClient(
        true,
      );

      setDeleteError(
        "",
      );

      const response =
        await fetch(
          `${API_BASE_URL}/api/admin/clients/${encodeURIComponent(
            clientId,
          )}`,
          {
            method:
              "DELETE",

            headers: {
              Accept:
                "application/json",

              Authorization:
                `Bearer ${token}`,
            },
          },
        );

      const responseText =
        await response.text();

      let data =
        {};

      if (responseText) {
        try {
          data =
            JSON.parse(
              responseText,
            );
        } catch {
          data = {
            message:
              responseText,
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

      setClients(
        (currentClients) =>
          currentClients.filter(
            (client) => {
              const currentId =
                client.id ||
                client.organization_id;

              return String(
                currentId,
              ) !== String(
                clientId,
              );
            },
          ),
      );

      setDeleteTarget(
        null,
      );
    } catch (
      deleteClientError
    ) {
      console.error(
        "Delete admin client error:",
        deleteClientError,
      );

      setDeleteError(
        deleteClientError?.message ||
          "Impossible de supprimer ce client.",
      );
    } finally {
      setDeletingClient(
        false,
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | HEADER ACTION
  |--------------------------------------------------------------------------
  */

  const actions = (
    <button
      type="button"
      className="admin-action-btn"
      disabled={
        refreshing
      }
      onClick={() =>
        loadClients({
          silent:
            true,
        })
      }
    >
      {refreshing
        ? "Actualisation..."
        : "↻ Actualiser"}
    </button>
  );

  return (
    <AdminShell
      eyebrow="Portefeuille clients"
      title="Clients"
      actions={
        actions
      }
    >
      <section className="admin-clients">
        {error && (
          <div className="admin-clients__error">
            <div>
              <strong>
                ⚠ Impossible de charger les clients
              </strong>

              <p>
                {error}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                loadClients()
              }
            >
              Réessayer
            </button>
          </div>
        )}

        <div className="admin-clients__stats">
          <button
            type="button"
            className="admin-clients-stat admin-clients-stat--purple"
            onClick={
              resetFilters
            }
          >
            <span>
              🏢 Organisations
            </span>

            <strong>
              {formatInteger(
                statistics.total,
              )}
            </strong>

            <small>
              Enregistrées sur la plateforme
            </small>
          </button>

          <button
            type="button"
            className="admin-clients-stat admin-clients-stat--green"
            onClick={() =>
              setActivityFilter(
                "active",
              )
            }
          >
            <span>
              🟢 Clients actifs
            </span>

            <strong>
              {formatInteger(
                statistics.active,
              )}
            </strong>

            <small>
              Organisations actives
            </small>
          </button>

          <article className="admin-clients-stat admin-clients-stat--blue">
            <span>
              👥 Utilisateurs
            </span>

            <strong>
              {formatInteger(
                statistics.users,
              )}
            </strong>

            <small>
              Comptes utilisateurs
            </small>
          </article>

          <button
            type="button"
            className="admin-clients-stat admin-clients-stat--orange"
            onClick={() =>
              setActivityFilter(
                "attention",
              )
            }
          >
            <span>
              ⚠ Action requise
            </span>

            <strong>
              {formatInteger(
                statistics.attention,
              )}
            </strong>

            <small>
              Factures à surveiller
            </small>
          </button>
        </div>

        <article className="admin-clients-summary">
          <div className="admin-clients-summary__icon">
            🛰️
          </div>

          <div>
            <span>
              Activité globale
            </span>

            <strong>
              {formatInteger(
                statistics.invoices,
              )} facture(s) traitée(s)
            </strong>

            <p>
              Vue consolidée de l’activité de toutes les organisations clientes.
            </p>
          </div>
        </article>

        <article className="admin-clients__filters">
          <div className="admin-clients-search">
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
              placeholder="Rechercher une organisation, un pays, un identifiant..."
            />
          </div>

          <select
            value={
              activityFilter
            }
            onChange={(
              event,
            ) =>
              setActivityFilter(
                event.target.value,
              )
            }
          >
            <option value="">
              Tous les clients
            </option>

            <option value="active">
              Clients actifs
            </option>

            <option value="inactive">
              Clients inactifs
            </option>

            <option value="attention">
              Action requise
            </option>
          </select>

          <button
            type="button"
            className="admin-clients__reset"
            onClick={
              resetFilters
            }
          >
            Réinitialiser
          </button>
        </article>

        <article className="admin-clients__panel">
          <header className="admin-clients__panel-header">
            <div>
              <span>
                Organisations
              </span>

              <h2>
                Portefeuille clients
              </h2>

              <p>
                {formatInteger(
                  filteredClients.length,
                )} organisation(s)
              </p>
            </div>
          </header>

          {loading ? (
            <div className="admin-clients__loading">
              <span />

              <p>
                Chargement des clients...
              </p>
            </div>
          ) : filteredClients.length ===
            0 ? (
            <div className="admin-clients__empty">
              <span>
                🏢
              </span>

              <h3>
                Aucun client
              </h3>

              <p>
                Aucune organisation ne correspond aux filtres sélectionnés.
              </p>
            </div>
          ) : (
            <div className="admin-clients-grid">
              {filteredClients.map(
                (
                  client,
                ) => {
                  const clientId =
                    client.id ||
                    client.organization_id;

                  return (
                    <article
                      key={
                        clientId ||
                        client.organization_name
                      }
                      className="admin-client-card"
                    >
                      <div className="admin-client-card__top">
                        <div className="admin-client-card__identity">
                          <span className="admin-client-card__avatar">
                            {getOrganizationInitials(
                              client.organization_name,
                            )}
                          </span>

                          <div>
                            <span className="admin-client-card__eyebrow">
                              Organisation
                            </span>

                            <h3>
                              {client.organization_name}
                            </h3>

                            <small>
                              🌍 {client.country_code}
                            </small>
                          </div>
                        </div>

                        <span
                          className={getStatusClass(
                            client.is_active,
                          )}
                        >
                          {client.is_active
                            ? "● Actif"
                            : "● Inactif"}
                        </span>
                      </div>

                      <div className="admin-client-card__identifier">
                        <span>
                          Identifiant fiscal
                        </span>

                        <strong>
                          {client.tax_identifier ||
                            "Non renseigné"}
                        </strong>
                      </div>

                      <div className="admin-client-card__metrics">
                        <div>
                          <span>
                            👥
                          </span>

                          <strong>
                            {formatInteger(
                              client.users_count,
                            )}
                          </strong>

                          <small>
                            Utilisateurs
                          </small>
                        </div>

                        <div>
                          <span>
                            🧾
                          </span>

                          <strong>
                            {formatInteger(
                              client.total_invoices,
                            )}
                          </strong>

                          <small>
                            Factures
                          </small>
                        </div>

                        <div>
                          <span>
                            ✅
                          </span>

                          <strong>
                            {formatPercent(
                              client.acceptance_rate,
                            )}
                          </strong>

                          <small>
                            Acceptation
                          </small>
                        </div>
                      </div>

                      <div className="admin-client-card__health">
                        <div>
                          <span>
                            Factures acceptées
                          </span>

                          <strong>
                            {formatInteger(
                              client.accepted_invoices,
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Action requise
                          </span>

                          <strong
                            className={
                              client.action_required >
                              0
                                ? "admin-client-card__attention"
                                : ""
                            }
                          >
                            {formatInteger(
                              client.action_required,
                            )}
                          </strong>
                        </div>
                      </div>

                      <div className="admin-client-card__activity">
                        <div>
                          <span>
                            Dernière activité
                          </span>

                          <strong
                            title={formatDateTime(
                              client.last_activity,
                            )}
                          >
                            {formatRelativeDate(
                              client.last_activity,
                            )}
                          </strong>
                        </div>

                        <span className="admin-client-card__pulse">
                          <i />
                          Activité
                        </span>
                      </div>

                      <footer className="admin-client-card__footer">
                        <Link
                          to={`/admin/invoices?organization=${encodeURIComponent(
                            client.organization_name,
                          )}`}
                          className="admin-client-card__secondary"
                        >
                          🧾 Factures
                        </Link>

                        <Link
                          to={`/admin/clients/${clientId}`}
                          className="admin-client-card__primary"
                        >
                          Voir le client
                          <span>
                            →
                          </span>
                        </Link>

                        <button
                          type="button"
                          className="admin-client-card__delete"
                          onClick={() =>
                            requestDeleteClient(
                              client,
                            )
                          }
                        >
                          <span aria-hidden="true">
                            🗑
                          </span>

                          Supprimer
                        </button>
                      </footer>
                    </article>
                  );
                },
              )}
            </div>
          )}
        </article>
      </section>

      {deleteTarget && (
        <div
          className="admin-client-delete-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-client-delete-title"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeDeleteClientModal();
            }
          }}
        >
          <div className="admin-client-delete-modal__panel">
            <button
              type="button"
              className="admin-client-delete-modal__close"
              onClick={
                closeDeleteClientModal
              }
              disabled={
                deletingClient
              }
              aria-label="Fermer"
            >
              ×
            </button>

            <div className="admin-client-delete-modal__icon">
              !
            </div>

            <span className="admin-client-delete-modal__eyebrow">
              Suppression définitive
            </span>

            <h2 id="admin-client-delete-title">
              Supprimer ce client ?
            </h2>

            <p>
              Vous êtes sur le point de supprimer
              <strong>
                {" "}
                {deleteTarget.organization_name}
              </strong>
              .
            </p>

            <div className="admin-client-delete-modal__warning">
              <span>
                ⚠
              </span>

              <div>
                <strong>
                  Cette action peut être irréversible.
                </strong>

                <p>
                  Les utilisateurs et les données liées à cette organisation peuvent également être concernés selon la logique définie dans votre backend.
                </p>
              </div>
            </div>

            {deleteError && (
              <div className="admin-client-delete-modal__error">
                {deleteError}
              </div>
            )}

            <div className="admin-client-delete-modal__actions">
              <button
                type="button"
                className="admin-client-delete-modal__cancel"
                onClick={
                  closeDeleteClientModal
                }
                disabled={
                  deletingClient
                }
              >
                Annuler
              </button>

              <button
                type="button"
                className="admin-client-delete-modal__confirm"
                onClick={
                  handleDeleteClient
                }
                disabled={
                  deletingClient
                }
              >
                {deletingClient
                  ? "Suppression..."
                  : "Supprimer définitivement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

export default AdminClientsPage;