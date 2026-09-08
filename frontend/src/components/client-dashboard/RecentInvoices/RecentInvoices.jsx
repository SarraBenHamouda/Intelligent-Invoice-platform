import {
  Link,
} from 'react-router-dom';

import './RecentInvoices.css';

function RecentInvoices({
  invoices,
  onRetry,
  retryingInvoiceId,
  onDeleteDuplicates,
  deletingInvoiceId,
}) {
  return (
    <section className="recent-invoices">
      <header className="recent-invoices-header">
        <div>
          <span className="recent-invoices-eyebrow">
            Activité récente
          </span>

          <h2>
            Dernières factures
          </h2>
        </div>

        <Link
          to="/client/invoices"
          className="recent-invoices-view-all"
        >
          Voir tout
        </Link>
      </header>

      <div className="recent-invoices-table-wrapper">
        <table className="recent-invoices-table">
          <thead>
            <tr>
              <th>
                Facture
              </th>

              <th>
                Client
              </th>

              <th>
                Date
              </th>

              <th>
                Montant
              </th>

              <th>
                Source
              </th>

              <th>
                Statut
              </th>

              <th>
                Action
              </th>
            </tr>
          </thead>

          <tbody>
            {invoices.map(
              (invoice) => (
                <tr
                  key={invoice.id}
                >
                  <td>
                    <strong>
                      #
                      {invoice.number ||
                        '—'}
                    </strong>

                    {invoice.hasDuplicates && (
                      <small className="recent-invoice-duplicate-label">
                        {
                          invoice.duplicateCopies
                        }{' '}
                        doublon
                        {invoice.duplicateCopies >
                        1
                          ? 's'
                          : ''}
                      </small>
                    )}
                  </td>

                  <td>
                    {invoice.customer ||
                      'Non renseigné'}
                  </td>

                  <td>
                    {invoice.date}
                  </td>

                  <td className="recent-invoice-amount">
                    {invoice.amount}
                  </td>

                  <td>
                    <span className="recent-invoice-source">
                      {
                        invoice.source
                      }
                    </span>
                  </td>

                  <td>
                    <span
                      className={
                        `recent-invoice-status ` +
                        `recent-invoice-status--${invoice.status}`
                      }
                    >
                      {
                        invoice.statusLabel
                      }
                    </span>

                    {invoice.reason && (
                      <small className="recent-invoice-reason">
                        {
                          invoice.reason
                        }
                      </small>
                    )}
                  </td>

                  <td>
                    <div className="recent-invoice-actions">
                      <Link
                        to={
                          `/client/invoices/${invoice.id}`
                        }
                        className="recent-invoice-action"
                        aria-label={
                          `Voir la facture ${invoice.number || ''}`
                        }
                        title="Voir la facture"
                      >
                        →
                      </Link>

                      {invoice.canRetry && (
                        <button
                          type="button"
                          className="recent-invoice-retry"
                          disabled={
                            retryingInvoiceId ===
                            invoice.id
                          }
                          onClick={() =>
                            onRetry(
                              invoice.id,
                            )
                          }
                        >
                          {retryingInvoiceId ===
                          invoice.id
                            ? 'Relance...'
                            : 'Réessayer'}
                        </button>
                      )}

                      {invoice.hasDuplicates && (
                        <button
                          type="button"
                          className="recent-invoice-delete"
                          title={
                            `Supprimer ${invoice.duplicateCopies} doublon${
                              invoice.duplicateCopies > 1
                                ? 's'
                                : ''
                            }`
                          }
                          aria-label={
                            `Supprimer ${invoice.duplicateCopies} doublon${
                              invoice.duplicateCopies > 1
                                ? 's'
                                : ''
                            } de la facture ${invoice.number || ''}`
                          }
                          disabled={
                            deletingInvoiceId ===
                            invoice.id
                          }
                          onClick={() =>
                            onDeleteDuplicates(
                              invoice,
                            )
                          }
                        >
                          {deletingInvoiceId ===
                          invoice.id ? (
                            <span className="recent-invoice-delete-loader" />
                          ) : (
                            <svg
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                              className="recent-invoice-delete-icon"
                            >
                              <path
                                d="M9 3h6m-9 4h12m-10 0 .7 12.1A2 2 0 0 0 10.7 21h2.6a2 2 0 0 0 2-1.9L16 7M10 11v6m4-6v6"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}

                          <span className="recent-invoice-delete-count">
                            {
                              invoice.duplicateCopies
                            }
                          </span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default RecentInvoices;