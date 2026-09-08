import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useParams,
} from "react-router-dom";

import Logo from "../../components/navigation/Logo/Logo";

import "./styles/QrVerificationResult.css";

/*
|--------------------------------------------------------------------------
| API
|--------------------------------------------------------------------------
*/

const API_BASE_URL = String(
  import.meta.env.VITE_API_URL ||
    `http://${window.location.hostname}:3000`,
).replace(/\/+$/, "");

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return date.toLocaleDateString(
    "fr-FR",
  );
}

function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return date.toLocaleString(
    "fr-FR",
  );
}

function formatMoney(
  value,
  currency = "TND",
) {
  const number =
    Number(value);

  if (
    Number.isNaN(number)
  ) {
    return value || "—";
  }

  const formatted =
    new Intl.NumberFormat(
      "fr-FR",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 3,
      },
    ).format(number);

  return `${formatted} ${currency || ""}`.trim();
}

function getFirstValue(
  source,
  keys,
  fallback = null,
) {
  if (!source) {
    return fallback;
  }

  for (
    const key
    of keys
  ) {
    const value =
      source[key];

    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      return value;
    }
  }

  return fallback;
}

/*
|--------------------------------------------------------------------------
| NORMALIZE API RESPONSE
|--------------------------------------------------------------------------
*/

function normalizeVerificationResponse(
  result,
) {
  const source =
    result?.invoice ||
    result?.data?.invoice ||
    result?.data ||
    result ||
    {};

  return {
    id:
      getFirstValue(
        source,
        [
          "id",
          "invoice_id",
        ],
      ),

    invoice_number:
      getFirstValue(
        source,
        [
          "invoice_number",
          "number",
          "invoiceNumber",
          "numero_facture",
        ],
        "—",
      ),

    invoice_date:
      getFirstValue(
        source,
        [
          "invoice_date",
          "date",
          "invoiceDate",
          "date_facture",
        ],
      ),

    currency:
      getFirstValue(
        source,
        [
          "currency",
          "invoice_currency",
          "devise",
        ],
        "TND",
      ),

    supplier:
      getFirstValue(
        source,
        [
          "supplier",
          "supplier_name",
          "supplier_vat_number",
          "supplier_tax_identifier",
          "fournisseur",
        ],
        "—",
      ),

    customer:
      getFirstValue(
        source,
        [
          "customer",
          "customer_name",
          "customer_code",
          "customer_identifier",
          "client",
        ],
        "—",
      ),

    total_ht:
      getFirstValue(
        source,
        [
          "total_ht",
          "subtotal",
          "taxable_amount",
          "totalHt",
        ],
        0,
      ),

    total_tva:
      getFirstValue(
        source,
        [
          "total_tva",
          "vat_amount",
          "tva",
          "totalTva",
        ],
        0,
      ),

    total_ttc:
      getFirstValue(
        source,
        [
          "total_ttc",
          "total_amount",
          "total",
          "totalTtc",
        ],
        0,
      ),

    status:
      getFirstValue(
        source,
        [
          "status",
          "invoice_status",
          "statut",
        ],
        "—",
      ),

    stage:
      getFirstValue(
        source,
        [
          "stage",
          "workflow_stage",
          "etape",
        ],
        "—",
      ),

    ttn_reference:
      getFirstValue(
        source,
        [
          "ttn_reference",
          "ttn_ref",
          "TTNReference",
          "reference_ttn",
        ],
        "—",
      ),

    ttn_transaction:
      getFirstValue(
        source,
        [
          "ttn_transaction",
          "ttn_transaction_id",
          "transaction_id",
          "transaction",
        ],
        "—",
      ),

    verification_created_at:
      getFirstValue(
        source,
        [
          "verification_created_at",
          "verification_created",
          "created_at",
          "createdAt",
        ],
      ),

    updated_at:
      getFirstValue(
        source,
        [
          "updated_at",
          "updatedAt",
          "last_updated_at",
        ],
      ),
  };
}

/*
|--------------------------------------------------------------------------
| STATUS
|--------------------------------------------------------------------------
*/

function getStatusLabel(
  status,
) {
  const value =
    String(
      status || "",
    )
      .trim()
      .toUpperCase();

  const labels = {
    ACCEPTED:
      "ACCEPTÉE",

    REJECTED:
      "REJETÉE",

    ERROR:
      "ERREUR",

    PENDING:
      "EN ATTENTE",

    PENDING_RETRY:
      "EN ATTENTE",

    PROCESSING:
      "EN COURS",

    SUBMITTED:
      "ENVOYÉE",

    SIGNED:
      "SIGNÉE",

    VALIDATED:
      "VALIDÉE",
  };

  return (
    labels[value] ||
    value ||
    "—"
  );
}

/*
|--------------------------------------------------------------------------
| PAGE
|--------------------------------------------------------------------------
*/

function QrVerificationResult() {
  const {
    token,
  } = useParams();

  const [
    invoice,
    setInvoice,
  ] =
    useState(null);

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

  /*
  |--------------------------------------------------------------------------
  | LOAD PUBLIC VERIFICATION
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    let cancelled =
      false;

    async function loadVerification() {
      if (!token) {
        setError(
          "Le lien de vérification est invalide.",
        );

        setLoading(
          false,
        );

        return;
      }

      setLoading(true);
      setError("");

      try {
        const response =
          await fetch(
            `${API_BASE_URL}/api/invoices/public/verify/${encodeURIComponent(
              token,
            )}`,
            {
              method:
                "GET",

              headers: {
                Accept:
                  "application/json",
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
              result?.error ||
              `Erreur HTTP ${response.status}`,
          );
        }

        const normalizedInvoice =
          normalizeVerificationResponse(
            result,
          );

        if (
          !normalizedInvoice.invoice_number ||
          normalizedInvoice.invoice_number ===
            "—"
        ) {
          throw new Error(
            "Aucune facture n’est associée à ce QR code.",
          );
        }

        if (!cancelled) {
          setInvoice(
            normalizedInvoice,
          );
        }
      } catch (
        loadError
      ) {
        console.error(
          "QR verification:",
          loadError,
        );

        if (!cancelled) {
          setError(
            loadError?.message ||
              "Impossible de vérifier cette facture.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(
            false,
          );
        }
      }
    }

    loadVerification();

    return () => {
      cancelled =
        true;
    };
  }, [
    token,
  ]);

  /*
  |--------------------------------------------------------------------------
  | COMPUTED
  |--------------------------------------------------------------------------
  */

  const normalizedStatus =
    useMemo(
      () =>
        String(
          invoice?.status ||
            "",
        )
          .trim()
          .toUpperCase(),
      [
        invoice?.status,
      ],
    );

  const isAccepted =
    normalizedStatus ===
    "ACCEPTED";

  /*
  |--------------------------------------------------------------------------
  | LOADING
  |--------------------------------------------------------------------------
  */

  if (loading) {
    return (
      <section className="qr-result-page">
        <div className="qr-result-shell">
          <header className="qr-result-brand">
            <div className="qr-result-brand__logo">
              <Logo />
            </div>

            <div className="qr-result-brand__content">
              <strong>
                FlowBill
              </strong>

              <span>
                Facturation électronique
              </span>
            </div>
          </header>

          <section className="qr-card">
            <div
              style={{
                minHeight:
                  "220px",

                display:
                  "grid",

                placeItems:
                  "center",

                textAlign:
                  "center",
              }}
            >
              <div>
                <div
                  style={{
                    width:
                      "42px",

                    height:
                      "42px",

                    margin:
                      "0 auto 18px",

                    border:
                      "4px solid rgba(255,255,255,0.15)",

                    borderTopColor:
                      "#22c55e",

                    borderRadius:
                      "50%",

                    animation:
                      "spin 0.8s linear infinite",
                  }}
                />

                <strong>
                  Vérification de la facture...
                </strong>

                <p
                  style={{
                    margin:
                      "8px 0 0",

                    color:
                      "#94a3b8",
                  }}
                >
                  Nous vérifions les informations associées à ce QR code.
                </p>
              </div>
            </div>
          </section>
        </div>
      </section>
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
      <section className="qr-result-page">
        <div className="qr-result-shell">
          <header className="qr-result-brand">
            <div className="qr-result-brand__logo">
              <Logo />
            </div>

            <div className="qr-result-brand__content">
              <strong>
                FlowBill
              </strong>

              <span>
                Facturation électronique
              </span>
            </div>
          </header>

          <section className="qr-result-hero">
            <div
              className="qr-result-hero__icon"
              style={{
                background:
                  "#fee2e2",

                color:
                  "#dc2626",
              }}
            >
              !
            </div>

            <div className="qr-result-hero__text">
              <small
                style={{
                  color:
                    "#f87171",
                }}
              >
                VÉRIFICATION IMPOSSIBLE
              </small>

              <h1>
                Facture introuvable
              </h1>

              <p>
                {error ||
                  "Ce QR code ne correspond à aucune facture disponible."}
              </p>
            </div>
          </section>
        </div>
      </section>
    );
  }

  /*
  |--------------------------------------------------------------------------
  | SUCCESS
  |--------------------------------------------------------------------------
  */

  return (
    <section className="qr-result-page">
      <div className="qr-result-shell">
        {/*
        |--------------------------------------------------------------------------
        | BRAND
        |--------------------------------------------------------------------------
        */}

        <header className="qr-result-brand">
          <div className="qr-result-brand__logo">
            <Logo />
          </div>

          <div className="qr-result-brand__content">
            <strong>
              FlowBill
            </strong>

            <span>
              Facturation électronique
            </span>
          </div>
        </header>

        {/*
        |--------------------------------------------------------------------------
        | HERO
        |--------------------------------------------------------------------------
        */}

        <section className="qr-result-hero">
          <div
            className="qr-result-hero__icon"
            style={
              isAccepted
                ? undefined
                : {
                    background:
                      "#fef3c7",

                    color:
                      "#d97706",
                  }
            }
          >
            {isAccepted
              ? "✓"
              : "!"}
          </div>

          <div className="qr-result-hero__text">
            <small>
              {isAccepted
                ? "VÉRIFICATION RÉUSSIE"
                : "ÉTAT DE LA FACTURE"}
            </small>

            <h1>
              {isAccepted
                ? "Facture authentifiée"
                : "Facture vérifiée"}
            </h1>

            <p>
              {isAccepted
                ? "Cette facture est enregistrée comme acceptée et validée."
                : "Les informations de cette facture ont été retrouvées dans la plateforme FlowBill."}
            </p>
          </div>
        </section>

        {/*
        |--------------------------------------------------------------------------
        | INVOICE
        |--------------------------------------------------------------------------
        */}

        <section className="qr-card">
          <div className="qr-card__header">
            <div>
              <span>
                Facture
              </span>

              <h2>
                {invoice.invoice_number}
              </h2>
            </div>

            <span className="qr-status-badge">
              {getStatusLabel(
                invoice.status,
              )}
            </span>
          </div>

          <div className="qr-info-grid">
            <div className="qr-info-item">
              <span>
                Date de facture
              </span>

              <strong>
                {formatDate(
                  invoice.invoice_date,
                )}
              </strong>
            </div>

            <div className="qr-info-item">
              <span>
                Devise
              </span>

              <strong>
                {invoice.currency ||
                  "—"}
              </strong>
            </div>

            <div className="qr-info-item">
              <span>
                Fournisseur
              </span>

              <strong>
                {invoice.supplier ||
                  "—"}
              </strong>
            </div>

            <div className="qr-info-item">
              <span>
                Client
              </span>

              <strong>
                {invoice.customer ||
                  "—"}
              </strong>
            </div>
          </div>
        </section>

        {/*
        |--------------------------------------------------------------------------
        | AMOUNTS
        |--------------------------------------------------------------------------
        */}

        <section className="qr-card">
          <h3 className="qr-section-title">
            Montants
          </h3>

          <div className="qr-amounts">
            <div className="qr-amount-box">
              <span>
                Total HT
              </span>

              <strong>
                {formatMoney(
                  invoice.total_ht,
                  invoice.currency,
                )}
              </strong>
            </div>

            <div className="qr-amount-box">
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

            <div className="qr-amount-box qr-amount-box--success">
              <span>
                Total TTC
              </span>

              <strong>
                {formatMoney(
                  invoice.total_ttc,
                  invoice.currency,
                )}
              </strong>
            </div>
          </div>
        </section>

        {/*
        |--------------------------------------------------------------------------
        | TRACEABILITY
        |--------------------------------------------------------------------------
        */}

        <section className="qr-card">
          <h3 className="qr-section-title">
            Traçabilité
          </h3>

          <div className="qr-trace-list">
            <div className="qr-trace-item">
              <span>
                Statut
              </span>

              <strong>
                {getStatusLabel(
                  invoice.status,
                )}
              </strong>
            </div>

            <div className="qr-trace-item">
              <span>
                Étape
              </span>

              <strong>
                {invoice.stage ||
                  "—"}
              </strong>
            </div>

            <div className="qr-trace-item">
              <span>
                Référence TTN
              </span>

              <strong>
                {invoice.ttn_reference ||
                  "—"}
              </strong>
            </div>

            <div className="qr-trace-item">
              <span>
                Transaction
              </span>

              <strong>
                {invoice.ttn_transaction ||
                  "—"}
              </strong>
            </div>

            <div className="qr-trace-item">
              <span>
                Vérification créée
              </span>

              <strong>
                {formatDateTime(
                  invoice.verification_created_at,
                )}
              </strong>
            </div>

            <div className="qr-trace-item">
              <span>
                Dernière mise à jour
              </span>

              <strong>
                {formatDateTime(
                  invoice.updated_at,
                )}
              </strong>
            </div>
          </div>
        </section>

        {/*
        |--------------------------------------------------------------------------
        | VERIFICATION NOTICE
        |--------------------------------------------------------------------------
        */}

        <section className="qr-verification-note">
          <div className="qr-verification-note__icon">
            ✓
          </div>

          <div>
            <strong>
              Vérification numérique réussie
            </strong>

            <p>
              Les informations affichées proviennent
              directement de la plateforme FlowBill et
              correspondent à la facture associée à ce QR code.
            </p>
          </div>
        </section>
      </div>
    </section>
  );
}

export default QrVerificationResult;