import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Link,
  useNavigate,
  useParams,
} from "react-router-dom";

import AdminShell from "../AdminShell/AdminShell";

import {
  getAccessToken,
} from "../../../../services/authService";

import "./AdminInvoiceDetails.css";

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

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function normalize(
  value,
) {
  return String(
    value || "",
  )
    .trim()
    .toUpperCase();
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
        "short",
    },
  ).format(
    date,
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
      dateStyle:
        "medium",
    },
  ).format(
    date,
  );
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
      "Génération TEIF",

    SIGNATURE:
      "Signature",

    TTN:
      "Soumission TTN",
  };

  return (
    labels[
      stage
    ] ||
    stage ||
    "Inconnue"
  );
}

function getSeverityData(
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
    return {
      label:
        "Critique",

      icon:
        "🔴",

      className:
        "admin-invoice-detail-severity--high",
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
        "🟠",

      className:
        "admin-invoice-detail-severity--medium",
    };
  }

  return {
    label:
      "Information",

    icon:
      "🟡",

    className:
      "admin-invoice-detail-severity--low",
  };
}

function getStatusClass(
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
    return "admin-invoice-detail-status admin-invoice-detail-status--success";
  }

  if (
    status ===
      "ERROR" ||
    status ===
      "REJECTED"
  ) {
    return "admin-invoice-detail-status admin-invoice-detail-status--danger";
  }

  if (
    status ===
      "PENDING_REVIEW" ||
    status ===
      "PENDING_RETRY"
  ) {
    return "admin-invoice-detail-status admin-invoice-detail-status--warning";
  }

  return "admin-invoice-detail-status admin-invoice-detail-status--processing";
}

function renderJson(
  value,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "Aucune donnée disponible.";
  }

  if (
    typeof value ===
    "string"
  ) {
    return value;
  }

  try {
    return JSON.stringify(
      value,
      null,
      2,
    );
  } catch {
    return String(
      value,
    );
  }
}

/*
|--------------------------------------------------------------------------
| PAGE
|--------------------------------------------------------------------------
*/

function AdminInvoiceDetailsPage() {
  const {
    id,
  } =
    useParams();

  const navigate =
    useNavigate();

  const [
    invoice,
    setInvoice,
  ] =
    useState(null);

  const [
    timeline,
    setTimeline,
  ] =
    useState([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    showTechnical,
    setShowTechnical,
  ] =
    useState(false);

  const [
    showValidation,
    setShowValidation,
  ] =
    useState(true);

  /*
  |--------------------------------------------------------------------------
  | LOAD
  |--------------------------------------------------------------------------
  */

  const loadInvoice =
    useCallback(
      async () => {
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

        setLoading(
          true,
        );

        try {
          const response =
            await fetch(
              `${API_BASE_URL}/api/admin/invoices/${id}`,
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

          setInvoice(
            data?.invoice ||
              null,
          );

          setTimeline(
            Array.isArray(
              data?.timeline,
            )
              ? data.timeline
              : [],
          );

          setError(
            "",
          );
        } catch (
          loadError
        ) {
          console.error(
            "Admin invoice details:",
            loadError,
          );

          setError(
            loadError?.message ||
              "Impossible de charger la facture.",
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [
        id,
      ],
    );

  useEffect(() => {
    loadInvoice();
  }, [
    loadInvoice,
  ]);

  /*
  |--------------------------------------------------------------------------
  | DERIVED
  |--------------------------------------------------------------------------
  */

  const severity =
    useMemo(
      () =>
        getSeverityData(
          invoice?.severity,
        ),
      [
        invoice,
      ],
    );

  const source =
    String(
      invoice?.source_type ||
        invoice?.source ||
        "—",
    ).toUpperCase();

  const hasDiagnostic =
    Boolean(
      invoice?.error_code ||
        invoice?.error_message ||
        invoice?.rejection_reason ||
        invoice?.validation_errors,
    );

  const actions = (
    <div className="admin-invoice-detail-header-actions">
      <button
        type="button"
        className="admin-action-btn"
        onClick={() =>
          navigate(
            "/admin/errors",
          )
        }
      >
        ← Anomalies
      </button>

      <button
        type="button"
        className="admin-action-btn"
        onClick={
          loadInvoice
        }
      >
        ↻ Actualiser
      </button>
    </div>
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
        eyebrow="Investigation"
        title="Détail de la facture"
        description="Chargement du dossier..."
      >
        <div className="admin-invoice-detail-loading">
          <span />

          <p>
            Chargement de la facture...
          </p>
        </div>
      </AdminShell>
    );
  }

  /*
  |--------------------------------------------------------------------------
  | ERROR
  |--------------------------------------------------------------------------
  */

  if (
    error ||
    !invoice
  ) {
    return (
      <AdminShell
        eyebrow="Investigation"
        title="Détail de la facture"
        description="Impossible d’ouvrir le dossier demandé."
      >
        <div className="admin-invoice-detail-load-error">
          <span>
            ⚠️
          </span>

          <h2>
            Facture indisponible
          </h2>

          <p>
            {error ||
              "La facture demandée n'existe pas."}
          </p>

          <div>
            <button
              type="button"
              onClick={() =>
                navigate(
                  "/admin/errors",
                )
              }
            >
              ← Retour aux anomalies
            </button>

            <button
              type="button"
              onClick={
                loadInvoice
              }
            >
              Réessayer
            </button>
          </div>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      eyebrow="Investigation de facture"
      title={
        invoice.invoice_number
          ? `Facture ${invoice.invoice_number}`
          : "Facture sans numéro"
      }
      description="Analyse détaillée du traitement, du client et des anomalies détectées."
      actions={
        actions
      }
    >
      <section className="admin-invoice-detail">
        {/*
        |--------------------------------------------------------------------------
        | BREADCRUMB
        |--------------------------------------------------------------------------
        */}

        <div className="admin-invoice-detail-breadcrumb">
          <Link to="/admin/dashboard">
            Administration
          </Link>

          <span>
            /
          </span>

          <Link to="/admin/errors">
            Anomalies
          </Link>

          <span>
            /
          </span>

          <strong>
            {invoice.invoice_number ||
              invoice.id}
          </strong>
        </div>

        {/*
        |--------------------------------------------------------------------------
        | HERO
        |--------------------------------------------------------------------------
        */}

        <article className="admin-invoice-detail-hero">
          <div className="admin-invoice-detail-hero__main">
            <div className="admin-invoice-detail-hero__icon">
              🧾
            </div>

            <div>
              <div className="admin-invoice-detail-hero__badges">
                <span
                  className={getStatusClass(
                    invoice.status,
                  )}
                >
                  {getStatusLabel(
                    invoice.status,
                  )}
                </span>

                <span className="admin-invoice-detail-stage">
                  ⚙️ {getStageLabel(
                    invoice.current_stage,
                  )}
                </span>

                <span className="admin-invoice-detail-source">
                  {source}
                </span>
              </div>

              <h2>
                {invoice.invoice_number ||
                  "Facture sans numéro"}
              </h2>

              <p>
                {invoice.original_filename ||
                  "Aucun nom de fichier disponible"}
              </p>
            </div>
          </div>

          <div className="admin-invoice-detail-hero__right">
            {hasDiagnostic ? (
              <div
                className={`admin-invoice-detail-severity ${severity.className}`}
              >
                <span>
                  {
                    severity.icon
                  }
                </span>

                <div>
                  <small>
                    Niveau
                  </small>

                  <strong>
                    {
                      severity.label
                    }
                  </strong>
                </div>
              </div>
            ) : (
              <div className="admin-invoice-detail-severity admin-invoice-detail-severity--success">
                <span>
                  🟢
                </span>

                <div>
                  <small>
                    Diagnostic
                  </small>

                  <strong>
                    Aucun incident
                  </strong>
                </div>
              </div>
            )}
          </div>
        </article>

        {/*
        |--------------------------------------------------------------------------
        | DIAGNOSTIC
        |--------------------------------------------------------------------------
        */}

        {hasDiagnostic && (
          <article className="admin-invoice-detail-diagnostic">
            <div className="admin-invoice-detail-diagnostic__icon">
              ⚠️
            </div>

            <div className="admin-invoice-detail-diagnostic__content">
              <span>
                Diagnostic de l’anomalie
              </span>

              <h2>
                {invoice.error_code ||
                  "ANOMALIE_DETECTEE"}
              </h2>

              <p>
                {invoice.error_message ||
                  invoice.rejection_reason ||
                  "Une anomalie nécessite une vérification."}
              </p>

              <div className="admin-invoice-detail-diagnostic__tags">
                <span>
                  Étape : {getStageLabel(
                    invoice.current_stage,
                  )}
                </span>

                <span>
                  Statut : {getStatusLabel(
                    invoice.status,
                  )}
                </span>

                <span>
                  {invoice.can_retry
                    ? "🔄 Nouvelle tentative autorisée"
                    : "🔒 Nouvelle tentative non autorisée"}
                </span>
              </div>
            </div>
          </article>
        )}

        {/*
        |--------------------------------------------------------------------------
        | MAIN GRID
        |--------------------------------------------------------------------------
        */}

        <div className="admin-invoice-detail-grid">
          {/*
          |--------------------------------------------------------------------------
          | INVOICE
          |--------------------------------------------------------------------------
          */}

          <article className="admin-invoice-detail-card">
            <header>
              <span>
                🧾
              </span>

              <div>
                <small>
                  Document
                </small>

                <h3>
                  Informations facture
                </h3>
              </div>
            </header>

            <div className="admin-invoice-detail-fields">
              <div>
                <span>
                  Numéro
                </span>

                <strong>
                  {invoice.invoice_number ||
                    "—"}
                </strong>
              </div>

              <div>
                <span>
                  Date facture
                </span>

                <strong>
                  {formatDate(
                    invoice.invoice_date,
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Fournisseur
                </span>

                <strong>
                  {invoice.supplier_identifier ||
                    "—"}
                </strong>
              </div>

              <div>
                <span>
                  Client / Identifiant
                </span>

                <strong>
                  {invoice.customer_identifier ||
                    "—"}
                </strong>
              </div>

              <div>
                <span>
                  Source
                </span>

                <strong>
                  {
                    source
                  }
                </strong>
              </div>

              <div>
                <span>
                  Fichier original
                </span>

                <strong>
                  {invoice.original_filename ||
                    "—"}
                </strong>
              </div>
            </div>
          </article>

          {/*
          |--------------------------------------------------------------------------
          | CLIENT
          |--------------------------------------------------------------------------
          */}

          <article className="admin-invoice-detail-card">
            <header>
              <span>
                👤
              </span>

              <div>
                <small>
                  Propriétaire
                </small>

                <h3>
                  Client
                </h3>
              </div>
            </header>

            <div className="admin-invoice-detail-client">
              <div className="admin-invoice-detail-client__avatar">
                {String(
                  invoice.client_name ||
                    "CL",
                )
                  .split(/\s+/)
                  .slice(
                    0,
                    2,
                  )
                  .map(
                    (item) =>
                      item.charAt(
                        0,
                      ),
                  )
                  .join("")
                  .toUpperCase()}
              </div>

              <div>
                <strong>
                  {invoice.client_name ||
                    "Client"}
                </strong>

                <span>
                  {invoice.client_email ||
                    "—"}
                </span>
              </div>

              <span
                className={`admin-invoice-detail-account-status ${
                  invoice.client_is_active
                    ? "admin-invoice-detail-account-status--active"
                    : "admin-invoice-detail-account-status--inactive"
                }`}
              >
                {invoice.client_is_active
                  ? "● Actif"
                  : "● Inactif"}
              </span>
            </div>

            <div className="admin-invoice-detail-fields admin-invoice-detail-fields--compact">
              <div>
                <span>
                  Rôle
                </span>

                <strong>
                  {invoice.client_role ||
                    "CLIENT"}
                </strong>
              </div>

              <div>
                <span>
                  Connexion
                </span>

                <strong>
                  {invoice.client_auth_provider ||
                    "—"}
                </strong>
              </div>
            </div>
          </article>

          {/*
          |--------------------------------------------------------------------------
          | ORGANIZATION
          |--------------------------------------------------------------------------
          */}

          <article className="admin-invoice-detail-card">
            <header>
              <span>
                🏢
              </span>

              <div>
                <small>
                  Organisation
                </small>

                <h3>
                  Client entreprise
                </h3>
              </div>
            </header>

            <div className="admin-invoice-detail-organization">
              <div>
                <span>
                  Organisation
                </span>

                <strong>
                  {invoice.organization_name ||
                    "—"}
                </strong>
              </div>

              <div>
                <span>
                  Pays
                </span>

                <strong>
                  {invoice.organization_country ||
                    "—"}
                </strong>
              </div>

              <div>
                <span>
                  Identifiant fiscal
                </span>

                <strong>
                  {invoice.organization_tax_identifier ||
                    "Non renseigné"}
                </strong>
              </div>
            </div>
          </article>

          {/*
          |--------------------------------------------------------------------------
          | AMOUNTS
          |--------------------------------------------------------------------------
          */}

          <article className="admin-invoice-detail-card">
            <header>
              <span>
                💰
              </span>

              <div>
                <small>
                  Montants
                </small>

                <h3>
                  Synthèse financière
                </h3>
              </div>
            </header>

            <div className="admin-invoice-detail-amounts">
              <div>
                <span>
                  HT
                </span>

                <strong>
                  {formatMoney(
                    invoice.total_ht,
                    invoice.currency,
                  )}
                </strong>
              </div>

              <div>
                <span>
                  TVA
                </span>

                <strong>
                  {formatMoney(
                    invoice.total_tva,
                    invoice.currency,
                  )}
                </strong>
              </div>

              <div className="admin-invoice-detail-amounts__total">
                <span>
                  TTC
                </span>

                <strong>
                  {formatMoney(
                    invoice.total_ttc ??
                      invoice.total_amount,
                    invoice.currency,
                  )}
                </strong>
              </div>
            </div>
          </article>
        </div>

        {/*
        |--------------------------------------------------------------------------
        | VALIDATION ERRORS
        |--------------------------------------------------------------------------
        */}

        {invoice.validation_errors && (
          <article className="admin-invoice-detail-expandable">
            <button
              type="button"
              className="admin-invoice-detail-expandable__header"
              onClick={() =>
                setShowValidation(
                  (
                    current,
                  ) =>
                    !current,
                )
              }
            >
              <div>
                <span>
                  🧪
                </span>

                <div>
                  <small>
                    Validation
                  </small>

                  <h3>
                    Erreurs de validation
                  </h3>
                </div>
              </div>

              <span>
                {showValidation
                  ? "−"
                  : "+"}
              </span>
            </button>

            {showValidation && (
              <div className="admin-invoice-detail-expandable__body">
                <pre>
                  {renderJson(
                    invoice.validation_errors,
                  )}
                </pre>
              </div>
            )}
          </article>
        )}

        {/*
        |--------------------------------------------------------------------------
        | WORKFLOW
        |--------------------------------------------------------------------------
        */}

        <article className="admin-invoice-detail-card admin-invoice-detail-card--full">
          <header>
            <span>
              🛰️
            </span>

            <div>
              <small>
                Workflow
              </small>

              <h3>
                Suivi du traitement
              </h3>
            </div>
          </header>

          <div className="admin-invoice-detail-pipeline">
            {[
              "IMPORT",
              "EXTRACTION",
              "VALIDATION",
              "TEIF",
              "SIGNATURE",
              "TTN",
            ].map(
              (
                stage,
                index,
                all,
              ) => {
                const currentStage =
                  normalize(
                    invoice.current_stage,
                  );

                const currentIndex =
                  all.indexOf(
                    currentStage,
                  );

                const isDone =
                  currentIndex >
                  index;

                const isCurrent =
                  currentStage ===
                  stage;

                return (
                  <div
                    key={
                      stage
                    }
                    className={`admin-invoice-detail-pipeline__step${
                      isDone
                        ? " admin-invoice-detail-pipeline__step--done"
                        : ""
                    }${
                      isCurrent
                        ? " admin-invoice-detail-pipeline__step--current"
                        : ""
                    }`}
                  >
                    <span>
                      {isDone
                        ? "✓"
                        : index +
                          1}
                    </span>

                    <strong>
                      {getStageLabel(
                        stage,
                      )}
                    </strong>
                  </div>
                );
              },
            )}
          </div>
        </article>

        {/*
        |--------------------------------------------------------------------------
        | TIMELINE
        |--------------------------------------------------------------------------
        */}

        <article className="admin-invoice-detail-card admin-invoice-detail-card--full">
          <header>
            <span>
              🕒
            </span>

            <div>
              <small>
                Historique disponible
              </small>

              <h3>
                Activité de la facture
              </h3>
            </div>
          </header>

          <div className="admin-invoice-detail-timeline">
            {timeline.length >
            0 ? (
              timeline.map(
                (
                  item,
                  index,
                ) => (
                  <div
                    key={`${item.key}-${index}`}
                    className={`admin-invoice-detail-timeline__item admin-invoice-detail-timeline__item--${item.state || "current"}`}
                  >
                    <span className="admin-invoice-detail-timeline__dot" />

                    <div>
                      <strong>
                        {
                          item.title
                        }
                      </strong>

                      <p>
                        {
                          item.description
                        }
                      </p>

                      <small>
                        {formatDateTime(
                          item.date,
                        )}
                      </small>
                    </div>
                  </div>
                ),
              )
            ) : (
              <p className="admin-invoice-detail-muted">
                Aucun historique disponible.
              </p>
            )}
          </div>
        </article>

        {/*
        |--------------------------------------------------------------------------
        | TECHNICAL INFORMATION
        |--------------------------------------------------------------------------
        */}

        <article className="admin-invoice-detail-expandable">
          <button
            type="button"
            className="admin-invoice-detail-expandable__header"
            onClick={() =>
              setShowTechnical(
                (
                  current,
                ) =>
                  !current,
              )
            }
          >
            <div>
              <span>
                🧩
              </span>

              <div>
                <small>
                  Technique
                </small>

                <h3>
                  Références et données techniques
                </h3>
              </div>
            </div>

            <span>
              {showTechnical
                ? "−"
                : "+"}
            </span>
          </button>

          {showTechnical && (
            <div className="admin-invoice-detail-technical">
              <div>
                <span>
                  Invoice ID
                </span>

                <code>
                  {
                    invoice.id
                  }
                </code>
              </div>

              <div>
                <span>
                  Organization ID
                </span>

                <code>
                  {invoice.organization_id ||
                    "—"}
                </code>
              </div>

              <div>
                <span>
                  Client ID
                </span>

                <code>
                  {invoice.client_id ||
                    "—"}
                </code>
              </div>

              <div>
                <span>
                  TTN Reference
                </span>

                <code>
                  {invoice.ttn_reference ||
                    "—"}
                </code>
              </div>

              <div>
                <span>
                  Transaction
                </span>

                <code>
                  {invoice.transaction_id ||
                    "—"}
                </code>
              </div>

              <div>
                <span>
                  Création
                </span>

                <code>
                  {formatDateTime(
                    invoice.created_at,
                  )}
                </code>
              </div>

              <div>
                <span>
                  Dernière modification
                </span>

                <code>
                  {formatDateTime(
                    invoice.updated_at,
                  )}
                </code>
              </div>
            </div>
          )}
        </article>

        {/*
        |--------------------------------------------------------------------------
        | FOOTER ACTIONS
        |--------------------------------------------------------------------------
        */}

        <div className="admin-invoice-detail-footer">
          <Link
            to="/admin/errors"
            className="admin-invoice-detail-footer__secondary"
          >
            ← Retour aux anomalies
          </Link>

          <Link
            to="/admin/invoices"
            className="admin-invoice-detail-footer__primary"
          >
            Toutes les factures
            <span>
              →
            </span>
          </Link>
        </div>
      </section>
    </AdminShell>
  );
}

export default AdminInvoiceDetailsPage;