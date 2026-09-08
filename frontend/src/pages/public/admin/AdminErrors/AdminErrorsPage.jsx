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

import "./AdminErrorsPage.css";

const API_BASE_URL =
  String(
    import.meta.env.VITE_API_URL ||
      "http://localhost:3000",
  ).replace(/\/+$/, "");

const AUTO_REFRESH_INTERVAL =
  15000;

function safeArray(value) {
  return Array.isArray(
    value,
  )
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
    Number.isFinite(
      number,
    )
      ? number
      : 0,
  );
}

function formatDateTime(value) {
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
        "short",

      timeStyle:
        "short",
    },
  ).format(
    date,
  );
}

function getStageLabel(value) {
  const stage =
    normalize(
      value,
    );

  const labels = {
    IMPORT:
      "Import",

    EXTRACTION:
      "Extraction",

    VALIDATION:
      "Validation",

    TEIF:
      "TEIF",

    SIGNATURE:
      "Signature",

    TTN:
      "TTN",
  };

  return (
    labels[
      stage
    ] ||
    stage ||
    "Inconnue"
  );
}

function getStatusLabel(value) {
  const status =
    normalize(
      value,
    );

  const labels = {
    PENDING_REVIEW:
      "Révision requise",

    PENDING_RETRY:
      "Relance requise",

    REJECTED:
      "Rejetée",

    ERROR:
      "Erreur",

    ACCEPTED:
      "Acceptée",

    PROCESSING:
      "En traitement",
  };

  return (
    labels[
      status
    ] ||
    status ||
    "Inconnu"
  );
}

function getSeverityLabel(
  value,
) {
  const severity =
    normalize(
      value,
    );

  if (
    severity ===
    "HIGH"
  ) {
    return "Critique";
  }

  if (
    severity ===
    "MEDIUM"
  ) {
    return "Attention";
  }

  return "Mineure";
}

function getSeverityIcon(
  value,
) {
  const severity =
    normalize(
      value,
    );

  if (
    severity ===
    "HIGH"
  ) {
    return "🔴";
  }

  if (
    severity ===
    "MEDIUM"
  ) {
    return "🟠";
  }

  return "🟡";
}

function AdminErrorsPage() {
  const [
    anomalies,
    setAnomalies,
  ] =
    useState([]);

  const [
    stats,
    setStats,
  ] =
    useState({});

  const [
    topErrors,
    setTopErrors,
  ] =
    useState([]);

  const [
    stages,
    setStages,
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
    severityFilter,
    setSeverityFilter,
  ] =
    useState("");

  const [
    statusFilter,
    setStatusFilter,
  ] =
    useState("");

  const [
    stageFilter,
    setStageFilter,
  ] =
    useState("");

  const [
    organizationFilter,
    setOrganizationFilter,
  ] =
    useState("");

  const loadErrors =
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
              `${API_BASE_URL}/api/admin/errors`,
              {
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

          setAnomalies(
            safeArray(
              data?.anomalies,
            ),
          );

          setStats(
            data?.stats ||
              {},
          );

          setTopErrors(
            safeArray(
              data?.top_errors,
            ),
          );

          setStages(
            safeArray(
              data?.stages,
            ),
          );

          setError(
            "",
          );
        } catch (
          loadError
        ) {
          console.error(
            "Admin errors error:",
            loadError,
          );

          setError(
            loadError?.message ||
              "Impossible de charger les anomalies.",
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

  useEffect(() => {
    loadErrors();

    const interval =
      window.setInterval(
        () => {
          loadErrors({
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
    loadErrors,
  ]);

  const organizations =
    useMemo(
      () =>
        [
          ...new Set(
            anomalies
              .map(
                (
                  item,
                ) =>
                  String(
                    item.organization_name ||
                      "",
                  ).trim(),
              )
              .filter(Boolean),
          ),
        ].sort(),
      [
        anomalies,
      ],
    );

  const filteredAnomalies =
    useMemo(
      () => {
        const needle =
          search
            .trim()
            .toLowerCase();

        return anomalies.filter(
          (
            item,
          ) => {
            if (
              severityFilter &&
              normalize(
                item.severity,
              ) !==
                severityFilter
            ) {
              return false;
            }

            if (
              statusFilter &&
              normalize(
                item.status,
              ) !==
                statusFilter
            ) {
              return false;
            }

            if (
              stageFilter &&
              normalize(
                item.current_stage,
              ) !==
                stageFilter
            ) {
              return false;
            }

            if (
              organizationFilter &&
              item.organization_name !==
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
                item.invoice_number,
                item.original_filename,
                item.error_code,
                item.error_message,
                item.client_name,
                item.client_email,
                item.organization_name,
                item.status,
                item.current_stage,
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
        anomalies,
        search,
        severityFilter,
        statusFilter,
        stageFilter,
        organizationFilter,
      ],
    );

  function resetFilters() {
    setSearch(
      "",
    );

    setSeverityFilter(
      "",
    );

    setStatusFilter(
      "",
    );

    setStageFilter(
      "",
    );

    setOrganizationFilter(
      "",
    );
  }

  const actions = (
    <button
      type="button"
      className="admin-action-btn"
      disabled={
        refreshing
      }
      onClick={() =>
        loadErrors({
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
      eyebrow="Centre de surveillance"
      title="Anomalies"
      actions={
        actions
      }
    >
      <section className="admin-errors">
        {error && (
          <div className="admin-errors__error">
            <strong>
              ⚠ {
                error
              }
            </strong>

            <button
              type="button"
              onClick={() =>
                loadErrors()
              }
            >
              Réessayer
            </button>
          </div>
        )}

        <div className="admin-errors__stats">
          <button
            type="button"
            className="admin-errors-stat admin-errors-stat--all"
            onClick={
              resetFilters
            }
          >
            <span>
              ⚠️ Anomalies
            </span>

            <strong>
              {formatInteger(
                stats.total,
              )}
            </strong>

            <small>
              Toutes les anomalies
            </small>
          </button>

          <button
            type="button"
            className="admin-errors-stat admin-errors-stat--critical"
            onClick={() =>
              setSeverityFilter(
                "HIGH",
              )
            }
          >
            <span>
              🔴 Critiques
            </span>

            <strong>
              {formatInteger(
                stats.high,
              )}
            </strong>

            <small>
              Intervention prioritaire
            </small>
          </button>

          <button
            type="button"
            className="admin-errors-stat admin-errors-stat--warning"
            onClick={() =>
              setSeverityFilter(
                "MEDIUM",
              )
            }
          >
            <span>
              🟠 À vérifier
            </span>

            <strong>
              {formatInteger(
                stats.medium,
              )}
            </strong>

            <small>
              Vérification nécessaire
            </small>
          </button>

          <button
            type="button"
            className="admin-errors-stat admin-errors-stat--retry"
            onClick={() =>
              setStatusFilter(
                "PENDING_RETRY",
              )
            }
          >
            <span>
              🔄 Relançables
            </span>

            <strong>
              {formatInteger(
                stats.retryable,
              )}
            </strong>

            <small>
              Nouvelle tentative possible
            </small>
          </button>
        </div>

        <div className="admin-errors__overview">
          <article className="admin-errors-summary">
            <header>
              <div>
                <span>
                  Diagnostic
                </span>

                <h2>
                  Erreurs fréquentes
                </h2>
              </div>
            </header>

            <div className="admin-errors-summary__list">
              {topErrors.length ===
              0 ? (
                <p>
                  Aucune erreur enregistrée.
                </p>
              ) : (
                topErrors.map(
                  (
                    item,
                  ) => (
                    <div
                      key={
                        item.error_code
                      }
                    >
                      <span>
                        {
                          item.error_code
                        }
                      </span>

                      <strong>
                        {formatInteger(
                          item.total,
                        )}
                      </strong>
                    </div>
                  ),
                )
              )}
            </div>
          </article>

          <article className="admin-errors-summary">
            <header>
              <div>
                <span>
                  Workflow
                </span>

                <h2>
                  Étapes touchées
                </h2>
              </div>
            </header>

            <div className="admin-errors-summary__list">
              {stages.length ===
              0 ? (
                <p>
                  Aucune anomalie.
                </p>
              ) : (
                stages.map(
                  (
                    item,
                  ) => (
                    <div
                      key={
                        item.stage
                      }
                    >
                      <span>
                        {getStageLabel(
                          item.stage,
                        )}
                      </span>

                      <strong>
                        {formatInteger(
                          item.total,
                        )}
                      </strong>
                    </div>
                  ),
                )
              )}
            </div>
          </article>
        </div>

        <article className="admin-errors__filters">
          <div className="admin-errors-search">
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
              placeholder="Facture, code erreur, client, organisation..."
            />
          </div>

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

            <option value="HIGH">
              Critique
            </option>

            <option value="MEDIUM">
              Attention
            </option>

            <option value="LOW">
              Mineure
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
              Tous les statuts
            </option>

            <option value="PENDING_REVIEW">
              Révision requise
            </option>

            <option value="PENDING_RETRY">
              Relance requise
            </option>

            <option value="REJECTED">
              Rejetée
            </option>

            <option value="ERROR">
              Erreur
            </option>
          </select>

          <select
            value={
              stageFilter
            }
            onChange={(
              event,
            ) =>
              setStageFilter(
                event.target.value,
              )
            }
          >
            <option value="">
              Toutes les étapes
            </option>

            <option value="IMPORT">
              Import
            </option>

            <option value="EXTRACTION">
              Extraction
            </option>

            <option value="VALIDATION">
              Validation
            </option>

            <option value="TEIF">
              TEIF
            </option>

            <option value="SIGNATURE">
              Signature
            </option>

            <option value="TTN">
              TTN
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
            onClick={
              resetFilters
            }
            className="admin-errors__reset"
          >
            Réinitialiser
          </button>
        </article>

        <article className="admin-errors__panel">
          <header className="admin-errors__panel-header">
            <div>
              <span>
                Journal
              </span>

              <h2>
                Anomalies détectées
              </h2>

              <p>
                {formatInteger(
                  filteredAnomalies.length,
                )} résultat(s)
              </p>
            </div>
          </header>

          {loading ? (
            <div className="admin-errors__empty">
              Chargement...
            </div>
          ) : filteredAnomalies.length ===
            0 ? (
            <div className="admin-errors__empty">
              <span>
                ✅
              </span>

              <h3>
                Aucun problème détecté
              </h3>

              <p>
                Aucun élément ne correspond aux filtres actuels.
              </p>
            </div>
          ) : (
            <div className="admin-errors-list">
              {filteredAnomalies.map(
                (
                  item,
                ) => (
                  <article
                    key={
                      item.id
                    }
                    className={`admin-error-item admin-error-item--${String(
                      item.severity ||
                        "LOW",
                    ).toLowerCase()}`}
                  >
                    <div className="admin-error-item__severity">
                      <span>
                        {getSeverityIcon(
                          item.severity,
                        )}
                      </span>

                      <strong>
                        {getSeverityLabel(
                          item.severity,
                        )}
                      </strong>
                    </div>

                    <div className="admin-error-item__main">
                      <div className="admin-error-item__headline">
                        <strong>
                          {item.error_code ||
                            "UNKNOWN_ANOMALY"}
                        </strong>

                        <span>
                          {getStatusLabel(
                            item.status,
                          )}
                        </span>
                      </div>

                      <p>
                        {item.error_message ||
                          "Aucun détail disponible."}
                      </p>

                      <div className="admin-error-item__metadata">
                        <span>
                          🧾 {item.invoice_number ||
                            "Sans numéro"}
                        </span>

                        <span>
                          🏢 {item.organization_name}
                        </span>

                        <span>
                          👤 {item.client_name}
                        </span>

                        <span>
                          ⚙️ {getStageLabel(
                            item.current_stage,
                          )}
                        </span>

                        <span>
                          🕒 {formatDateTime(
                            item.updated_at,
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="admin-error-item__actions">
                      {item.can_retry && (
                        <span className="admin-error-item__retry">
                          🔄 Retry
                        </span>
                      )}

                      <Link
                        to={`/admin/invoices/${item.id}`}
                      >
                        Voir
                        <span>
                          →
                        </span>
                      </Link>
                    </div>
                  </article>
                ),
              )}
            </div>
          )}
        </article>
      </section>
    </AdminShell>
  );
}

export default AdminErrorsPage;