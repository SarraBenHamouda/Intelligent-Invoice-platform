import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Link,
  useSearchParams,
} from "react-router-dom";

import AdminShell from "../AdminShell/AdminShell";

import {
  getAccessToken,
} from "../../../../services/authService";

import "./AdminInvoices.css";

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
| GROUPS
|--------------------------------------------------------------------------
*/

const PROCESSING_STATUSES =
  new Set([
    "UPLOADED",
    "PROCESSING",
    "VALIDATED",
    "SIGNING",
    "SIGNED",
    "SUBMITTED",
  ]);

const ATTENTION_STATUSES =
  new Set([
    "PENDING_REVIEW",
    "PENDING_RETRY",
    "REJECTED",
    "ERROR",
  ]);

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function normalizeStatus(value) {
  return String(
    value || "",
  )
    .trim()
    .toUpperCase();
}

function safeArray(value) {
  return Array.isArray(
    value,
  )
    ? value
    : [];
}

function formatNumber(value) {
  const number =
    Number(value);

  if (
    !Number.isFinite(
      number,
    )
  ) {
    return "0";
  }

  return new Intl.NumberFormat(
    "fr-FR",
  ).format(number);
}

function formatMoney(
  value,
  currency,
) {
  const amount =
    Number(value);

  if (
    !Number.isFinite(
      amount,
    )
  ) {
    return "—";
  }

  const normalizedCurrency =
    String(
      currency ||
        "",
    )
      .trim()
      .toUpperCase();

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
      // fallback
    }
  }

  return `${amount.toFixed(
    3,
  )} ${normalizedCurrency}`.trim();
}

function formatDate(value) {
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
      day:
        "2-digit",

      month:
        "2-digit",

      year:
        "numeric",

      hour:
        "2-digit",

      minute:
        "2-digit",
    },
  ).format(date);
}

function getStatusLabel(
  value,
) {
  const status =
    normalizeStatus(
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

function getStatusClass(
  value,
) {
  const status =
    normalizeStatus(
      value,
    );

  if (
    status ===
    "ACCEPTED"
  ) {
    return "admin-invoices-status admin-invoices-status--success";
  }

  if (
    status ===
      "REJECTED" ||
    status ===
      "ERROR"
  ) {
    return "admin-invoices-status admin-invoices-status--danger";
  }

  if (
    status ===
      "PENDING_REVIEW" ||
    status ===
      "PENDING_RETRY"
  ) {
    return "admin-invoices-status admin-invoices-status--warning";
  }

  return "admin-invoices-status admin-invoices-status--processing";
}

function getStageLabel(
  value,
) {
  const stage =
    normalizeStatus(
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

function getSourceLabel(
  invoice,
) {
  const source =
    String(
      invoice?.source_type ||
        invoice?.source ||
        "",
    )
      .trim()
      .toUpperCase();

  if (
    source ===
      "SCAN_IMAGE" ||
    source ===
      "IMAGE"
  ) {
    return "IMAGE";
  }

  return (
    source ||
    "—"
  );
}

/*
|--------------------------------------------------------------------------
| PAGE
|--------------------------------------------------------------------------
*/

function AdminInvoicesPage() {
  const [
    searchParams,
    setSearchParams,
  ] =
    useSearchParams();

  const [
    invoices,
    setInvoices,
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
    useState(
      searchParams.get(
        "search",
      ) || "",
    );

  const [
    statusFilter,
    setStatusFilter,
  ] =
    useState(
      searchParams.get(
        "status",
      ) || "",
    );

  const [
    stageFilter,
    setStageFilter,
  ] =
    useState("");

  const [
    sourceFilter,
    setSourceFilter,
  ] =
    useState("");

  const [
    organizationFilter,
    setOrganizationFilter,
  ] =
    useState("");

  const [
    clientFilter,
    setClientFilter,
  ] =
    useState("");

  /*
  |--------------------------------------------------------------------------
  | GROUP FILTER
  |--------------------------------------------------------------------------
  */

  const groupFilter =
    searchParams.get(
      "group",
    ) ||
    "";

  /*
  |--------------------------------------------------------------------------
  | LOAD
  |--------------------------------------------------------------------------
  */

  const loadInvoices =
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
          /*
          |--------------------------------------------------------------------------
          | ADMIN ENDPOINT
          |--------------------------------------------------------------------------
          |
          | This is the endpoint we will connect to the backend:
          |
          | GET /api/admin/invoices
          |
          |--------------------------------------------------------------------------
          */

          const response =
            await fetch(
              `${API_BASE_URL}/api/admin/invoices`,
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

          const list =
            safeArray(
              data?.invoices ||
                data?.data ||
                data,
            );

          setInvoices(
            list,
          );

          setError(
            "",
          );
        } catch (
          loadError
        ) {
          console.error(
            "Admin invoices error:",
            loadError,
          );

          setError(
            loadError?.message ||
              "Impossible de charger les factures.",
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
  | INITIAL LOAD
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    loadInvoices();

    const interval =
      window.setInterval(
        () => {
          loadInvoices({
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
    loadInvoices,
  ]);

  /*
  |--------------------------------------------------------------------------
  | FILTER OPTIONS
  |--------------------------------------------------------------------------
  */

  const organizations =
    useMemo(
      () =>
        [
          ...new Set(
            invoices
              .map(
                (
                  invoice,
                ) =>
                  String(
                    invoice.organization_name ||
                      "",
                  ).trim(),
              )
              .filter(
                Boolean,
              ),
          ),
        ].sort(),
      [
        invoices,
      ],
    );

  const clients =
    useMemo(
      () =>
        [
          ...new Set(
            invoices
              .map(
                (
                  invoice,
                ) =>
                  String(
                    invoice.client_email ||
                      invoice.client_name ||
                      "",
                  ).trim(),
              )
              .filter(
                Boolean,
              ),
          ),
        ].sort(),
      [
        invoices,
      ],
    );

  /*
  |--------------------------------------------------------------------------
  | FILTER
  |--------------------------------------------------------------------------
  */

  const filteredInvoices =
    useMemo(
      () => {
        const needle =
          search
            .trim()
            .toLowerCase();

        return invoices.filter(
          (
            invoice,
          ) => {
            const status =
              normalizeStatus(
                invoice.status,
              );

            if (
              statusFilter &&
              status !==
                normalizeStatus(
                  statusFilter,
                )
            ) {
              return false;
            }

            if (
              groupFilter ===
                "processing" &&
              !PROCESSING_STATUSES.has(
                status,
              )
            ) {
              return false;
            }

            if (
              groupFilter ===
                "attention" &&
              !ATTENTION_STATUSES.has(
                status,
              )
            ) {
              return false;
            }

            if (
              stageFilter &&
              normalizeStatus(
                invoice.current_stage,
              ) !==
                normalizeStatus(
                  stageFilter,
                )
            ) {
              return false;
            }

            if (
              sourceFilter &&
              getSourceLabel(
                invoice,
              ) !==
                sourceFilter
            ) {
              return false;
            }

            if (
              organizationFilter &&
              invoice.organization_name !==
                organizationFilter
            ) {
              return false;
            }

            if (
              clientFilter
            ) {
              const client =
                invoice.client_email ||
                invoice.client_name ||
                "";

              if (
                client !==
                clientFilter
              ) {
                return false;
              }
            }

            if (
              !needle
            ) {
              return true;
            }

            const haystack =
              [
                invoice.invoice_number,
                invoice.original_filename,
                invoice.client_name,
                invoice.client_email,
                invoice.organization_name,
                invoice.source,
                invoice.source_type,
                invoice.status,
                invoice.current_stage,
                invoice.last_error_code,
                invoice.last_error_message,
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
        invoices,
        search,
        statusFilter,
        groupFilter,
        stageFilter,
        sourceFilter,
        organizationFilter,
        clientFilter,
      ],
    );

  /*
  |--------------------------------------------------------------------------
  | STATS
  |--------------------------------------------------------------------------
  */

  const statistics =
    useMemo(
      () => {
        let accepted =
          0;

        let processing =
          0;

        let attention =
          0;

        let rejected =
          0;

        for (
          const invoice
          of invoices
        ) {
          const status =
            normalizeStatus(
              invoice.status,
            );

          if (
            status ===
            "ACCEPTED"
          ) {
            accepted +=
              1;
          }

          if (
            PROCESSING_STATUSES.has(
              status,
            )
          ) {
            processing +=
              1;
          }

          if (
            ATTENTION_STATUSES.has(
              status,
            )
          ) {
            attention +=
              1;
          }

          if (
            status ===
              "REJECTED" ||
            status ===
              "ERROR"
          ) {
            rejected +=
              1;
          }
        }

        return {
          total:
            invoices.length,

          accepted,

          processing,

          attention,

          rejected,
        };
      },
      [
        invoices,
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

    setStatusFilter(
      "",
    );

    setStageFilter(
      "",
    );

    setSourceFilter(
      "",
    );

    setOrganizationFilter(
      "",
    );

    setClientFilter(
      "",
    );

    setSearchParams(
      {},
    );
  }

  /*
  |--------------------------------------------------------------------------
  | STAT FILTER
  |--------------------------------------------------------------------------
  */

  function applyStatistic(
    type,
  ) {
    setStatusFilter(
      "",
    );

    const next =
      new URLSearchParams();

    if (
      type ===
      "accepted"
    ) {
      setStatusFilter(
        "ACCEPTED",
      );

      next.set(
        "status",
        "ACCEPTED",
      );
    }

    if (
      type ===
      "processing"
    ) {
      next.set(
        "group",
        "processing",
      );
    }

    if (
      type ===
      "attention"
    ) {
      next.set(
        "group",
        "attention",
      );
    }

    setSearchParams(
      next,
    );
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
      onClick={() =>
        loadInvoices({
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
      eyebrow="Supervision des factures"
      title="Factures"
      actions={
        actions
      }
    >
      <section className="admin-invoices">
        {/*
        |--------------------------------------------------------------------------
        | ERROR
        |--------------------------------------------------------------------------
        */}

        {error && (
          <div className="admin-invoices__error">
            <div>
              <strong>
                ⚠ Chargement impossible
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
                loadInvoices()
              }
            >
              Réessayer
            </button>
          </div>
        )}

        {/*
        |--------------------------------------------------------------------------
        | STATISTICS
        |--------------------------------------------------------------------------
        */}

        <div className="admin-invoices__stats">
          <button
            type="button"
            className="admin-invoices-stat admin-invoices-stat--purple"
            onClick={
              resetFilters
            }
          >
            <span>
              📚 Toutes
            </span>

            <strong>
              {formatNumber(
                statistics.total,
              )}
            </strong>

            <small>
              Factures enregistrées
            </small>
          </button>

          <button
            type="button"
            className="admin-invoices-stat admin-invoices-stat--green"
            onClick={() =>
              applyStatistic(
                "accepted",
              )
            }
          >
            <span>
              ✅ Acceptées
            </span>

            <strong>
              {formatNumber(
                statistics.accepted,
              )}
            </strong>

            <small>
              Traitement terminé
            </small>
          </button>

          <button
            type="button"
            className="admin-invoices-stat admin-invoices-stat--blue"
            onClick={() =>
              applyStatistic(
                "processing",
              )
            }
          >
            <span>
              ⚡ En cours
            </span>

            <strong>
              {formatNumber(
                statistics.processing,
              )}
            </strong>

            <small>
              Workflow actif
            </small>
          </button>

          <button
            type="button"
            className="admin-invoices-stat admin-invoices-stat--orange"
            onClick={() =>
              applyStatistic(
                "attention",
              )
            }
          >
            <span>
              ⚠ Action requise
            </span>

            <strong>
              {formatNumber(
                statistics.attention,
              )}
            </strong>

            <small>
              À contrôler
            </small>
          </button>
        </div>

        {/*
        |--------------------------------------------------------------------------
        | FILTERS
        |--------------------------------------------------------------------------
        */}

        <article className="admin-invoices__filters">
          <div className="admin-invoices-search">
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
              placeholder="N° facture, client, e-mail, organisation, erreur..."
            />
          </div>

          <select
            value={
              statusFilter
            }
            onChange={(
              event,
            ) => {
              setStatusFilter(
                event.target.value,
              );

              setSearchParams(
                {},
              );
            }}
          >
            <option value="">
              Tous les statuts
            </option>

            <option value="UPLOADED">
              Importée
            </option>

            <option value="PROCESSING">
              En traitement
            </option>

            <option value="PENDING_REVIEW">
              Révision requise
            </option>

            <option value="VALIDATED">
              Validée
            </option>

            <option value="SIGNING">
              Signature
            </option>

            <option value="SIGNED">
              Signée
            </option>

            <option value="SUBMITTED">
              Soumise
            </option>

            <option value="ACCEPTED">
              Acceptée
            </option>

            <option value="REJECTED">
              Rejetée
            </option>

            <option value="PENDING_RETRY">
              Relance
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
              sourceFilter
            }
            onChange={(
              event,
            ) =>
              setSourceFilter(
                event.target.value,
              )
            }
          >
            <option value="">
              Toutes les sources
            </option>

            <option value="PDF">
              PDF
            </option>

            <option value="IMAGE">
              Image
            </option>

            <option value="OCR">
              OCR
            </option>

            <option value="ERP">
              ERP
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
            className="admin-invoices__reset"
            onClick={
              resetFilters
            }
          >
            Réinitialiser
          </button>
        </article>

        {/*
        |--------------------------------------------------------------------------
        | TABLE
        |--------------------------------------------------------------------------
        */}

        <article className="admin-invoices__panel">
          <header className="admin-invoices__panel-header">
            <div>
              <span>
                Centre de supervision
              </span>

              <h2>
                Liste des factures
              </h2>

              <p>
                {formatNumber(
                  filteredInvoices.length,
                )} résultat(s)
              </p>
            </div>
          </header>

          {loading ? (
            <div className="admin-invoices__loading">
              <span />
              <p>
                Chargement des factures...
              </p>
            </div>
          ) : filteredInvoices.length ===
            0 ? (
            <div className="admin-invoices__empty">
              <span>
                🧾
              </span>

              <h3>
                Aucune facture
              </h3>

              <p>
                Aucune facture ne correspond aux filtres sélectionnés.
              </p>
            </div>
          ) : (
            <div className="admin-invoices-table-wrapper">
              <table className="admin-invoices-table">
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
                      Dernière activité
                    </th>

                    <th>
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredInvoices.map(
                    (
                      invoice,
                    ) => (
                      <tr
                        key={
                          invoice.id
                        }
                      >
                        <td>
                          <div className="admin-invoices-number">
                            <span>
                              🧾
                            </span>

                            <div>
                              <strong>
                                {invoice.invoice_number ||
                                  "Sans numéro"}
                              </strong>

                              <small>
                                {invoice.original_filename ||
                                  invoice.id}
                              </small>
                            </div>
                          </div>
                        </td>

                        <td>
                          <div className="admin-invoices-client">
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
                          <span className="admin-invoices-organization">
                            {invoice.organization_name ||
                              "—"}
                          </span>
                        </td>

                        <td>
                          <span className="admin-invoices-tag">
                            {getSourceLabel(
                              invoice,
                            )}
                          </span>
                        </td>

                        <td>
                          <span className="admin-invoices-stage">
                            {getStageLabel(
                              invoice.current_stage,
                            )}
                          </span>
                        </td>

                        <td>
                          <span
                            className={getStatusClass(
                              invoice.status,
                            )}
                          >
                            {getStatusLabel(
                              invoice.status,
                            )}
                          </span>
                        </td>

                        <td>
                          <strong className="admin-invoices-money">
                            {formatMoney(
                              invoice.total_ttc ??
                                invoice.total_amount,
                              invoice.currency,
                            )}
                          </strong>
                        </td>

                        <td>
                          <span className="admin-invoices-date">
                            {formatDate(
                              invoice.updated_at ||
                                invoice.created_at,
                            )}
                          </span>
                        </td>

                        <td>
                          <Link
                            /*
                            |--------------------------------------------------------------------------
                            | We will create the admin detail page after this.
                            |--------------------------------------------------------------------------
                            */
                            to={`/admin/invoices/${invoice.id}`}
                            className="admin-invoices-view"
                            title="Consulter la facture"
                          >
                            Voir
                            <span>
                              →
                            </span>
                          </Link>
                        </td>
                      </tr>
                    ),
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

export default AdminInvoicesPage;