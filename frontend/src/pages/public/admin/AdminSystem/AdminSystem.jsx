import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import AdminShell from "../AdminShell/AdminShell";

import {
  getAccessToken,
} from "../../../../services/authService";

import "./AdminSystem.css";

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
  30000;

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

function toNumber(
  value,
) {
  const number =
    Number(value);

  return Number.isFinite(
    number,
  )
    ? number
    : 0;
}

function formatInteger(
  value,
) {
  return new Intl.NumberFormat(
    "fr-FR",
  ).format(
    toNumber(
      value,
    ),
  );
}

function formatDateTime(
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
      dateStyle:
        "medium",

      timeStyle:
        "medium",
    },
  ).format(
    date,
  );
}

function formatDuration(
  seconds,
) {
  const total =
    Math.max(
      0,
      Number(
        seconds ||
          0,
      ),
    );

  const days =
    Math.floor(
      total /
        86400,
    );

  const hours =
    Math.floor(
      (
        total %
        86400
      ) /
        3600,
    );

  const minutes =
    Math.floor(
      (
        total %
        3600
      ) /
        60,
    );

  if (
    days >
    0
  ) {
    return `${days} j ${hours} h`;
  }

  if (
    hours >
    0
  ) {
    return `${hours} h ${minutes} min`;
  }

  return `${minutes} min`;
}

function getStatusData(
  value,
) {
  const status =
    String(
      value ||
        "DOWN",
    )
      .trim()
      .toUpperCase();

  if (
    status ===
    "UP"
  ) {
    return {
      label:
        "Opérationnel",

      icon:
        "●",

      className:
        "admin-system-status--up",
    };
  }

  if (
    status ===
    "DEGRADED"
  ) {
    return {
      label:
        "Dégradé",

      icon:
        "●",

      className:
        "admin-system-status--degraded",
    };
  }

  return {
    label:
      "Indisponible",

    icon:
      "●",

    className:
      "admin-system-status--down",
  };
}

function getGlobalStatusData(
  value,
) {
  const status =
    String(
      value ||
        "",
    ).toUpperCase();

  if (
    status ===
    "HEALTHY"
  ) {
    return {
      icon:
        "✅",

      title:
        "Tous les systèmes sont opérationnels",

      description:
        "Les principaux composants de la plateforme répondent normalement.",

      className:
        "admin-system-health--healthy",
    };
  }

  if (
    status ===
    "CRITICAL"
  ) {
    return {
      icon:
        "🚨",

      title:
        "Incident système critique",

      description:
        "Un composant essentiel de la plateforme est indisponible.",

      className:
        "admin-system-health--critical",
    };
  }

  return {
    icon:
      "⚠️",

    title:
      "Plateforme partiellement dégradée",

    description:
      "Un ou plusieurs services secondaires sont actuellement indisponibles.",

    className:
      "admin-system-health--degraded",
  };
}

/*
|--------------------------------------------------------------------------
| PAGE
|--------------------------------------------------------------------------
*/

function AdminSystemPage() {
  const [
    data,
    setData,
  ] =
    useState(null);

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
    categoryFilter,
    setCategoryFilter,
  ] =
    useState("");

  const [
    statusFilter,
    setStatusFilter,
  ] =
    useState("");

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    expandedService,
    setExpandedService,
  ] =
    useState(null);

  /*
  |--------------------------------------------------------------------------
  | LOAD
  |--------------------------------------------------------------------------
  */

  const loadSystem =
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
              `${API_BASE_URL}/api/admin/system`,
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

          let result =
            {};

          if (text) {
            try {
              result =
                JSON.parse(
                  text,
                );
            } catch {
              result = {
                message:
                  text,
              };
            }
          }

          if (
            !response.ok
          ) {
            throw new Error(
              result?.message ||
                `Erreur HTTP ${response.status}`,
            );
          }

          setData(
            result,
          );

          setError(
            "",
          );
        } catch (
          loadError
        ) {
          console.error(
            "Admin system error:",
            loadError,
          );

          setError(
            loadError?.message ||
              "Impossible de charger l'état du système.",
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
    loadSystem();

    const interval =
      window.setInterval(
        () => {
          loadSystem({
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
    loadSystem,
  ]);

  /*
  |--------------------------------------------------------------------------
  | SERVICES
  |--------------------------------------------------------------------------
  */

  const services =
    safeArray(
      data?.services,
    );

  const stats =
    data?.stats ||
    {};

  const platform =
    data?.platform ||
    {};

  /*
  |--------------------------------------------------------------------------
  | CATEGORIES
  |--------------------------------------------------------------------------
  */

  const categories =
    useMemo(
      () =>
        [
          ...new Set(
            services
              .map(
                (
                  service,
                ) =>
                  service.category,
              )
              .filter(Boolean),
          ),
        ].sort(),
      [
        services,
      ],
    );

  /*
  |--------------------------------------------------------------------------
  | FILTER
  |--------------------------------------------------------------------------
  */

  const filteredServices =
    useMemo(
      () => {
        const needle =
          search
            .trim()
            .toLowerCase();

        return services.filter(
          (
            service,
          ) => {
            if (
              categoryFilter &&
              service.category !==
                categoryFilter
            ) {
              return false;
            }

            if (
              statusFilter &&
              String(
                service.status ||
                  "",
              ).toUpperCase() !==
                statusFilter
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
                service.name,
                service.key,
                service.category,
                service.status,
                service.url,
                service.message,
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
        services,
        categoryFilter,
        statusFilter,
        search,
      ],
    );

  const globalHealth =
    getGlobalStatusData(
      data?.global_status,
    );

  /*
  |--------------------------------------------------------------------------
  | BACKEND DETAILS
  |--------------------------------------------------------------------------
  */

  const backend =
    services.find(
      (
        service,
      ) =>
        service.key ===
        "backend",
    );

  const database =
    services.find(
      (
        service,
      ) =>
        service.key ===
        "sqlserver",
    );

  /*
  |--------------------------------------------------------------------------
  | ACTIONS
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
        loadSystem({
          silent:
            true,
        })
      }
    >
      {refreshing
        ? "Analyse..."
        : "↻ Vérifier maintenant"}
    </button>
  );

  /*
  |--------------------------------------------------------------------------
  | LOADING
  |--------------------------------------------------------------------------
  */

  if (
    loading
  ) {
    return (
      <AdminShell
        eyebrow="Infrastructure"
        title="Système"
        description="Analyse des composants techniques de la plateforme."
      >
        <div className="admin-system-loading">
          <span />

          <h3>
            Diagnostic système
          </h3>

          <p>
            Vérification des services en cours...
          </p>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      eyebrow="Infrastructure & services"
      title="Système"
      actions={
        actions
      }
    >
      <section className="admin-system">
        {/*
        |--------------------------------------------------------------------------
        | ERROR
        |--------------------------------------------------------------------------
        */}

        {error && (
          <article className="admin-system-error">
            <div>
              <strong>
                ⚠ Diagnostic incomplet
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
                loadSystem()
              }
            >
              Réessayer
            </button>
          </article>
        )}

        {/*
        |--------------------------------------------------------------------------
        | GLOBAL HEALTH
        |--------------------------------------------------------------------------
        */}

        {data && (
          <article
            className={`admin-system-health ${globalHealth.className}`}
          >
            <div className="admin-system-health__icon">
              {
                globalHealth.icon
              }
            </div>

            <div className="admin-system-health__copy">
              <span>
                État global
              </span>

              <h2>
                {
                  globalHealth.title
                }
              </h2>

              <p>
                {
                  globalHealth.description
                }
              </p>
            </div>

            <div className="admin-system-health__time">
              <span>
                Dernière vérification
              </span>

              <strong>
                {formatDateTime(
                  data.generated_at,
                )}
              </strong>

              <small>
                Actualisation automatique toutes les 30 secondes
              </small>
            </div>
          </article>
        )}

        {/*
        |--------------------------------------------------------------------------
        | STATS
        |--------------------------------------------------------------------------
        */}

        <div className="admin-system-stats">
          <article className="admin-system-stat admin-system-stat--purple">
            <span>
              🧩 Services
            </span>

            <strong>
              {formatInteger(
                stats.total_services,
              )}
            </strong>

            <small>
              Composants surveillés
            </small>
          </article>

          <button
            type="button"
            className="admin-system-stat admin-system-stat--green"
            onClick={() =>
              setStatusFilter(
                "UP",
              )
            }
          >
            <span>
              ✅ Opérationnels
            </span>

            <strong>
              {formatInteger(
                stats.operational,
              )}
            </strong>

            <small>
              Services disponibles
            </small>
          </button>

          <button
            type="button"
            className="admin-system-stat admin-system-stat--red"
            onClick={() =>
              setStatusFilter(
                "DOWN",
              )
            }
          >
            <span>
              ⛔ Indisponibles
            </span>

            <strong>
              {formatInteger(
                stats.unavailable,
              )}
            </strong>

            <small>
              Services à contrôler
            </small>
          </button>

          <article className="admin-system-stat admin-system-stat--blue">
            <span>
              ⚡ Réponse moyenne
            </span>

            <strong>
              {formatInteger(
                stats.average_response_ms,
              )}
              <em>
                ms
              </em>
            </strong>

            <small>
              Temps de réponse technique
            </small>
          </article>
        </div>

        {/*
        |--------------------------------------------------------------------------
        | PLATFORM OVERVIEW
        |--------------------------------------------------------------------------
        */}

        <div className="admin-system-platform-grid">
          <article className="admin-system-platform">
            <header>
              <span>
                🖥️
              </span>

              <div>
                <small>
                  Application
                </small>

                <h3>
                  Backend
                </h3>
              </div>
            </header>

            <div className="admin-system-platform__rows">
              <div>
                <span>
                  Technologie
                </span>

                <strong>
                  {platform.backend ||
                    "Node.js + Express"}
                </strong>
              </div>

              <div>
                <span>
                  Node.js
                </span>

                <strong>
                  {backend?.details?.node_version ||
                    "—"}
                </strong>
              </div>

              <div>
                <span>
                  Environnement
                </span>

                <strong>
                  {platform.environment ||
                    "—"}
                </strong>
              </div>

              <div>
                <span>
                  Uptime
                </span>

                <strong>
                  {formatDuration(
                    backend?.details?.uptime_seconds,
                  )}
                </strong>
              </div>
            </div>
          </article>

          <article className="admin-system-platform">
            <header>
              <span>
                🗄️
              </span>

              <div>
                <small>
                  Persistance
                </small>

                <h3>
                  Base de données
                </h3>
              </div>
            </header>

            <div className="admin-system-platform__rows">
              <div>
                <span>
                  Technologie
                </span>

                <strong>
                  {platform.database ||
                    "Microsoft SQL Server"}
                </strong>
              </div>

              <div>
                <span>
                  Base
                </span>

                <strong>
                  {database?.details?.database_name ||
                    "—"}
                </strong>
              </div>

              <div>
                <span>
                  Serveur
                </span>

                <strong>
                  {database?.details?.server_name ||
                    "—"}
                </strong>
              </div>

              <div>
                <span>
                  Temps de réponse
                </span>

                <strong>
                  {formatInteger(
                    database?.response_time_ms,
                  )} ms
                </strong>
              </div>
            </div>
          </article>

          <article className="admin-system-platform">
            <header>
              <span>
                🧠
              </span>

              <div>
                <small>
                  Orchestration
                </small>

                <h3>
                  Architecture
                </h3>
              </div>
            </header>

            <div className="admin-system-platform__rows">
              <div>
                <span>
                  Frontend
                </span>

                <strong>
                  {platform.frontend ||
                    "React + Vite"}
                </strong>
              </div>

              <div>
                <span>
                  Workflow
                </span>

                <strong>
                  {platform.workflow ||
                    "n8n"}
                </strong>
              </div>

              <div>
                <span>
                  API
                </span>

                <strong>
                  REST
                </strong>
              </div>

              <div>
                <span>
                  Supervision
                </span>

                <strong>
                  Temps réel
                </strong>
              </div>
            </div>
          </article>
        </div>

        {/*
        |--------------------------------------------------------------------------
        | FILTERS
        |--------------------------------------------------------------------------
        */}

        <article className="admin-system-filters">
          <div className="admin-system-search">
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
              placeholder="Rechercher un service..."
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

            {categories.map(
              (
                category,
              ) => (
                <option
                  key={
                    category
                  }
                  value={
                    category
                  }
                >
                  {
                    category
                  }
                </option>
              ),
            )}
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

            <option value="UP">
              Opérationnels
            </option>

            <option value="DEGRADED">
              Dégradés
            </option>

            <option value="DOWN">
              Indisponibles
            </option>
          </select>

          <button
            type="button"
            onClick={() => {
              setSearch(
                "",
              );

              setCategoryFilter(
                "",
              );

              setStatusFilter(
                "",
              );
            }}
          >
            Réinitialiser
          </button>
        </article>

        {/*
        |--------------------------------------------------------------------------
        | SERVICE GRID
        |--------------------------------------------------------------------------
        */}

        <article className="admin-system-services">
          <header className="admin-system-services__header">
            <div>
              <span>
                Infrastructure
              </span>

              <h2>
                Services de la plateforme
              </h2>

              <p>
                {filteredServices.length} service(s) affiché(s)
              </p>
            </div>
          </header>

          <div className="admin-system-services__grid">
            {filteredServices.map(
              (
                service,
              ) => {
                const status =
                  getStatusData(
                    service.status,
                  );

                const expanded =
                  expandedService ===
                  service.key;

                return (
                  <article
                    key={
                      service.key
                    }
                    className="admin-system-service"
                  >
                    <div className="admin-system-service__top">
                      <span className="admin-system-service__icon">
                        {service.icon ||
                          "⚙️"}
                      </span>

                      <div className="admin-system-service__title">
                        <small>
                          {service.category ||
                            "Service"}
                        </small>

                        <h3>
                          {
                            service.name
                          }
                        </h3>
                      </div>

                      <span
                        className={`admin-system-status ${status.className}`}
                      >
                        {
                          status.icon
                        }{" "}
                        {
                          status.label
                        }
                      </span>
                    </div>

                    <div className="admin-system-service__metrics">
                      <div>
                        <span>
                          Réponse
                        </span>

                        <strong>
                          {formatInteger(
                            service.response_time_ms,
                          )} ms
                        </strong>
                      </div>

                      <div>
                        <span>
                          HTTP
                        </span>

                        <strong>
                          {service.http_status ||
                            "—"}
                        </strong>
                      </div>
                    </div>

                    <p className="admin-system-service__message">
                      {service.message ||
                        "Aucune information."}
                    </p>

                    {service.url && (
                      <div className="admin-system-service__url">
                        <span>
                          Endpoint
                        </span>

                        <code>
                          {
                            service.url
                          }
                        </code>
                      </div>
                    )}

                    <button
                      type="button"
                      className="admin-system-service__details-button"
                      onClick={() =>
                        setExpandedService(
                          expanded
                            ? null
                            : service.key,
                        )
                      }
                    >
                      <span>
                        Informations techniques
                      </span>

                      <span>
                        {expanded
                          ? "−"
                          : "+"}
                      </span>
                    </button>

                    {expanded && (
                      <div className="admin-system-service__details">
                        <div>
                          <span>
                            Identifiant
                          </span>

                          <code>
                            {
                              service.key
                            }
                          </code>
                        </div>

                        <div>
                          <span>
                            Vérifié le
                          </span>

                          <code>
                            {formatDateTime(
                              service.checked_at,
                            )}
                          </code>
                        </div>

                        {service.details && (
                          <pre>
                            {JSON.stringify(
                              service.details,
                              null,
                              2,
                            )}
                          </pre>
                        )}
                      </div>
                    )}
                  </article>
                );
              },
            )}
          </div>
        </article>

        {/*
        |--------------------------------------------------------------------------
        | MEMORY
        |--------------------------------------------------------------------------
        */}

        {backend?.details?.memory_mb && (
          <article className="admin-system-memory">
            <header>
              <div>
                <span>
                  Mémoire Node.js
                </span>

                <h2>
                  Ressources backend
                </h2>
              </div>
            </header>

            <div className="admin-system-memory__grid">
              <div>
                <span>
                  RSS
                </span>

                <strong>
                  {formatInteger(
                    backend.details.memory_mb.rss,
                  )} MB
                </strong>
              </div>

              <div>
                <span>
                  Heap utilisé
                </span>

                <strong>
                  {formatInteger(
                    backend.details.memory_mb.heap_used,
                  )} MB
                </strong>
              </div>

              <div>
                <span>
                  Heap total
                </span>

                <strong>
                  {formatInteger(
                    backend.details.memory_mb.heap_total,
                  )} MB
                </strong>
              </div>

              <div>
                <span>
                  PID
                </span>

                <strong>
                  {backend.details.process_id ||
                    "—"}
                </strong>
              </div>
            </div>
          </article>
        )}
      </section>
    </AdminShell>
  );
}

export default AdminSystemPage;