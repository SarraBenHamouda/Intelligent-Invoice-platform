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

import AuthenticatedHeader from "../../../../components/navigation/AuthenticatedHeader/AuthenticatedHeader";
import AuthenticatedFooter from "../../../../components/navigation/AuthenticatedFooter/AuthenticatedFooter";

import {
  deleteInvoice,
  getInvoices,
} from "../../../../services/invoiceService";

import "./InvoiceListPage.css";


const PROCESSING_STATUSES = new Set([
  "UPLOADED",
  "PROCESSING",
  "VALIDATED",
  "SIGNING",
  "SIGNED",
  "SUBMITTED",
]);

const ATTENTION_STATUSES = new Set([
  "REJECTED",
  "PENDING_RETRY",
  "ERROR",
  "PENDING_REVIEW",
]);


const STATUS_CONFIGURATION = {
  UPLOADED: {
    label: "Reçue",
    tone: "info",
    description: "Facture reçue",
    progress: 12,
  },

  PROCESSING: {
    label: "En cours",
    tone: "warning",
    description: "Traitement en cours",
    progress: 32,
  },

  PENDING_REVIEW: {
    label: "À vérifier",
    tone: "warning",
    description: "Une vérification est nécessaire",
    progress: 42,
  },

  VALIDATED: {
    label: "Vérifiée",
    tone: "blue",
    description: "Vérification terminée",
    progress: 55,
  },

  SIGNING: {
    label: "En préparation",
    tone: "purple",
    description: "Préparation en cours",
    progress: 68,
  },

  SIGNED: {
    label: "Prête",
    tone: "purple",
    description: "Prête à être envoyée",
    progress: 78,
  },

  SUBMITTED: {
    label: "Envoyée",
    tone: "blue",
    description: "Réponse en attente",
    progress: 88,
  },

  ACCEPTED: {
    label: "Acceptée",
    tone: "success",
    description: "Traitement terminé",
    progress: 100,
  },

  REJECTED: {
    label: "Refusée",
    tone: "danger",
    description: "Une correction est nécessaire",
    progress: 100,
  },

  PENDING_RETRY: {
    label: "À relancer",
    tone: "warning",
    description: "Nouvelle tentative nécessaire",
    progress: 88,
  },

  ERROR: {
    label: "À corriger",
    tone: "danger",
    description: "Un problème doit être corrigé",
    progress: 100,
  },
};


function normalizeStatus(status) {
  return String(
    status || "UPLOADED",
  )
    .trim()
    .toUpperCase();
}


function getStatusConfiguration(status) {
  const normalizedStatus =
    normalizeStatus(
      status,
    );

  return (
    STATUS_CONFIGURATION[
      normalizedStatus
    ] || {
      label: "En attente",
      tone: "neutral",
      description:
        "Informations en attente",
      progress: 0,
    }
  );
}


function parseJsonField(value) {
  if (!value) {
    return {};
  }

  if (
    typeof value ===
    "object"
  ) {
    return value;
  }

  try {
    return JSON.parse(
      value,
    );
  } catch {
    return {};
  }
}


function getExtraction(invoice) {
  return parseJsonField(
    invoice?.extracted_data,
  );
}


function getInvoiceNumber(invoice) {
  const extraction =
    getExtraction(
      invoice,
    );

  const extractedNumber =
    extraction?.facture?.numero ||
    extraction?.document?.numero;

  if (
    extractedNumber &&
    String(
      extractedNumber,
    ).trim()
  ) {
    return String(
      extractedNumber,
    ).trim();
  }

  const databaseNumber =
    invoice?.invoice_number;

  if (
    databaseNumber &&
    !String(
      databaseNumber,
    )
      .toUpperCase()
      .startsWith(
        "PENDING-",
      )
  ) {
    return String(
      databaseNumber,
    ).trim();
  }

  return "En attente";
}


function getInvoiceDate(invoice) {
  const extraction =
    getExtraction(
      invoice,
    );

  return (
    extraction?.facture
      ?.date_facture ||
    extraction?.document?.date ||
    invoice?.invoice_date ||
    invoice?.created_at
  );
}


function getSupplierIdentifier(
  invoice,
) {
  const extraction =
    getExtraction(
      invoice,
    );

  return (
    invoice?.supplier_identifier ||
    extraction?.fournisseur
      ?.identifiant ||
    extraction?.fournisseur
      ?.matricule_fiscal_ou_tva ||
    "Non renseigné"
  );
}


function getTotalTtc(invoice) {
  const extraction =
    getExtraction(
      invoice,
    );

  return (
    invoice?.total_ttc ??
    extraction?.totaux
      ?.total_ttc ??
    invoice?.total_amount
  );
}


function getCurrency(invoice) {
  const extraction =
    getExtraction(
      invoice,
    );

  return (
    invoice?.currency ||
    extraction?.document
      ?.devise ||
    ""
  );
}


function formatDate(value) {
  if (!value) {
    return "Non disponible";
  }

  if (
    /^\d{2}\/\d{2}\/\d{4}$/.test(
      String(value),
    )
  ) {
    return String(value);
  }

  const parsedDate =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      parsedDate.getTime(),
    )
  ) {
    return String(value);
  }

  return parsedDate
    .toLocaleDateString(
      "fr-FR",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      },
    );
}


function formatDateTime(value) {
  if (!value) {
    return "En attente";
  }

  const parsedDate =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      parsedDate.getTime(),
    )
  ) {
    return String(value);
  }

  return parsedDate
    .toLocaleString(
      "fr-FR",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      },
    );
}


function formatAmount(
  amount,
  currency,
) {
  if (
    amount === null ||
    amount === undefined ||
    amount === ""
  ) {
    return "En attente";
  }

  const numericAmount =
    Number(
      String(amount)
        .replace(
          /[^0-9,.-]/g,
          "",
        )
        .replace(
          ",",
          ".",
        ),
    );

  if (
    !Number.isFinite(
      numericAmount,
    )
  ) {
    return `${amount} ${
      currency || ""
    }`.trim();
  }

  if (!currency) {
    return new Intl.NumberFormat(
      "fr-FR",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
    ).format(
      numericAmount,
    );
  }

  try {
    return new Intl.NumberFormat(
      "fr-FR",
      {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
    ).format(
      numericAmount,
    );
  } catch {
    return `${numericAmount.toFixed(
      2,
    )} ${currency}`;
  }
}


function matchesSelectedStatus(
  status,
  selectedStatus,
) {
  if (
    selectedStatus ===
    "ALL"
  ) {
    return true;
  }

  if (
    selectedStatus ===
    "PROCESSING_GROUP"
  ) {
    return PROCESSING_STATUSES.has(
      status,
    );
  }

  if (
    selectedStatus ===
    "ATTENTION_GROUP"
  ) {
    return ATTENTION_STATUSES.has(
      status,
    );
  }

  return (
    status ===
    selectedStatus
  );
}


function InvoiceListPage() {
  const listPanelRef =
    useRef(null);

  const [
    invoices,
    setInvoices,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    deletingInvoiceId,
    setDeletingInvoiceId,
  ] = useState(null);

  const [
    error,
    setError,
  ] = useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");

  const [
    searchTerm,
    setSearchTerm,
  ] = useState("");

  const [
    selectedStatus,
    setSelectedStatus,
  ] = useState("ALL");

  const [
    lastUpdatedAt,
    setLastUpdatedAt,
  ] = useState(null);


  const loadInvoices =
    useCallback(
      async ({
        silent = false,
      } = {}) => {
        try {
          if (silent) {
            setRefreshing(
              true,
            );
          } else {
            setLoading(
              true,
            );
          }

          setError("");

          const result =
            await getInvoices();

          const nextInvoices =
            Array.isArray(
              result?.invoices,
            )
              ? result.invoices
              : [];

          setInvoices(
            nextInvoices,
          );

          setLastUpdatedAt(
            new Date(),
          );
        } catch (
          loadError
        ) {
          console.error(
            "getInvoices error:",
            loadError,
          );

          setError(
            loadError?.message ||
              "Impossible de charger vos factures.",
          );
        } finally {
          setLoading(false);
          setRefreshing(
            false,
          );
        }
      },
      [],
    );


  useEffect(() => {
    loadInvoices();

    const intervalId =
      window.setInterval(
        () => {
          loadInvoices({
            silent: true,
          });
        },
        5000,
      );

    return () => {
      window.clearInterval(
        intervalId,
      );
    };
  }, [
    loadInvoices,
  ]);


  function handleStatisticFilter(
    filterValue,
  ) {
    setSelectedStatus(
      filterValue,
    );

    setSearchTerm("");

    window.requestAnimationFrame(
      () => {
        listPanelRef.current
          ?.scrollIntoView({
            behavior:
              "smooth",
            block:
              "start",
          });
      },
    );
  }


  async function handleDeleteInvoice(
    invoice,
  ) {
    if (!invoice?.id) {
      return;
    }

    const invoiceLabel =
      getInvoiceNumber(
        invoice,
      );

    const confirmed =
      window.confirm(
        `Supprimer la facture ${invoiceLabel} ?\n\n` +
          "Cette action est définitive.",
      );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingInvoiceId(
        invoice.id,
      );

      setError("");
      setSuccessMessage("");

      const result =
        await deleteInvoice(
          invoice.id,
        );

      setInvoices(
        (
          currentInvoices,
        ) =>
          currentInvoices.filter(
            (
              currentInvoice,
            ) =>
              currentInvoice.id !==
              invoice.id,
          ),
      );

      setSuccessMessage(
        result?.message ||
          `La facture ${invoiceLabel} a été supprimée.`,
      );

      setLastUpdatedAt(
        new Date(),
      );
    } catch (
      deleteError
    ) {
      console.error(
        "deleteInvoice error:",
        deleteError,
      );

      setError(
        deleteError?.message ||
          "Impossible de supprimer cette facture.",
      );
    } finally {
      setDeletingInvoiceId(
        null,
      );
    }
  }


  const statistics =
    useMemo(
      () => {
        const counters = {
          total:
            invoices.length,

          accepted:
            0,

          processing:
            0,

          attention:
            0,
        };

        invoices.forEach(
          (invoice) => {
            const status =
              normalizeStatus(
                invoice.status,
              );

            if (
              status ===
              "ACCEPTED"
            ) {
              counters.accepted +=
                1;
            }

            if (
              PROCESSING_STATUSES.has(
                status,
              )
            ) {
              counters.processing +=
                1;
            }

            if (
              ATTENTION_STATUSES.has(
                status,
              )
            ) {
              counters.attention +=
                1;
            }
          },
        );

        return counters;
      },
      [
        invoices,
      ],
    );


  const acceptedRate =
    statistics.total > 0
      ? Math.round(
          (
            statistics.accepted /
            statistics.total
          ) * 100,
        )
      : 0;


  const latestInvoice =
    invoices.length > 0
      ? [...invoices].sort(
          (a, b) =>
            new Date(
              b.created_at || 0,
            ) -
            new Date(
              a.created_at || 0,
            ),
        )[0]
      : null;


  const attentionInvoice =
    invoices.find(
      (invoice) =>
        ATTENTION_STATUSES.has(
          normalizeStatus(
            invoice.status,
          ),
        ),
    );


  const filteredInvoices =
    useMemo(
      () => {
        const normalizedSearch =
          searchTerm
            .trim()
            .toLowerCase();

        return invoices.filter(
          (invoice) => {
            const status =
              normalizeStatus(
                invoice.status,
              );

            const matchesStatus =
              matchesSelectedStatus(
                status,
                selectedStatus,
              );

            const extraction =
              getExtraction(
                invoice,
              );

            const searchableValues =
              [
                getInvoiceNumber(
                  invoice,
                ),

                invoice.invoice_number,

                extraction
                  ?.document
                  ?.numero,

                extraction
                  ?.facture
                  ?.numero,

                invoice.original_filename,

                getSupplierIdentifier(
                  invoice,
                ),

                invoice.customer_identifier,

                invoice.ttn_reference,

                invoice.last_error_message,

                invoice.rejection_reason,
              ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            const matchesSearch =
              !normalizedSearch ||
              searchableValues.includes(
                normalizedSearch,
              );

            return (
              matchesStatus &&
              matchesSearch
            );
          },
        );
      },
      [
        invoices,
        searchTerm,
        selectedStatus,
      ],
    );


  return (
    <div className="invoice-list-page">

      <AuthenticatedHeader />


      <main className="invoice-list-main">

        {/* HERO */}

        <section className="invoice-list-hero">

          <div>
            <h1>
              Mes factures
            </h1>

            <p>
              Retrouvez toutes vos factures,
              consultez leur état et suivez
              facilement leur avancement.
            </p>
          </div>


          <button
            type="button"
            className="invoice-list-refresh-button"
            disabled={
              refreshing
            }
            onClick={() =>
              loadInvoices({
                silent: true,
              })
            }
          >
            <span
              className={
                refreshing
                  ? "is-spinning"
                  : ""
              }
              aria-hidden="true"
            >
              ↻
            </span>

            {refreshing
              ? "Mise à jour..."
              : "Actualiser"}
          </button>

        </section>


        {/* SUCCESS */}

        {successMessage && (
          <div className="invoice-list-success-message">

            <span>
              ✓
            </span>

            <div>
              <strong>
                Terminé
              </strong>

              <p>
                {
                  successMessage
                }
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setSuccessMessage(
                  "",
                )
              }
              aria-label="Fermer"
            >
              ×
            </button>

          </div>
        )}


        {/* STATISTICS */}

        <section
          className="invoice-list-statistics"
          aria-label="Résumé des factures"
        >

          <button
            type="button"
            className={`invoice-list-stat-card invoice-list-stat-card--total ${
              selectedStatus ===
              "ALL"
                ? "is-active"
                : ""
            }`}
            onClick={() =>
              handleStatisticFilter(
                "ALL",
              )
            }
          >
            <span>
              Toutes mes factures
            </span>

            <strong>
              {statistics.total}
            </strong>

            <small>
              Vue d’ensemble
            </small>
          </button>


          <button
            type="button"
            className={`invoice-list-stat-card invoice-list-stat-card--accepted ${
              selectedStatus ===
              "ACCEPTED"
                ? "is-active"
                : ""
            }`}
            onClick={() =>
              handleStatisticFilter(
                "ACCEPTED",
              )
            }
          >
            <span>
              Acceptées
            </span>

            <strong>
              {statistics.accepted}
            </strong>

            <small>
              Tout est terminé
            </small>
          </button>


          <button
            type="button"
            className={`invoice-list-stat-card invoice-list-stat-card--processing ${
              selectedStatus ===
              "PROCESSING_GROUP"
                ? "is-active"
                : ""
            }`}
            onClick={() =>
              handleStatisticFilter(
                "PROCESSING_GROUP",
              )
            }
          >
            <span>
              En cours
            </span>

            <strong>
              {statistics.processing}
            </strong>

            <small>
              Traitement en cours
            </small>
          </button>


          <button
            type="button"
            className={`invoice-list-stat-card invoice-list-stat-card--attention ${
              selectedStatus ===
              "ATTENTION_GROUP"
                ? "is-active"
                : ""
            }`}
            onClick={() =>
              handleStatisticFilter(
                "ATTENTION_GROUP",
              )
            }
          >
            <span>
              À vérifier
            </span>

            <strong>
              {statistics.attention}
            </strong>

            <small>
              Votre attention est nécessaire
            </small>
          </button>

        </section>


        {/* QUICK OVERVIEW */}

        <section className="invoice-list-overview">

          <article className="invoice-list-overview-card invoice-list-overview-card--blue">

            <span className="invoice-list-overview-icon">
              ✓
            </span>

            <div>
              <small>
                Factures acceptées
              </small>

              <strong>
                {acceptedRate} %
              </strong>

              <p>
                de vos factures sont terminées.
              </p>
            </div>

          </article>


          <article className="invoice-list-overview-card invoice-list-overview-card--green">

            <span className="invoice-list-overview-icon">
              ↗
            </span>

            <div>
              <small>
                Dernière facture
              </small>

              <strong>
                {latestInvoice
                  ? getInvoiceNumber(
                      latestInvoice,
                    )
                  : "Aucune"}
              </strong>

              <p>
                {latestInvoice
                  ? `Ajoutée le ${formatDate(
                      latestInvoice.created_at,
                    )}`
                  : "Aucune facture récente."}
              </p>
            </div>

          </article>


          <article className="invoice-list-overview-card invoice-list-overview-card--orange">

            <span className="invoice-list-overview-icon">
              !
            </span>

            <div>
              <small>
                À surveiller
              </small>

              <strong>
                {statistics.attention}
              </strong>

              <p>
                {statistics.attention > 0
                  ? "facture(s) nécessitent votre attention."
                  : "Aucune action nécessaire."}
              </p>
            </div>

          </article>

        </section>


        {/* ATTENTION BANNER */}

        {attentionInvoice && (
          <section className="invoice-list-attention-banner">

            <div className="invoice-list-attention-banner-icon">
              !
            </div>

            <div>
              <span>
                À vérifier
              </span>

              <strong>
                Une facture nécessite votre attention
              </strong>

              <p>
                La facture{" "}
                {getInvoiceNumber(
                  attentionInvoice,
                )}{" "}
                a besoin d’une vérification.
              </p>
            </div>

            {attentionInvoice.id && (
              <Link
                to={`/client/invoices/${attentionInvoice.id}`}
              >
                Consulter
              </Link>
            )}

          </section>
        )}


        {/* LIST */}

        <section
          ref={
            listPanelRef
          }
          className="invoice-list-panel"
        >

          <header className="invoice-list-panel-header">

            <div>
              <h2>
                Vos factures
              </h2>

              <p>
                La liste se met à jour automatiquement.
              </p>
            </div>


            <div className="invoice-list-last-update">

              <span>
                Dernière mise à jour
              </span>

              <strong>
                {lastUpdatedAt
                  ? formatDateTime(
                      lastUpdatedAt,
                    )
                  : "En attente"}
              </strong>

            </div>

          </header>


          {/* SEARCH */}

          <div className="invoice-list-toolbar">

            <label className="invoice-list-search">

              <span
                aria-hidden="true"
              >
                ⌕
              </span>

              <input
                type="search"
                value={
                  searchTerm
                }
                placeholder="Rechercher une facture..."
                onChange={(
                  event,
                ) =>
                  setSearchTerm(
                    event.target
                      .value,
                  )
                }
              />

            </label>


            {selectedStatus !==
              "ALL" && (
              <button
                type="button"
                className="invoice-list-clear-filter"
                onClick={() =>
                  setSelectedStatus(
                    "ALL",
                  )
                }
              >
                Voir toutes les factures
              </button>
            )}

          </div>


          {/* ERROR */}

          {error && (
            <div
              className="invoice-list-error"
              role="alert"
            >

              <span>
                !
              </span>

              <div>

                <strong>
                  Impossible d’afficher vos factures
                </strong>

                <p>
                  {error}
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


          {/* CONTENT */}

          {loading ? (

            <div className="invoice-list-loading">

              <span
                className="invoice-list-loading-spinner"
                aria-hidden="true"
              />

              <strong>
                Chargement de vos factures...
              </strong>

              <p>
                Quelques secondes suffisent.
              </p>

            </div>

          ) : filteredInvoices.length ===
            0 ? (

            <div className="invoice-list-empty">

              <h3>
                {invoices.length ===
                0
                  ? "Vous n’avez pas encore de facture"
                  : "Aucune facture trouvée"}
              </h3>

              <p>
                {invoices.length ===
                0
                  ? "Vos prochaines factures apparaîtront ici."
                  : "Essayez une autre recherche ou affichez toutes vos factures."}
              </p>

            </div>

          ) : (

            <div className="invoice-list-table-wrapper">

              <table className="invoice-list-table">

                <thead>
                  <tr>
                    <th>Facture</th>
                    <th>Document</th>
                    <th>Date</th>
                    <th>Montant</th>
                    <th>État</th>
                    <th>Avancement</th>
                    <th>Information</th>
                    <th className="invoice-list-actions-heading">
                      Actions
                    </th>
                  </tr>
                </thead>


                <tbody>

                  {filteredInvoices.map(
                    (
                      invoice,
                    ) => {

                      const status =
                        normalizeStatus(
                          invoice.status,
                        );

                      const configuration =
                        getStatusConfiguration(
                          status,
                        );

                      const errorMessage =
                        invoice.last_error_message ||
                        invoice.rejection_reason ||
                        "";

                      const displayInvoiceNumber =
                        getInvoiceNumber(
                          invoice,
                        );

                      const invoiceDate =
                        getInvoiceDate(
                          invoice,
                        );

                      const supplierIdentifier =
                        getSupplierIdentifier(
                          invoice,
                        );

                      const currency =
                        getCurrency(
                          invoice,
                        );

                      const totalTtc =
                        getTotalTtc(
                          invoice,
                        );

                      const isDeleting =
                        deletingInvoiceId ===
                        invoice.id;


                      return (
                        <tr
                          key={
                            invoice.id
                          }
                        >

                          <td>
                            <div className="invoice-list-number-cell">

                              <strong>
                                {
                                  displayInvoiceNumber
                                }
                              </strong>

                            </div>
                          </td>


                          <td>
                            <div className="invoice-list-file-cell">

                              <span
                                className="invoice-list-file-type"
                                aria-hidden="true"
                              >
                                {String(
                                  invoice.source_type ||
                                    invoice.source ||
                                    "PDF",
                                )
                                  .slice(
                                    0,
                                    3,
                                  )
                                  .toUpperCase()}
                              </span>


                              <div>

                                <strong>
                                  {invoice.original_filename ||
                                    "Document"}
                                </strong>

                                <span>
                                  {
                                    supplierIdentifier
                                  }
                                </span>

                              </div>

                            </div>
                          </td>


                          <td>
                            <div className="invoice-list-date-cell">

                              <strong>
                                {formatDate(
                                  invoiceDate,
                                )}
                              </strong>

                            </div>
                          </td>


                          <td>
                            <strong className="invoice-list-amount">

                              {formatAmount(
                                totalTtc,
                                currency,
                              )}

                            </strong>
                          </td>


                          <td>
                            <span
                              className={`invoice-list-status invoice-list-status--${configuration.tone}`}
                            >

                              <span
                                className="invoice-list-status-dot"
                                aria-hidden="true"
                              />

                              {
                                configuration.label
                              }

                            </span>
                          </td>


                          <td>
                            <div className="invoice-list-progress">

                              <div>

                                <span
                                  style={{
                                    width: `${configuration.progress}%`,
                                  }}
                                />

                              </div>

                              <small>
                                {
                                  configuration.description
                                }
                              </small>

                            </div>
                          </td>


                          <td>

                            {errorMessage ? (

                              <span className="invoice-list-error-text">
                                {
                                  errorMessage
                                }
                              </span>

                            ) : status ===
                              "ACCEPTED" ? (

                              <span className="invoice-list-ttn-reference">
                                Traitement terminé
                              </span>

                            ) : (

                              <span className="invoice-list-muted-text">
                                Aucun problème signalé
                              </span>

                            )}

                          </td>


                          <td>
                            <div className="invoice-list-row-actions">

                              {invoice.id ? (

                                <Link
                                  to={`/client/invoices/${invoice.id}`}
                                  className="invoice-list-detail-link"
                                  aria-label={`Voir la facture ${displayInvoiceNumber}`}
                                  title="Voir la facture"
                                >
                                  →
                                </Link>

                              ) : (

                                <span>
                                  —
                                </span>

                              )}


                              <button
                                type="button"
                                className="invoice-list-delete-button"
                                disabled={
                                  !invoice.id ||
                                  isDeleting
                                }
                                onClick={() =>
                                  handleDeleteInvoice(
                                    invoice,
                                  )
                                }
                                aria-label={`Supprimer la facture ${displayInvoiceNumber}`}
                                title="Supprimer"
                              >
                                {isDeleting
                                  ? "…"
                                  : "×"}
                              </button>

                            </div>
                          </td>

                        </tr>
                      );
                    },
                  )}

                </tbody>

              </table>

            </div>

          )}


          {!loading &&
            filteredInvoices.length >
              0 && (

              <footer className="invoice-list-footer">

                <span>
                  {
                    filteredInvoices.length
                  }{" "}
                  facture
                  {filteredInvoices.length >
                  1
                    ? "s"
                    : ""}
                </span>

                <span>
                  Mise à jour automatique
                </span>

              </footer>

            )}

        </section>

      </main>


      <AuthenticatedFooter />

    </div>
  );
}


export default InvoiceListPage;