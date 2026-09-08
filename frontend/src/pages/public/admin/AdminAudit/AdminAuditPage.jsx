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

import "./AdminAuditPage.css";

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
  20000;

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

function normalize(value) {
  return String(
    value || "",
  )
    .trim()
    .toUpperCase();
}

function formatInteger(value) {
  const number =
    Number(value);

  return new Intl.NumberFormat(
    "fr-FR",
  ).format(
    Number.isFinite(number)
      ? number
      : 0,
  );
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
        "medium",

      timeStyle:
        "short",
    },
  ).format(date);
}

function formatRelativeDate(value) {
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

  const diff =
    Date.now() -
    date.getTime();

  const seconds =
    Math.max(
      0,
      Math.floor(
        diff / 1000,
      ),
    );

  if (
    seconds < 60
  ) {
    return "À l’instant";
  }

  const minutes =
    Math.floor(
      seconds / 60,
    );

  if (
    minutes < 60
  ) {
    return `Il y a ${minutes} min`;
  }

  const hours =
    Math.floor(
      minutes / 60,
    );

  if (
    hours < 24
  ) {
    return `Il y a ${hours} h`;
  }

  const days =
    Math.floor(
      hours / 24,
    );

  if (
    days < 7
  ) {
    return `Il y a ${days} j`;
  }

  return formatDateTime(value);
}

function getCategoryData(value) {
  const category =
    normalize(value);

  const map = {
    INVOICE: {
      label:
        "Facture",

      icon:
        "🧾",

      className:
        "admin-audit-category--invoice",
    },

    USER: {
      label:
        "Utilisateur",

      icon:
        "👤",

      className:
        "admin-audit-category--user",
    },

    ORGANIZATION: {
      label:
        "Organisation",

      icon:
        "🏢",

      className:
        "admin-audit-category--organization",
    },

    SYSTEM: {
      label:
        "Système",

      icon:
        "⚙️",

      className:
        "admin-audit-category--system",
    },
  };

  return (
    map[category] ||
    {
      label:
        category ||
        "Autre",

      icon:
        "•",

      className:
        "admin-audit-category--other",
    }
  );
}

function getSeverityData(value) {
  const severity =
    normalize(value);

  if (
    severity ===
    "HIGH"
  ) {
    return {
      label:
        "Critique",

      icon:
        "●",

      className:
        "admin-audit-severity--high",
    };
  }

  if (
    severity ===
    "MEDIUM"
  ) {
    return {
      label:
        "Attention",

      icon:
        "●",

      className:
        "admin-audit-severity--medium",
    };
  }

  return {
    label:
      "Information",

    icon:
      "●",

    className:
      "admin-audit-severity--info",
  };
}

function getEventTypeLabel(value) {
  const type =
    normalize(value);

  const labels = {
    USER_CREATED:
      "Utilisateur créé",

    ORGANIZATION_CREATED:
      "Organisation créée",

    INVOICE_CREATED:
      "Facture créée",

    INVOICE_UPDATED:
      "Facture mise à jour",

    INVOICE_ACCEPTED:
      "Facture acceptée",

    INVOICE_REJECTED:
      "Facture rejetée",

    INVOICE_ERROR:
      "Erreur facture",

    INVOICE_REVIEW_REQUIRED:
      "Révision requise",

    INVOICE_RETRY_REQUIRED:
      "Retry requis",

    INVOICE_SIGNED:
      "Facture signée",

    INVOICE_SUBMITTED:
      "Facture soumise",

    INVOICE_VALIDATED:
      "Facture validée",
  };

  return (
    labels[type] ||
    type ||
    "Événement"
  );
}

/*
|--------------------------------------------------------------------------
| PAGE
|--------------------------------------------------------------------------
*/

function AdminAuditPage() {
  const [
    events,
    setEvents,
  ] =
    useState([]);

  const [
    stats,
    setStats,
  ] =
    useState({});

  const [
    eventTypes,
    setEventTypes,
  ] =
    useState([]);

  const [
    organizations,
    setOrganizations,
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
    categoryFilter,
    setCategoryFilter,
  ] =
    useState("");

  const [
    severityFilter,
    setSeverityFilter,
  ] =
    useState("");

  const [
    eventTypeFilter,
    setEventTypeFilter,
  ] =
    useState("");

  const [
    organizationFilter,
    setOrganizationFilter,
  ] =
    useState("");

  const [
    expandedEventId,
    setExpandedEventId,
  ] =
    useState(null);

  /*
  |--------------------------------------------------------------------------
  | LOAD
  |--------------------------------------------------------------------------
  */

  const loadAudit =
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

          setLoading(false);

          return;
        }

        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        try {
          const response =
            await fetch(
              `${API_BASE_URL}/api/admin/audit`,
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

          if (text) {
            try {
              data =
                JSON.parse(text);
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

          setEvents(
            safeArray(
              data?.events,
            ),
          );

          setStats(
            data?.stats ||
              {},
          );

          setEventTypes(
            safeArray(
              data?.event_types,
            ),
          );

          setOrganizations(
            safeArray(
              data?.organizations,
            ),
          );

          setError("");
        } catch (
          loadError
        ) {
          console.error(
            "Admin audit error:",
            loadError,
          );

          setError(
            loadError?.message ||
              "Impossible de charger le journal d’activité.",
          );
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      [],
    );

  /*
  |--------------------------------------------------------------------------
  | INITIAL LOAD
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    loadAudit();

    const interval =
      window.setInterval(
        () => {
          loadAudit({
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
    loadAudit,
  ]);

  /*
  |--------------------------------------------------------------------------
  | FILTER
  |--------------------------------------------------------------------------
  */

  const filteredEvents =
    useMemo(
      () => {
        const needle =
          search
            .trim()
            .toLowerCase();

        return events.filter(
          (event) => {
            if (
              categoryFilter &&
              normalize(
                event.category,
              ) !==
                categoryFilter
            ) {
              return false;
            }

            if (
              severityFilter &&
              normalize(
                event.severity,
              ) !==
                severityFilter
            ) {
              return false;
            }

            if (
              eventTypeFilter &&
              normalize(
                event.event_type,
              ) !==
                eventTypeFilter
            ) {
              return false;
            }

            if (
              organizationFilter &&
              String(
                event.organization_name ||
                  "",
              ) !==
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
                event.title,
                event.description,
                event.event_type,
                event.actor_name,
                event.actor_email,
                event.organization_name,
                event.invoice_number,
                event.original_filename,
                event.current_stage,
                event.invoice_status,
                event.source,
                event.error_code,
                event.error_message,
                event.transaction_id,
                event.ttn_reference,
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
        events,
        search,
        categoryFilter,
        severityFilter,
        eventTypeFilter,
        organizationFilter,
      ],
    );

  /*
  |--------------------------------------------------------------------------
  | RESET
  |--------------------------------------------------------------------------
  */

  function resetFilters() {
    setSearch("");
    setCategoryFilter("");
    setSeverityFilter("");
    setEventTypeFilter("");
    setOrganizationFilter("");
  }

  /*
  |--------------------------------------------------------------------------
  | ACTION
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
        loadAudit({
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
      eyebrow="Traçabilité"
      title="Journal d’activité"
      actions={
        actions
      }
    >
      <section className="admin-audit">
        {/*
        |--------------------------------------------------------------------------
        | ERROR
        |--------------------------------------------------------------------------
        */}

        {error && (
          <article className="admin-audit__error">
            <div>
              <strong>
                ⚠ Impossible de charger le journal
              </strong>

              <p>
                {error}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                loadAudit()
              }
            >
              Réessayer
            </button>
          </article>
        )}

        {/*
        |--------------------------------------------------------------------------
        | STATS
        |--------------------------------------------------------------------------
        */}

        <div className="admin-audit__stats">
          <button
            type="button"
            className="admin-audit-stat admin-audit-stat--purple"
            onClick={
              resetFilters
            }
          >
            <span>
              📜 Événements
            </span>

            <strong>
              {formatInteger(
                stats.total,
              )}
            </strong>

            <small>
              Journal complet
            </small>
          </button>

          <button
            type="button"
            className="admin-audit-stat admin-audit-stat--blue"
            onClick={() =>
              setCategoryFilter(
                "INVOICE",
              )
            }
          >
            <span>
              🧾 Factures
            </span>

            <strong>
              {formatInteger(
                stats.invoices,
              )}
            </strong>

            <small>
              Activités métier
            </small>
          </button>

          <button
            type="button"
            className="admin-audit-stat admin-audit-stat--green"
            onClick={() =>
              setCategoryFilter(
                "USER",
              )
            }
          >
            <span>
              👤 Utilisateurs
            </span>

            <strong>
              {formatInteger(
                stats.users,
              )}
            </strong>

            <small>
              Comptes enregistrés
            </small>
          </button>

          <button
            type="button"
            className="admin-audit-stat admin-audit-stat--orange"
            onClick={() =>
              setSeverityFilter(
                "MEDIUM",
              )
            }
          >
            <span>
              ⚠ À surveiller
            </span>

            <strong>
              {formatInteger(
                stats.warnings,
              )}
            </strong>

            <small>
              Événements d’attention
            </small>
          </button>

          <button
            type="button"
            className="admin-audit-stat admin-audit-stat--red"
            onClick={() =>
              setSeverityFilter(
                "HIGH",
              )
            }
          >
            <span>
              🚨 Critiques
            </span>

            <strong>
              {formatInteger(
                stats.critical,
              )}
            </strong>

            <small>
              Incidents importants
            </small>
          </button>
        </div>

        {/*
        |--------------------------------------------------------------------------
        | OVERVIEW
        |--------------------------------------------------------------------------
        */}

        <div className="admin-audit__overview">
          <article className="admin-audit-summary">
            <header>
              <div>
                <span>
                  Aujourd’hui
                </span>

                <h2>
                  Activité récente
                </h2>
              </div>

              <strong>
                {formatInteger(
                  stats.today,
                )}
              </strong>
            </header>

            <p>
              Nombre d’événements enregistrés aujourd’hui dans le journal de supervision.
            </p>
          </article>

          <article className="admin-audit-summary">
            <header>
              <div>
                <span>
                  Organisations
                </span>

                <h2>
                  Répartition
                </h2>
              </div>

              <strong>
                {formatInteger(
                  organizations.length,
                )}
              </strong>
            </header>

            <div className="admin-audit-summary__organizations">
              {organizations
                .slice(
                  0,
                  4,
                )
                .map(
                  (
                    organization,
                  ) => (
                    <button
                      type="button"
                      key={
                        organization.organization_name
                      }
                      onClick={() =>
                        setOrganizationFilter(
                          organization.organization_name,
                        )
                      }
                    >
                      <span>
                        {organization.organization_name}
                      </span>

                      <strong>
                        {formatInteger(
                          organization.total,
                        )}
                      </strong>
                    </button>
                  ),
                )}
            </div>
          </article>
        </div>

        {/*
        |--------------------------------------------------------------------------
        | FILTERS
        |--------------------------------------------------------------------------
        */}

        <article className="admin-audit__filters">
          <div className="admin-audit-search">
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
              placeholder="Facture, utilisateur, organisation, erreur, événement..."
            />
          </div>

          <select
            value={
              categoryFilter
            }
            onChange={(
              event,
            ) =>
              setCategoryFilter(
                event.target.value,
              )
            }
          >
            <option value="">
              Toutes les catégories
            </option>

            <option value="INVOICE">
              Factures
            </option>

            <option value="USER">
              Utilisateurs
            </option>

            <option value="ORGANIZATION">
              Organisations
            </option>

            <option value="SYSTEM">
              Système
            </option>
          </select>

          <select
            value={
              severityFilter
            }
            onChange={(
              event,
            ) =>
              setSeverityFilter(
                event.target.value,
              )
            }
          >
            <option value="">
              Toutes les gravités
            </option>

            <option value="INFO">
              Information
            </option>

            <option value="MEDIUM">
              Attention
            </option>

            <option value="HIGH">
              Critique
            </option>
          </select>

          <select
            value={
              eventTypeFilter
            }
            onChange={(
              event,
            ) =>
              setEventTypeFilter(
                event.target.value,
              )
            }
          >
            <option value="">
              Tous les événements
            </option>

            {eventTypes.map(
              (
                item,
              ) => (
                <option
                  key={
                    item.event_type
                  }
                  value={
                    item.event_type
                  }
                >
                  {getEventTypeLabel(
                    item.event_type,
                  )} ({item.total})
                </option>
              ),
            )}
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
                item,
              ) => (
                <option
                  key={
                    item.organization_name
                  }
                  value={
                    item.organization_name
                  }
                >
                  {item.organization_name}
                </option>
              ),
            )}
          </select>

          <button
            type="button"
            className="admin-audit__reset"
            onClick={
              resetFilters
            }
          >
            Réinitialiser
          </button>
        </article>

        {/*
        |--------------------------------------------------------------------------
        | JOURNAL
        |--------------------------------------------------------------------------
        */}

        <article className="admin-audit__panel">
          <header className="admin-audit__panel-header">
            <div>
              <span>
                Historique
              </span>

              <h2>
                Journal des événements
              </h2>

              <p>
                {formatInteger(
                  filteredEvents.length,
                )} résultat(s)
              </p>
            </div>
          </header>

          {loading ? (
            <div className="admin-audit__loading">
              <span />

              <p>
                Chargement du journal...
              </p>
            </div>
          ) : filteredEvents.length ===
            0 ? (
            <div className="admin-audit__empty">
              <span>
                📜
              </span>

              <h3>
                Aucun événement
              </h3>

              <p>
                Aucun événement ne correspond aux filtres sélectionnés.
              </p>
            </div>
          ) : (
            <div className="admin-audit-timeline">
              {filteredEvents.map(
                (
                  event,
                ) => {
                  const category =
                    getCategoryData(
                      event.category,
                    );

                  const severity =
                    getSeverityData(
                      event.severity,
                    );

                  const expanded =
                    expandedEventId ===
                    event.id;

                  return (
                    <article
                      key={
                        event.id
                      }
                      className="admin-audit-event"
                    >
                      <div className="admin-audit-event__rail">
                        <span
                          className={`admin-audit-event__dot ${severity.className}`}
                        />

                        <span className="admin-audit-event__line" />
                      </div>

                      <div className="admin-audit-event__content">
                        <header className="admin-audit-event__header">
                          <div className="admin-audit-event__identity">
                            <span className="admin-audit-event__icon">
                              {event.icon ||
                                category.icon}
                            </span>

                            <div>
                              <div className="admin-audit-event__labels">
                                <span
                                  className={`admin-audit-category ${category.className}`}
                                >
                                  {category.label}
                                </span>

                                <span
                                  className={`admin-audit-severity ${severity.className}`}
                                >
                                  {severity.icon} {severity.label}
                                </span>
                              </div>

                              <h3>
                                {event.title ||
                                  getEventTypeLabel(
                                    event.event_type,
                                  )}
                              </h3>

                              <p>
                                {event.description ||
                                  "Aucune description disponible."}
                              </p>
                            </div>
                          </div>

                          <div className="admin-audit-event__time">
                            <strong>
                              {formatRelativeDate(
                                event.event_date,
                              )}
                            </strong>

                            <span>
                              {formatDateTime(
                                event.event_date,
                              )}
                            </span>
                          </div>
                        </header>

                        <div className="admin-audit-event__meta">
                          <span>
                            👤 {event.actor_name ||
                              "Système"}
                          </span>

                          {event.organization_name && (
                            <span>
                              🏢 {event.organization_name}
                            </span>
                          )}

                          {event.invoice_number && (
                            <span>
                              🧾 {event.invoice_number}
                            </span>
                          )}

                          {event.current_stage && (
                            <span>
                              ⚙️ {event.current_stage}
                            </span>
                          )}

                          {event.source && (
                            <span>
                              📥 {String(
                                event.source,
                              ).toUpperCase()}
                            </span>
                          )}
                        </div>

                        {(event.error_code ||
                          event.error_message) && (
                          <div className="admin-audit-event__error">
                            <span>
                              ⚠
                            </span>

                            <div>
                              <strong>
                                {event.error_code ||
                                  "ANOMALIE"}
                              </strong>

                              <p>
                                {event.error_message ||
                                  event.rejection_reason ||
                                  "Une anomalie a été enregistrée."}
                              </p>
                            </div>
                          </div>
                        )}

                        <footer className="admin-audit-event__footer">
                          <div className="admin-audit-event__footer-links">
                            {event.invoice_id && (
                              <Link
                                to={`/admin/invoices/${event.invoice_id}`}
                              >
                                Voir la facture
                                <span>
                                  →
                                </span>
                              </Link>
                            )}

                            {event.organization_id && (
                              <Link
                                to={`/admin/clients?organization=${encodeURIComponent(
                                  event.organization_name ||
                                    "",
                                )}`}
                              >
                                Organisation
                                <span>
                                  →
                                </span>
                              </Link>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setExpandedEventId(
                                expanded
                                  ? null
                                  : event.id,
                              )
                            }
                          >
                            Détails techniques
                            <span>
                              {expanded
                                ? "−"
                                : "+"}
                            </span>
                          </button>
                        </footer>

                        {expanded && (
                          <div className="admin-audit-event__technical">
                            <div>
                              <span>
                                Event type
                              </span>

                              <code>
                                {event.event_type ||
                                  "—"}
                              </code>
                            </div>

                            <div>
                              <span>
                                Event ID
                              </span>

                              <code>
                                {event.id ||
                                  "—"}
                              </code>
                            </div>

                            <div>
                              <span>
                                Actor ID
                              </span>

                              <code>
                                {event.actor_id ||
                                  "—"}
                              </code>
                            </div>

                            <div>
                              <span>
                                Invoice ID
                              </span>

                              <code>
                                {event.invoice_id ||
                                  "—"}
                              </code>
                            </div>

                            <div>
                              <span>
                                Organization ID
                              </span>

                              <code>
                                {event.organization_id ||
                                  "—"}
                              </code>
                            </div>

                            <div>
                              <span>
                                Transaction
                              </span>

                              <code>
                                {event.transaction_id ||
                                  "—"}
                              </code>
                            </div>

                            <div>
                              <span>
                                TTN Reference
                              </span>

                              <code>
                                {event.ttn_reference ||
                                  "—"}
                              </code>
                            </div>

                            <div>
                              <span>
                                Statut facture
                              </span>

                              <code>
                                {event.invoice_status ||
                                  "—"}
                              </code>
                            </div>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                },
              )}
            </div>
          )}
        </article>
      </section>
    </AdminShell>
  );
}

export default AdminAuditPage;