import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Link,
} from "react-router-dom";

import AdminShell from "../AdminShell/AdminShell";

import {
  getAdminDashboard,
} from "../adminService";

import "./AdminDashboard.css";

const AUTO_REFRESH_INTERVAL =
  15000;

function toNumber(
  value,
  fallback = 0,
) {
  const parsed =
    Number(value);

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : fallback;
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

function formatPercent(
  value,
) {
  return `${toNumber(
    value,
  ).toFixed(1)} %`;
}

function normalize(
  value,
) {
  return String(
    value || "",
  )
    .trim()
    .toUpperCase();
}

function getStatusLabel(
  value,
) {
  const status =
    normalize(
      value,
    );

  const labels = {
    UPLOADED:
      "Importée",

    PROCESSING:
      "En traitement",

    PENDING_REVIEW:
      "Révision requise",

    VALIDATED:
      "Validée",

    SIGNING:
      "Signature",

    SIGNED:
      "Signée",

    SUBMITTED:
      "Soumise",

    ACCEPTED:
      "Acceptée",

    REJECTED:
      "Rejetée",

    PENDING_RETRY:
      "Relance requise",

    ERROR:
      "Erreur",
  };

  return (
    labels[
      status
    ] ||
    status ||
    "Inconnu"
  );
}

function getStatusTone(
  value,
) {
  const status =
    normalize(
      value,
    );

  if (
    status ===
    "ACCEPTED"
  ) {
    return "success";
  }

  if (
    status ===
      "ERROR" ||
    status ===
      "REJECTED"
  ) {
    return "danger";
  }

  if (
    status ===
      "PENDING_REVIEW" ||
    status ===
      "PENDING_RETRY"
  ) {
    return "warning";
  }

  return "info";
}

function getSourceLabel(
  sourceType,
  source,
) {
  const normalized =
    normalize(
      sourceType ||
        source,
    );

  if (
    normalized ===
      "SCAN_IMAGE" ||
    normalized ===
      "IMAGE"
  ) {
    return "IMAGE";
  }

  if (
    normalized ===
    "OCR"
  ) {
    return "OCR";
  }

  if (
    normalized ===
    "ERP"
  ) {
    return "ERP";
  }

  if (
    normalized ===
    "PDF"
  ) {
    return "PDF";
  }

  return (
    normalized ||
    "—"
  );
}

function getStageLabel(
  value,
) {
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
    "—"
  );
}

function formatMoney(
  value,
  currency,
) {
  const amount =
    Number(
      value,
    );

  if (
    !Number.isFinite(
      amount,
    )
  ) {
    return "—";
  }

  const normalizedCurrency =
    normalize(
      currency,
    );

  if (
    /^[A-Z]{3}$/.test(
      normalizedCurrency,
    )
  ) {
    try {
      return new Intl.NumberFormat(
        "fr-FR",
        {
          style:
            "currency",

          currency:
            normalizedCurrency,

          minimumFractionDigits:
            2,

          maximumFractionDigits:
            3,
        },
      ).format(
        amount,
      );
    } catch {
      //
    }
  }

  return `${amount.toFixed(
    3,
  )} ${
    normalizedCurrency ||
    ""
  }`.trim();
}

function formatDuration(
  secondsValue,
) {
  const seconds =
    Math.max(
      0,
      Math.round(
        toNumber(
          secondsValue,
        ),
      ),
    );

  if (
    seconds <
    60
  ) {
    return `${seconds}s`;
  }

  const minutes =
    Math.floor(
      seconds /
        60,
    );

  if (
    minutes <
    60
  ) {
    return `${minutes}m ${seconds % 60}s`;
  }

  const hours =
    Math.floor(
      minutes /
        60,
    );

  return `${hours}h ${minutes % 60}m`;
}

function formatRelativeTime(
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

  const difference =
    Math.max(
      0,
      Date.now() -
        date.getTime(),
    );

  const seconds =
    Math.floor(
      difference /
        1000,
    );

  if (
    seconds <
    60
  ) {
    return "à l'instant";
  }

  const minutes =
    Math.floor(
      seconds /
        60,
    );

  if (
    minutes <
    60
  ) {
    return `il y a ${minutes} min`;
  }

  const hours =
    Math.floor(
      minutes /
        60,
    );

  if (
    hours <
    24
  ) {
    return `il y a ${hours} h`;
  }

  return `il y a ${Math.floor(
    hours /
      24,
  )} j`;
}

function AdminDashboard() {
  const [
    dashboard,
    setDashboard,
  ] =
    useState(
      null,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      true,
    );

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(
      false,
    );

  const [
    error,
    setError,
  ] =
    useState(
      "",
    );

  const [
    lastRefresh,
    setLastRefresh,
  ] =
    useState(
      null,
    );

  const mountedRef =
    useRef(
      true,
    );

  const loadDashboard =
    useCallback(
      async (
        silent = false,
      ) => {
        if (
          silent
        ) {
          setRefreshing(
            true,
          );
        } else {
          setLoading(
            true,
          );
        }

        try {
          const data =
            await getAdminDashboard();

          if (
            !mountedRef.current
          ) {
            return;
          }

          setDashboard(
            data,
          );

          setError(
            "",
          );

          setLastRefresh(
            new Date(),
          );
        } catch (
          loadError
        ) {
          console.error(
            "Admin dashboard error:",
            loadError,
          );

          if (
            mountedRef.current
          ) {
            setError(
              loadError?.message ||
                "Impossible de charger le tableau de bord.",
            );
          }
        } finally {
          if (
            mountedRef.current
          ) {
            setLoading(
              false,
            );

            setRefreshing(
              false,
            );
          }
        }
      },
      [],
    );

  useEffect(() => {
    mountedRef.current =
      true;

    loadDashboard();

    const interval =
      window.setInterval(
        () => {
          loadDashboard(
            true,
          );
        },
        AUTO_REFRESH_INTERVAL,
      );

    return () => {
      mountedRef.current =
        false;

      window.clearInterval(
        interval,
      );
    };
  }, [
    loadDashboard,
  ]);

  const stats =
    dashboard?.stats ||
    {};

  const pipeline =
    dashboard?.pipeline ||
    {};

  const recentInvoices =
    Array.isArray(
      dashboard
        ?.recent_invoices,
    )
      ? dashboard
          .recent_invoices
      : [];

  const actionRequired =
    Array.isArray(
      dashboard
        ?.action_required,
    )
      ? dashboard
          .action_required
      : [];

  const topErrors =
    Array.isArray(
      dashboard
        ?.top_errors,
    )
      ? dashboard
          .top_errors
      : [];

  const sources =
    Array.isArray(
      dashboard
        ?.sources,
    )
      ? dashboard
          .sources
      : [];

  const cards =
    useMemo(
      () => [
        {
          label:
            "Factures suivies",

          value:
            stats.total,

          helper:
            "toutes organisations",

          tone:
            "purple",

          to:
            "/admin/invoices",
        },

        {
          label:
            "Acceptées",

          value:
            stats.accepted,

          helper:
            `${formatPercent(
              stats.acceptance_rate,
            )} de réussite`,

          tone:
            "green",

          to:
            "/admin/invoices?status=ACCEPTED",
        },

        {
          label:
            "En mouvement",

          value:
            stats.processing,

          helper:
            "workflow actif",

          tone:
            "blue",

          to:
            "/admin/invoices?group=processing",
        },

        {
          label:
            "À surveiller",

          value:
            stats.action_required,

          helper:
            "revue ou intervention",

          tone:
            "orange",

          to:
            "/admin/errors",
        },
      ],
      [
        stats,
      ],
    );

  const stages =
    [
      "IMPORT",
      "EXTRACTION",
      "VALIDATION",
      "TEIF",
      "SIGNATURE",
      "TTN",
    ];

  const pipelineMax =
    Math.max(
      1,
      ...stages.map(
        (
          stage,
        ) =>
          toNumber(
            pipeline[
              stage
            ],
          ),
      ),
    );

  return (
    <AdminShell
      title="Tableau de bord"
      actions={
        <>
          <button
            type="button"
            className="admin-action-btn"
            disabled={
              refreshing
            }
            onClick={() =>
              loadDashboard(
                true,
              )
            }
          >
            {refreshing
              ? "Actualisation..."
              : "Actualiser"}
          </button>

          <Link
            to="/admin/invoices"
            className="admin-action-btn admin-action-btn--primary"
          >
            Explorer les factures
          </Link>
        </>
      }
    >
      <section className="admin-dashboard-live">
        <div className="admin-dashboard-live__left">
          <span className="admin-dashboard-live__dot" />

          <strong>
            Supervision active
          </strong>

          <small>
            Synchronisation automatique toutes les 15 secondes
          </small>
        </div>

        <div className="admin-dashboard-live__right">
          <span>
            Dernière synchro
          </span>

          <strong>
            {lastRefresh
              ? lastRefresh.toLocaleTimeString(
                  "fr-FR",
                  {
                    hour:
                      "2-digit",

                    minute:
                      "2-digit",

                    second:
                      "2-digit",
                  },
                )
              : "—"}
          </strong>
        </div>
      </section>

      {error && (
        <section className="admin-dashboard-error">
          <div>
            <strong>
              Synchronisation impossible
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
              loadDashboard()
            }
          >
            Réessayer
          </button>
        </section>
      )}

      <section className="admin-dashboard-metrics">
        {cards.map(
          (
            card,
          ) => (
            <Link
              key={
                card.label
              }
              to={
                card.to
              }
              className={`admin-dashboard-metric admin-dashboard-metric--${card.tone}`}
            >
              <span className="admin-dashboard-metric__label">
                {
                  card.label
                }
              </span>

              <strong>
                {loading
                  ? "—"
                  : formatInteger(
                      card.value,
                    )}
              </strong>

              <small>
                {
                  card.helper
                }
              </small>

             

              <span className="admin-dashboard-metric__orb" />
            </Link>
          ),
        )}
      </section>

      <section className="admin-dashboard-grid">
        <article className="admin-dashboard-panel admin-dashboard-panel--large">
          <header className="admin-dashboard-panel__header">
            <div>
              <span>
                Activité clients
              </span>

              <h2>
                Factures récentes
              </h2>
            </div>

            <Link
              to="/admin/invoices"
            >
              Voir toutes →
            </Link>
          </header>

          <div className="admin-dashboard-table-wrapper">
            <table className="admin-dashboard-table">
              <thead>
                <tr>
                  <th>
                    Facture
                  </th>

                  <th>
                    Client
                  </th>

                  <th>
                    Organisation
                  </th>

                  <th>
                    Source
                  </th>

                  <th>
                    Étape
                  </th>

                  <th>
                    Statut
                  </th>

                  <th>
                    Montant
                  </th>

                  <th>
                    Activité
                  </th>
                </tr>
              </thead>

              <tbody>
                {recentInvoices.length ===
                0 ? (
                  <tr>
                    <td
                      colSpan="8"
                      className="admin-dashboard-empty"
                    >
                      Aucune facture disponible.
                    </td>
                  </tr>
                ) : (
                  recentInvoices.map(
                    (
                      invoice,
                    ) => (
                      <tr
                        key={
                          invoice.id
                        }
                      >
                        <td>
                          <strong className="admin-dashboard-mono">
                            {invoice.invoice_number ||
                              invoice.original_filename ||
                              "Sans numéro"}
                          </strong>
                        </td>

                        <td>
                          <div className="admin-dashboard-client">
                            <strong>
                              {invoice.client_name ||
                                "Client"}
                            </strong>

                            <small>
                              {invoice.client_email ||
                                "—"}
                            </small>
                          </div>
                        </td>

                        <td>
                          {invoice.organization_name ||
                            "—"}
                        </td>

                        <td>
                          <span className="admin-dashboard-tag">
                            {getSourceLabel(
                              invoice.source_type,
                              invoice.source,
                            )}
                          </span>
                        </td>

                        <td>
                          <span className="admin-dashboard-tag">
                            {getStageLabel(
                              invoice.current_stage,
                            )}
                          </span>
                        </td>

                        <td>
                          <span
                            className={`admin-dashboard-status admin-dashboard-status--${getStatusTone(
                              invoice.status,
                            )}`}
                          >
                            {getStatusLabel(
                              invoice.status,
                            )}
                          </span>
                        </td>

                        <td>
                          {formatMoney(
                            invoice.total_ttc ??
                              invoice.total_amount,
                            invoice.currency,
                          )}
                        </td>

                        <td>
                          <small>
                            {formatRelativeTime(
                              invoice.updated_at,
                            )}
                          </small>
                        </td>
                      </tr>
                    ),
                  )
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="admin-dashboard-panel">
          <header className="admin-dashboard-panel__header">
            <div>
              <span>
                Workflow
              </span>

              <h2>
                Pipeline
              </h2>
            </div>
          </header>

          <div className="admin-dashboard-pipeline">
            {stages.map(
              (
                stage,
                index,
              ) => {
                const value =
                  toNumber(
                    pipeline[
                      stage
                    ],
                  );

                const percentage =
                  value ===
                  0
                    ? 0
                    : Math.max(
                        7,
                        value /
                          pipelineMax *
                          100,
                      );

                return (
                  <div
                    key={
                      stage
                    }
                    className="admin-dashboard-pipeline__item"
                  >
                    <span className="admin-dashboard-pipeline__index">
                      {String(
                        index +
                          1,
                      ).padStart(
                        2,
                        "0",
                      )}
                    </span>

                    <div className="admin-dashboard-pipeline__content">
                      <div>
                        <strong>
                          {getStageLabel(
                            stage,
                          )}
                        </strong>

                        <span>
                          {
                            value
                          }
                        </span>
                      </div>

                      <div className="admin-dashboard-pipeline__track">
                        <span
                          style={{
                            width:
                              `${percentage}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              },
            )}
          </div>
        </article>

        <article className="admin-dashboard-panel">
          <header className="admin-dashboard-panel__header">
            <div>
              <span>
                Performance
              </span>

              <h2>
                Santé du flux
              </h2>
            </div>
          </header>

          <div className="admin-dashboard-performance">
            <div className="admin-dashboard-performance__hero">
              <span>
                Taux d'acceptation
              </span>

              <strong>
                {formatPercent(
                  stats.acceptance_rate,
                )}
              </strong>

              <small>
                factures acceptées
              </small>
            </div>

            <div className="admin-dashboard-performance__grid">
              <div>
                <span>
                  Aujourd'hui
                </span>

                <strong>
                  {formatInteger(
                    stats.today,
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Clients actifs
                </span>

                <strong>
                  {formatInteger(
                    stats.active_clients,
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Organisations
                </span>

                <strong>
                  {formatInteger(
                    stats.active_organizations,
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Temps moyen
                </span>

                <strong>
                  {formatDuration(
                    stats.average_processing_seconds,
                  )}
                </strong>
              </div>
            </div>
          </div>
        </article>

        <article className="admin-dashboard-panel admin-dashboard-panel--large">
          <header className="admin-dashboard-panel__header">
            <div>
              <span>
                Surveillance
              </span>

              <h2>
                Action requise
              </h2>
            </div>

            <Link
              to="/admin/errors"
            >
              Voir anomalies →
            </Link>
          </header>

          {actionRequired.length ===
          0 ? (
            <div className="admin-dashboard-empty">
              Aucune intervention nécessaire.
            </div>
          ) : (
            <div className="admin-dashboard-watchlist">
              {actionRequired.map(
                (
                  invoice,
                ) => (
                  <div
                    key={
                      invoice.id
                    }
                    className="admin-dashboard-watchlist__item"
                  >
                    <span
                      className={`admin-dashboard-watchlist__signal admin-dashboard-watchlist__signal--${getStatusTone(
                        invoice.status,
                      )}`}
                    />

                    <div>
                      <strong>
                        {invoice.invoice_number ||
                          "Sans numéro"}
                      </strong>

                      <small>
                        {invoice.organization_name ||
                          "Organisation"}

                        {" · "}

                        {invoice.client_name ||
                          invoice.client_email ||
                          "Client"}
                      </small>
                    </div>

                    <span className="admin-dashboard-tag">
                      {getStageLabel(
                        invoice.current_stage,
                      )}
                    </span>

                    <span
                      className={`admin-dashboard-status admin-dashboard-status--${getStatusTone(
                        invoice.status,
                      )}`}
                    >
                      {getStatusLabel(
                        invoice.status,
                      )}
                    </span>
                  </div>
                ),
              )}
            </div>
          )}
        </article>

        <article className="admin-dashboard-panel">
          <header className="admin-dashboard-panel__header">
            <div>
              <span>
                Diagnostic
              </span>

              <h2>
                Erreurs fréquentes
              </h2>
            </div>
          </header>

          {topErrors.length ===
          0 ? (
            <div className="admin-dashboard-empty">
              Aucune erreur enregistrée.
            </div>
          ) : (
            <div className="admin-dashboard-ranking">
              {topErrors.map(
                (
                  item,
                  index,
                ) => (
                  <div
                    key={`${item.error_code}-${index}`}
                    className="admin-dashboard-ranking__item"
                  >
                    <span>
                      {String(
                        index +
                          1,
                      ).padStart(
                        2,
                        "0",
                      )}
                    </span>

                    <strong>
                      {item.error_code ||
                        "UNKNOWN_ERROR"}
                    </strong>

                    <em>
                      {formatInteger(
                        item.total,
                      )}
                    </em>
                  </div>
                ),
              )}
            </div>
          )}
        </article>

        <article className="admin-dashboard-panel">
          <header className="admin-dashboard-panel__header">
            <div>
              <span>
                Imports
              </span>

              <h2>
                Sources
              </h2>
            </div>
          </header>

          <div className="admin-dashboard-sources">
            {sources.map(
              (
                item,
                index,
              ) => (
                <div
                  key={`${item.source}-${index}`}
                  className="admin-dashboard-source-card"
                >
                  <span>
                    {getSourceLabel(
                      item.source,
                      item.source,
                    )}
                  </span>

                  <strong>
                    {formatInteger(
                      item.total,
                    )}
                  </strong>

                  <small>
                    factures
                  </small>
                </div>
              ),
            )}
          </div>
        </article>
      </section>
    </AdminShell>
  );
}

export default AdminDashboard;