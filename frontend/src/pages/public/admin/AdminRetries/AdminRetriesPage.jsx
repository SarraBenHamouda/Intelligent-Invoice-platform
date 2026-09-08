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

import "./AdminRetriesPage.css";

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

      className:
        "admin-retries-severity--high",

      icon:
        "🚨",
    };
  }

  if (
    severity ===
    "MEDIUM"
  ) {
    return {
      label:
        "Attention",

      className:
        "admin-retries-severity--medium",

      icon:
        "⚠️",
    };
  }

  return {
    label:
      "Faible",

    className:
      "admin-retries-severity--low",

    icon:
      "ℹ️",
  };
}

function getStageLabel(value) {
  const stage =
    normalize(value);

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
    labels[stage] ||
    stage ||
    "Inconnue"
  );
}

function getSourceLabel(value) {
  const source =
    normalize(value);

  if (
    source ===
    "PDF_TEXT"
  ) {
    return "PDF";
  }

  if (
    source ===
      "OCR_TESSERACT" ||
    source ===
      "OCR"
  ) {
    return "OCR";
  }

  if (
    source ===
    "ERP"
  ) {
    return "ERP";
  }

  return (
    source ||
    "UNKNOWN"
  );
}

function getErrorLabel(value) {
  const code =
    normalize(value);

  const labels = {
    TTN_TIMEOUT:
      "Timeout TTN",

    TTN_UNAVAILABLE:
      "TTN indisponible",

    TTN_SERVER_ERROR:
      "Erreur serveur TTN",

    TIMEOUT:
      "Timeout",

    ETIMEDOUT:
      "Délai dépassé",

    ECONNREFUSED:
      "Connexion refusée",

    CONNECTION_ERROR:
      "Erreur de connexion",

    CONNECTIONERROR:
      "Erreur de connexion",

    NETWORK_ERROR:
      "Erreur réseau",

    SERVICE_UNAVAILABLE:
      "Service indisponible",
  };

  return (
    labels[code] ||
    code ||
    "Erreur temporaire"
  );
}

/*
|--------------------------------------------------------------------------
| PAGE
|--------------------------------------------------------------------------
*/

function AdminRetriesPage() {
  const [
    retries,
    setRetries,
  ] =
    useState([]);

  const [
    stats,
    setStats,
  ] =
    useState({});

  const [
    errorTypes,
    setErrorTypes,
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
    severityFilter,
    setSeverityFilter,
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

  const [
    errorFilter,
    setErrorFilter,
  ] =
    useState("");

  const [
    retryingId,
    setRetryingId,
  ] =
    useState(null);

  const [
    confirmRetry,
    setConfirmRetry,
  ] =
    useState(null);

  /*
  |--------------------------------------------------------------------------
  | LOAD
  |--------------------------------------------------------------------------
  */

  const loadRetries =
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
              `${API_BASE_URL}/api/admin/retries`,
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

          setRetries(
            safeArray(
              data?.retries,
            ),
          );

          setStats(
            data?.stats ||
              {},
          );

          setErrorTypes(
            safeArray(
              data?.error_types,
            ),
          );

          setError("");
        } catch (
          loadError
        ) {
          console.error(
            "Admin retries error:",
            loadError,
          );

          setError(
            loadError?.message ||
              "Impossible de charger les relances.",
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
    loadRetries();

    const interval =
      window.setInterval(
        () => {
          loadRetries({
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
    loadRetries,
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
            retries
              .map(
                (
                  retry,
                ) =>
                  String(
                    retry.organization_name ||
                      "",
                  ).trim(),
              )
              .filter(Boolean),
          ),
        ].sort(),
      [
        retries,
      ],
    );

  /*
  |--------------------------------------------------------------------------
  | FILTERED RETRIES
  |--------------------------------------------------------------------------
  */

  const filteredRetries =
    useMemo(
      () => {
        const needle =
          search
            .trim()
            .toLowerCase();

        return retries.filter(
          (
            retry,
          ) => {
            if (
              severityFilter &&
              normalize(
                retry.severity,
              ) !==
                severityFilter
            ) {
              return false;
            }

            if (
              stageFilter &&
              normalize(
                retry.current_stage,
              ) !==
                stageFilter
            ) {
              return false;
            }

            if (
              organizationFilter &&
              retry.organization_name !==
                organizationFilter
            ) {
              return false;
            }

            if (
              errorFilter &&
              normalize(
                retry.error_code,
              ) !==
                errorFilter
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
                retry.invoice_number,
                retry.organization_name,
                retry.client_name,
                retry.client_email,
                retry.current_stage,
                retry.status,
                retry.source,
                retry.error_code,
                retry.error_message,
                retry.transaction_id,
                retry.ttn_reference,
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
        retries,
        search,
        severityFilter,
        stageFilter,
        organizationFilter,
        errorFilter,
      ],
    );

  /*
  |--------------------------------------------------------------------------
  | RESET
  |--------------------------------------------------------------------------
  */

  function resetFilters() {
    setSearch("");
    setSeverityFilter("");
    setStageFilter("");
    setOrganizationFilter("");
    setErrorFilter("");
  }

  /*
  |--------------------------------------------------------------------------
  | RETRY
  |--------------------------------------------------------------------------
  */

  async function executeRetry(
    invoice,
  ) {
    const token =
      getAccessToken();

    if (!token) {
      setError(
        "Session administrateur introuvable.",
      );

      return;
    }

    setRetryingId(
      invoice.invoice_id,
    );

    setError("");
    setSuccessMessage("");

    try {
      const response =
        await fetch(
          `${API_BASE_URL}/api/admin/retries/${invoice.invoice_id}/retry`,
          {
            method:
              "POST",

            headers: {
              Accept:
                "application/json",

              "Content-Type":
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

      setSuccessMessage(
        `La relance de la facture ${
          invoice.invoice_number ||
          invoice.invoice_id
        } a été demandée avec succès.`,
      );

      setConfirmRetry(null);

      await loadRetries({
        silent:
          true,
      });
    } catch (
      retryError
    ) {
      console.error(
        "Retry invoice error:",
        retryError,
      );

      setError(
        retryError?.message ||
          "Impossible de relancer cette facture.",
      );

      setConfirmRetry(null);
    } finally {
      setRetryingId(null);
    }
  }

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
        loadRetries({
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
      eyebrow="Supervision & reprise"
      title="Centre de relances"
      actions={
        actions
      }
    >
      <section className="admin-retries">
        {/*
        |--------------------------------------------------------------------------
        | MESSAGES
        |--------------------------------------------------------------------------
        */}

        {error && (
          <article className="admin-retries__message admin-retries__message--error">
            <div>
              <strong>
                ⚠ Une erreur est survenue
              </strong>

              <p>
                {error}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setError("")
              }
            >
              ×
            </button>
          </article>
        )}

        {successMessage && (
          <article className="admin-retries__message admin-retries__message--success">
            <div>
              <strong>
                ✅ Relance démarrée
              </strong>

              <p>
                {successMessage}
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
          </article>
        )}

        {/*
        |--------------------------------------------------------------------------
        | STATS
        |--------------------------------------------------------------------------
        */}

        <div className="admin-retries__stats">
          <button
            type="button"
            className="admin-retries-stat admin-retries-stat--purple"
            onClick={
              resetFilters
            }
          >
            <span>
              🔁 Relançables
            </span>

            <strong>
              {formatInteger(
                stats.total,
              )}
            </strong>

            <small>
              Total en attente
            </small>
          </button>

          <button
            type="button"
            className="admin-retries-stat admin-retries-stat--red"
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
                stats.high,
              )}
            </strong>

            <small>
              Priorité haute
            </small>
          </button>

          <button
            type="button"
            className="admin-retries-stat admin-retries-stat--orange"
            onClick={() =>
              setSeverityFilter(
                "MEDIUM",
              )
            }
          >
            <span>
              ⚠ Attention
            </span>

            <strong>
              {formatInteger(
                stats.medium,
              )}
            </strong>

            <small>
              Reprise à surveiller
            </small>
          </button>

          <button
            type="button"
            className="admin-retries-stat admin-retries-stat--blue"
            onClick={() =>
              setStageFilter(
                "TTN",
              )
            }
          >
            <span>
              📡 TTN
            </span>

            <strong>
              {formatInteger(
                stats.ttn,
              )}
            </strong>

            <small>
              Blocages transmission
            </small>
          </button>

          <button
            type="button"
            className="admin-retries-stat admin-retries-stat--green"
            onClick={() =>
              setStageFilter(
                "SIGNATURE",
              )
            }
          >
            <span>
              ✍️ Signature
            </span>

            <strong>
              {formatInteger(
                stats.signature,
              )}
            </strong>

            <small>
              Blocages signature
            </small>
          </button>
        </div>

        {/*
        |--------------------------------------------------------------------------
        | FREQUENT ERRORS
        |--------------------------------------------------------------------------
        */}

        <article className="admin-retries-errors">
          <header>
            <div>
              <span>
                Diagnostic
              </span>

              <h2>
                Causes de relance
              </h2>

              <p>
                Codes d’erreur actuellement présents dans la file de reprise.
              </p>
            </div>
          </header>

          <div className="admin-retries-errors__grid">
            {errorTypes.length ===
            0 ? (
              <p className="admin-retries-muted">
                Aucun code d’erreur relançable actuellement.
              </p>
            ) : (
              errorTypes.map(
                (
                  item,
                ) => (
                  <button
                    type="button"
                    key={
                      item.error_code
                    }
                    onClick={() =>
                      setErrorFilter(
                        normalize(
                          item.error_code,
                        ),
                      )
                    }
                  >
                    <div>
                      <strong>
                        {getErrorLabel(
                          item.error_code,
                        )}
                      </strong>

                      <code>
                        {item.error_code}
                      </code>
                    </div>

                    <span>
                      {formatInteger(
                        item.total,
                      )}
                    </span>
                  </button>
                ),
              )
            )}
          </div>
        </article>

        {/*
        |--------------------------------------------------------------------------
        | FILTERS
        |--------------------------------------------------------------------------
        */}

        <article className="admin-retries__filters">
          <div className="admin-retries-search">
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
              placeholder="Facture, client, organisation, erreur, transaction..."
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
              Toutes les priorités
            </option>

            <option value="HIGH">
              Critique
            </option>

            <option value="MEDIUM">
              Attention
            </option>

            <option value="LOW">
              Faible
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
              errorFilter
            }
            onChange={(
              event,
            ) =>
              setErrorFilter(
                event.target.value,
              )
            }
          >
            <option value="">
              Toutes les erreurs
            </option>

            {errorTypes.map(
              (
                item,
              ) => (
                <option
                  key={
                    item.error_code
                  }
                  value={
                    normalize(
                      item.error_code,
                    )
                  }
                >
                  {item.error_code}
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
                  {organization}
                </option>
              ),
            )}
          </select>

          <button
            type="button"
            className="admin-retries__reset"
            onClick={
              resetFilters
            }
          >
            Réinitialiser
          </button>
        </article>

        {/*
        |--------------------------------------------------------------------------
        | LIST
        |--------------------------------------------------------------------------
        */}

        <article className="admin-retries__panel">
          <header className="admin-retries__panel-header">
            <div>
              <span>
                File de reprise
              </span>

              <h2>
                Traitements relançables
              </h2>

              <p>
                {formatInteger(
                  filteredRetries.length,
                )} facture(s)
              </p>
            </div>
          </header>

          {loading ? (
            <div className="admin-retries__loading">
              <span />

              <p>
                Chargement des relances...
              </p>
            </div>
          ) : filteredRetries.length ===
            0 ? (
            <div className="admin-retries__empty">
              <span>
                ✅
              </span>

              <h3>
                Aucune relance requise
              </h3>

              <p>
                Aucun traitement relançable ne correspond aux critères actuels.
              </p>
            </div>
          ) : (
            <div className="admin-retries-list">
              {filteredRetries.map(
                (
                  retry,
                ) => {
                  const severity =
                    getSeverityData(
                      retry.severity,
                    );

                  const isRetrying =
                    retryingId ===
                    retry.invoice_id;

                  return (
                    <article
                      key={
                        retry.invoice_id
                      }
                      className="admin-retry-card"
                    >
                      <header className="admin-retry-card__header">
                        <div className="admin-retry-card__identity">
                          <span className="admin-retry-card__icon">
                            🔁
                          </span>

                          <div>
                            <span className="admin-retry-card__eyebrow">
                              Facture à relancer
                            </span>

                            <h3>
                              {retry.invoice_number ||
                                "Sans numéro"}
                            </h3>

                            <small>
                              {retry.invoice_id}
                            </small>
                          </div>
                        </div>

                        <span
                          className={`admin-retries-severity ${severity.className}`}
                        >
                          {severity.icon}
                          {severity.label}
                        </span>
                      </header>

                      <div className="admin-retry-card__meta">
                        <span>
                          🏢 {retry.organization_name ||
                            "Organisation inconnue"}
                        </span>

                        <span>
                          👤 {retry.client_name ||
                            "Client"}
                        </span>

                        <span>
                          📥 {getSourceLabel(
                            retry.source,
                          )}
                        </span>

                        <span>
                          ⚙️ {getStageLabel(
                            retry.current_stage,
                          )}
                        </span>

                        <span>
                          🔢 Tentative {formatInteger(
                            retry.retry_count,
                          )}
                        </span>
                      </div>

                      <div className="admin-retry-card__diagnostic">
                        <div className="admin-retry-card__diagnostic-icon">
                          ⚠
                        </div>

                        <div>
                          <span>
                            Cause du blocage
                          </span>

                          <h4>
                            {getErrorLabel(
                              retry.error_code,
                            )}
                          </h4>

                          <code>
                            {retry.error_code ||
                              "UNKNOWN"}
                          </code>

                          <p>
                            {retry.error_message ||
                              retry.rejection_reason ||
                              "Le traitement a été interrompu par une erreur temporaire."}
                          </p>
                        </div>
                      </div>

                      <div className="admin-retry-card__details">
                        <div>
                          <span>
                            Statut
                          </span>

                          <strong>
                            {retry.status ||
                              "—"}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Dernière activité
                          </span>

                          <strong>
                            {formatDateTime(
                              retry.updated_at,
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Transaction
                          </span>

                          <strong>
                            {retry.transaction_id ||
                              "—"}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Référence TTN
                          </span>

                          <strong>
                            {retry.ttn_reference ||
                              "—"}
                          </strong>
                        </div>
                      </div>

                      <footer className="admin-retry-card__footer">
                        <Link
                          to={`/admin/invoices/${retry.invoice_id}`}
                        >
                          Voir la facture
                          <span>
                            →
                          </span>
                        </Link>

                        <button
                          type="button"
                          disabled={
                            isRetrying
                          }
                          onClick={() =>
                            setConfirmRetry(
                              retry,
                            )
                          }
                        >
                          {isRetrying
                            ? "Relance..."
                            : "🔁 Relancer"}
                        </button>
                      </footer>
                    </article>
                  );
                },
              )}
            </div>
          )}
        </article>

        {/*
        |--------------------------------------------------------------------------
        | CONFIRM MODAL
        |--------------------------------------------------------------------------
        */}

        {confirmRetry && (
          <div className="admin-retries-modal">
            <button
              type="button"
              className="admin-retries-modal__overlay"
              onClick={() =>
                setConfirmRetry(
                  null,
                )
              }
              aria-label="Fermer"
            />

            <article className="admin-retries-modal__dialog">
              <span className="admin-retries-modal__icon">
                🔁
              </span>

              <span className="admin-retries-modal__eyebrow">
                Confirmation
              </span>

              <h2>
                Relancer cette facture ?
              </h2>

              <p>
                La plateforme va demander une nouvelle exécution du workflow pour la facture :
              </p>

              <strong>
                {confirmRetry.invoice_number ||
                  confirmRetry.invoice_id}
              </strong>

              <div className="admin-retries-modal__warning">
                Cette action ne force pas l’acceptation de la facture. Le résultat final dépendra du nouveau traitement du workflow.
              </div>

              <footer>
                <button
                  type="button"
                  className="admin-retries-modal__cancel"
                  onClick={() =>
                    setConfirmRetry(
                      null,
                    )
                  }
                >
                  Annuler
                </button>

                <button
                  type="button"
                  className="admin-retries-modal__confirm"
                  disabled={
                    retryingId ===
                    confirmRetry.invoice_id
                  }
                  onClick={() =>
                    executeRetry(
                      confirmRetry,
                    )
                  }
                >
                  {retryingId ===
                  confirmRetry.invoice_id
                    ? "Relance en cours..."
                    : "🔁 Confirmer la relance"}
                </button>
              </footer>
            </article>
          </div>
        )}
      </section>
    </AdminShell>
  );
}

export default AdminRetriesPage;