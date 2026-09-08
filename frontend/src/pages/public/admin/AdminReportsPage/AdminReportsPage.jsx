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

import "./AdminReportsPage.css";

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

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function formatInteger(value) {
  return new Intl.NumberFormat(
    "fr-FR",
  ).format(
    Number(value) ||
      0,
  );
}

function formatPercent(value) {
  return `${Number(
    value || 0,
  ).toFixed(1)} %`;
}

function formatMoney(value) {
  return new Intl.NumberFormat(
    "fr-FR",
    {
      minimumFractionDigits:
        2,

      maximumFractionDigits:
        3,
    },
  ).format(
    Number(value) ||
      0,
  );
}

function formatDuration(value) {
  const seconds =
    Number(value) ||
    0;

  if (
    seconds <
    60
  ) {
    return `${Math.round(
      seconds,
    )} s`;
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
    return `${minutes} min`;
  }

  const hours =
    Math.floor(
      minutes /
        60,
    );

  const remainingMinutes =
    minutes %
    60;

  return `${hours} h ${remainingMinutes} min`;
}

function formatMonth(value) {
  if (!value) {
    return "—";
  }

  const [
    year,
    month,
  ] =
    value.split(
      "-",
    );

  const date =
    new Date(
      Number(year),
      Number(month) -
        1,
      1,
    );

  return new Intl.DateTimeFormat(
    "fr-FR",
    {
      month:
        "short",

      year:
        "numeric",
    },
  ).format(
    date,
  );
}

function getStatusLabel(value) {
  const labels = {
    ACCEPTED:
      "Acceptées",

    REJECTED:
      "Rejetées",

    ERROR:
      "Erreurs",

    PENDING_REVIEW:
      "Révision",

    PENDING_RETRY:
      "Retry",

    PROCESSING:
      "Traitement",

    VALIDATED:
      "Validées",

    SIGNING:
      "Signature",

    SIGNED:
      "Signées",

    SUBMITTED:
      "Soumises",

    UPLOADED:
      "Importées",
  };

  return (
    labels[
      String(
        value ||
          "",
      ).toUpperCase()
    ] ||
    value ||
    "Autre"
  );
}

/*
|--------------------------------------------------------------------------
| PAGE
|--------------------------------------------------------------------------
*/

function AdminReportsPage() {
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

  /*
  |--------------------------------------------------------------------------
  | LOAD
  |--------------------------------------------------------------------------
  */

  const loadReports =
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
              `${API_BASE_URL}/api/admin/reports`,
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
            "Admin reports:",
            loadError,
          );

          setError(
            loadError?.message ||
              "Impossible de charger les statistiques.",
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
    loadReports();

    const interval =
      window.setInterval(
        () => {
          loadReports({
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
    loadReports,
  ]);

  const stats =
    data?.stats ||
    {};

  const users =
    data?.users ||
    {};

  const organizations =
    data?.organizations ||
    {};

  const statuses =
    safeArray(
      data?.statuses,
    );

  const sources =
    safeArray(
      data?.sources,
    );

  const monthly =
    safeArray(
      data?.monthly_activity,
    );

  const organizationPerformance =
    safeArray(
      data?.organization_performance,
    );

  const errors =
    safeArray(
      data?.top_errors,
    );

  /*
  |--------------------------------------------------------------------------
  | MAX MONTHLY
  |--------------------------------------------------------------------------
  */

  const maxMonthly =
    useMemo(
      () =>
        Math.max(
          1,
          ...monthly.map(
            (
              item,
            ) =>
              Number(
                item.total ||
                  0,
              ),
          ),
        ),
      [
        monthly,
      ],
    );

  const actions = (
    <button
      type="button"
      className="admin-action-btn"
      disabled={
        refreshing
      }
      onClick={() =>
        loadReports({
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

  if (loading) {
    return (
      <AdminShell
        eyebrow="Analyse"
        title="Statistiques"
        description="Chargement des indicateurs de la plateforme."
      >
        <div className="admin-reports-loading">
          <span />

          <p>
            Calcul des statistiques...
          </p>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      eyebrow="Analyse & performance"
      title="Statistiques"
      actions={
        actions
      }
    >
      <section className="admin-reports">
        {error && (
          <article className="admin-reports__error">
            <div>
              <strong>
                ⚠ Statistiques indisponibles
              </strong>

              <p>
                {error}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                loadReports()
              }
            >
              Réessayer
            </button>
          </article>
        )}

        <div className="admin-reports__stats">
          <article className="admin-reports-stat admin-reports-stat--purple">
            <span>
              🧾 Factures
            </span>

            <strong>
              {formatInteger(
                stats.total_invoices,
              )}
            </strong>

            <small>
              Volume total traité
            </small>
          </article>

          <article className="admin-reports-stat admin-reports-stat--green">
            <span>
              ✅ Acceptation
            </span>

            <strong>
              {formatPercent(
                stats.acceptance_rate,
              )}
            </strong>

            <small>
              {formatInteger(
                stats.accepted,
              )} facture(s)
            </small>
          </article>

          <article className="admin-reports-stat admin-reports-stat--red">
            <span>
              ❌ Rejet / erreur
            </span>

            <strong>
              {formatPercent(
                stats.rejection_rate,
              )}
            </strong>

            <small>
              Incidents de traitement
            </small>
          </article>

          <article className="admin-reports-stat admin-reports-stat--blue">
            <span>
              ⚡ Temps moyen
            </span>

            <strong>
              {formatDuration(
                stats.average_processing_seconds,
              )}
            </strong>

            <small>
              Traitement facture
            </small>
          </article>
        </div>

        <div className="admin-reports__summary-grid">
          <article className="admin-reports-card">
            <header>
              <span>
                💰
              </span>

              <div>
                <small>
                  Valeur traitée
                </small>

                <h2>
                  Montants
                </h2>
              </div>
            </header>

            <div className="admin-reports-money">
              <div>
                <span>
                  Total HT
                </span>

                <strong>
                  {formatMoney(
                    stats.total_ht,
                  )}
                </strong>
              </div>

              <div>
                <span>
                  TVA
                </span>

                <strong>
                  {formatMoney(
                    stats.total_tva,
                  )}
                </strong>
              </div>

              <div className="admin-reports-money__total">
                <span>
                  Total TTC
                </span>

                <strong>
                  {formatMoney(
                    stats.total_value,
                  )}
                </strong>
              </div>
            </div>
          </article>

          <article className="admin-reports-card">
            <header>
              <span>
                👥
              </span>

              <div>
                <small>
                  Utilisation
                </small>

                <h2>
                  Comptes
                </h2>
              </div>
            </header>

            <div className="admin-reports-mini-grid">
              <div>
                <strong>
                  {formatInteger(
                    users.total,
                  )}
                </strong>

                <span>
                  Utilisateurs
                </span>
              </div>

              <div>
                <strong>
                  {formatInteger(
                    users.clients,
                  )}
                </strong>

                <span>
                  Clients
                </span>
              </div>

              <div>
                <strong>
                  {formatInteger(
                    users.admins,
                  )}
                </strong>

                <span>
                  Admins
                </span>
              </div>

              <div>
                <strong>
                  {formatInteger(
                    organizations.total,
                  )}
                </strong>

                <span>
                  Organisations
                </span>
              </div>
            </div>
          </article>
        </div>

        <div className="admin-reports__double">
          <article className="admin-reports-card">
            <header>
              <span>
                📊
              </span>

              <div>
                <small>
                  Résultats
                </small>

                <h2>
                  Statuts
                </h2>
              </div>
            </header>

            <div className="admin-reports-bars">
              {statuses.map(
                (
                  item,
                ) => {
                  const percentage =
                    stats.total_invoices >
                    0
                      ? (
                          Number(
                            item.total,
                          ) /
                          Number(
                            stats.total_invoices,
                          )
                        ) *
                        100
                      : 0;

                  return (
                    <div
                      key={
                        item.status
                      }
                      className="admin-reports-bar"
                    >
                      <div>
                        <span>
                          {getStatusLabel(
                            item.status,
                          )}
                        </span>

                        <strong>
                          {item.total}
                        </strong>
                      </div>

                      <div className="admin-reports-bar__track">
                        <span
                          style={{
                            width:
                              `${Math.min(
                                100,
                                percentage,
                              )}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          </article>

          <article className="admin-reports-card">
            <header>
              <span>
                📥
              </span>

              <div>
                <small>
                  Entrées
                </small>

                <h2>
                  Sources
                </h2>
              </div>
            </header>

            <div className="admin-reports-sources">
              {sources.map(
                (
                  item,
                ) => (
                  <div
                    key={
                      item.source
                    }
                  >
                    <span>
                      {item.source}
                    </span>

                    <strong>
                      {formatInteger(
                        item.total,
                      )}
                    </strong>

                    <small>
                      {formatPercent(
                        item.percentage,
                      )}
                    </small>
                  </div>
                ),
              )}
            </div>
          </article>
        </div>

        <article className="admin-reports-card">
          <header>
            <span>
              📅
            </span>

            <div>
              <small>
                Évolution
              </small>

              <h2>
                Factures par mois
              </h2>
            </div>
          </header>

          <div className="admin-reports-monthly">
            {monthly.length ===
            0 ? (
              <p>
                Aucune donnée mensuelle disponible.
              </p>
            ) : (
              monthly.map(
                (
                  item,
                ) => (
                  <div
                    key={
                      item.month
                    }
                    className="admin-reports-month"
                  >
                    <div className="admin-reports-month__chart">
                      <span
                        style={{
                          height:
                            `${Math.max(
                              6,
                              (
                                Number(
                                  item.total,
                                ) /
                                maxMonthly
                              ) *
                                100,
                            )}%`,
                        }}
                      />
                    </div>

                    <strong>
                      {item.total}
                    </strong>

                    <small>
                      {formatMonth(
                        item.month,
                      )}
                    </small>
                  </div>
                ),
              )
            )}
          </div>
        </article>

        <article className="admin-reports-card">
          <header>
            <span>
              🏢
            </span>

            <div>
              <small>
                Performance clients
              </small>

              <h2>
                Organisations
              </h2>
            </div>
          </header>

          <div className="admin-reports-table-wrap">
            <table className="admin-reports-table">
              <thead>
                <tr>
                  <th>
                    Organisation
                  </th>

                  <th>
                    Pays
                  </th>

                  <th>
                    Factures
                  </th>

                  <th>
                    Acceptées
                  </th>

                  <th>
                    Action requise
                  </th>

                  <th>
                    Acceptation
                  </th>

                  <th>
                    Valeur
                  </th>
                </tr>
              </thead>

              <tbody>
                {organizationPerformance.map(
                  (
                    item,
                  ) => (
                    <tr
                      key={
                        item.organization_id ||
                        item.organization_name
                      }
                    >
                      <td>
                        <strong>
                          {item.organization_name}
                        </strong>
                      </td>

                      <td>
                        {item.country ||
                          "—"}
                      </td>

                      <td>
                        {item.total}
                      </td>

                      <td>
                        {item.accepted}
                      </td>

                      <td>
                        {item.action_required}
                      </td>

                      <td>
                        <span className="admin-reports-rate">
                          {formatPercent(
                            item.acceptance_rate,
                          )}
                        </span>
                      </td>

                      <td>
                        {formatMoney(
                          item.total_value,
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="admin-reports-card">
          <header>
            <span>
              ⚠️
            </span>

            <div>
              <small>
                Diagnostic
              </small>

              <h2>
                Erreurs fréquentes
              </h2>
            </div>
          </header>

          {errors.length ===
          0 ? (
            <div className="admin-reports-empty">
              ✅ Aucun code d’erreur récurrent.
            </div>
          ) : (
            <div className="admin-reports-errors">
              {errors.map(
                (
                  item,
                  index,
                ) => (
                  <div
                    key={
                      item.error_code
                    }
                  >
                    <span>
                      #{String(
                        index +
                          1,
                      ).padStart(
                        2,
                        "0",
                      )}
                    </span>

                    <code>
                      {item.error_code}
                    </code>

                    <strong>
                      {item.total}
                    </strong>
                  </div>
                ),
              )}
            </div>
          )}
        </article>
      </section>
    </AdminShell>
  );
}

export default AdminReportsPage;