import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import AuthenticatedHeader from '../../../../components/navigation/AuthenticatedHeader/AuthenticatedHeader';
import AuthenticatedFooter from '../../../../components/navigation/AuthenticatedFooter/AuthenticatedFooter';
import DashboardWelcome from '../../../../components/client-dashboard/DashboardWelcome/DashboardWelcome';
import DashboardStats from '../../../../components/client-dashboard/DashboardStats/DashboardStats';
import MonthlyFinancialDigest from '../../../../components/client-dashboard/MonthlyFinancialDigest/MonthlyFinancialDigest';
import InvoiceStatusOverview from '../../../../components/client-dashboard/InvoiceStatusOverview/InvoiceStatusOverview';
import ProcessingTimeline from '../../../../components/client-dashboard/ProcessingTimeline/ProcessingTimeline';
import RecentInvoices from '../../../../components/client-dashboard/RecentInvoices/RecentInvoices';
import DashboardEmptyState from '../../../../components/client-dashboard/DashboardEmptyState/DashboardEmptyState';

import {
  getStoredUser,
} from '../../../../services/authService';

import {
  getProfile,
} from '../../../../services/profileService';

import {
  getClientDashboard,
  getMonthlyFinancialDigest,
  retryInvoice,
  deleteInvoiceDuplicates,
} from '../../../../services/clientDashboardService';

import './ClientDashboard.css';

const defaultDashboardData = {
  stats: [],
  statusOverview: [],
  currentProcessing: null,
  recentInvoices: [],
};

function ClientDashboard() {
  const storedUser =
    getStoredUser();

  /*
  |--------------------------------------------------------------------------
  | PROFILE
  |--------------------------------------------------------------------------
  */

  const [
    profile,
    setProfile,
  ] =
    useState(null);

  /*
  |--------------------------------------------------------------------------
  | DASHBOARD
  |--------------------------------------------------------------------------
  */

  const [
    dashboardData,
    setDashboardData,
  ] =
    useState(
      defaultDashboardData,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState('');

  /*
  |--------------------------------------------------------------------------
  | MONTHLY DIGEST
  |--------------------------------------------------------------------------
  */

  const [
    monthlyDigest,
    setMonthlyDigest,
  ] =
    useState(null);

  const [
    monthlyDigestLoading,
    setMonthlyDigestLoading,
  ] =
    useState(true);

  const [
    monthlyDigestError,
    setMonthlyDigestError,
  ] =
    useState('');

  /*
  |--------------------------------------------------------------------------
  | ACTION STATES
  |--------------------------------------------------------------------------
  */

  const [
    retryingInvoiceId,
    setRetryingInvoiceId,
  ] =
    useState(null);

  const [
    deletingInvoiceId,
    setDeletingInvoiceId,
  ] =
    useState(null);

  /*
  |--------------------------------------------------------------------------
  | DISPLAY NAME
  |--------------------------------------------------------------------------
  */

  const displayName =
    profile?.full_name ||
    [
      profile?.first_name,
      profile?.last_name,
    ]
      .filter(Boolean)
      .join(' ') ||
    storedUser?.fullName ||
    [
      storedUser?.firstName,
      storedUser?.lastName,
    ]
      .filter(Boolean)
      .join(' ') ||
    storedUser?.email ||
    'Client';

  /*
  |--------------------------------------------------------------------------
  | ORGANIZATION
  |--------------------------------------------------------------------------
  */

  const organizationName =
    storedUser?.organizationName ||
    storedUser?.organization_name ||
    profile?.organization_id ||
    storedUser?.organizationId ||
    storedUser?.organization_id ||
    'Votre organisation';

  /*
  |--------------------------------------------------------------------------
  | LOAD PROFILE
  |--------------------------------------------------------------------------
  */

  const loadProfile =
    useCallback(
      async () => {
        try {
          const response =
            await getProfile();

          setProfile(
            response?.profile ||
            null,
          );
        } catch (
          profileError
        ) {
          console.warn(
            'Impossible de charger le profil dans le dashboard :',
            profileError,
          );
        }
      },
      [],
    );

  /*
  |--------------------------------------------------------------------------
  | LOAD DASHBOARD
  |--------------------------------------------------------------------------
  */

  const loadDashboard =
    useCallback(
      async () => {
        try {
          setLoading(true);

          setError('');

          const response =
            await getClientDashboard();

          setDashboardData({
            stats:
              response?.stats ||
              [],

            statusOverview:
              response?.statusOverview ||
              [],

            currentProcessing:
              response?.currentProcessing ||
              null,

            recentInvoices:
              response?.recentInvoices ||
              [],
          });
        } catch (
          requestError
        ) {
          setError(
            requestError.message ||
              'Impossible de charger le tableau de bord.',
          );
        } finally {
          setLoading(false);
        }
      },
      [],
    );

  /*
  |--------------------------------------------------------------------------
  | LOAD MONTHLY FINANCIAL DIGEST
  |--------------------------------------------------------------------------
  */

  const loadMonthlyDigest =
    useCallback(
      async () => {
        try {
          setMonthlyDigestLoading(
            true,
          );

          setMonthlyDigestError(
            '',
          );

          const now =
            new Date();

          const response =
            await getMonthlyFinancialDigest({
              year:
                now.getFullYear(),

              month:
                now.getMonth() +
                1,
            });

          setMonthlyDigest(
            response ||
            null,
          );
        } catch (
          digestError
        ) {
          console.error(
            'Erreur Monthly Financial Digest :',
            digestError,
          );

          setMonthlyDigestError(
            digestError.message ||
              'Impossible de générer le résumé financier mensuel.',
          );
        } finally {
          setMonthlyDigestLoading(
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
    loadProfile();

    loadDashboard();

    loadMonthlyDigest();
  }, [
    loadProfile,
    loadDashboard,
    loadMonthlyDigest,
  ]);

  /*
  |--------------------------------------------------------------------------
  | RETRY INVOICE
  |--------------------------------------------------------------------------
  */

  async function handleRetryInvoice(
    invoiceId,
  ) {
    try {
      setRetryingInvoiceId(
        invoiceId,
      );

      setError('');

      await retryInvoice(
        invoiceId,
      );

      await Promise.all([
        loadDashboard(),
        loadMonthlyDigest(),
      ]);
    } catch (
      retryError
    ) {
      setError(
        retryError.message ||
          'Impossible de relancer cette facture.',
      );
    } finally {
      setRetryingInvoiceId(
        null,
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | DELETE DUPLICATES
  |--------------------------------------------------------------------------
  */

  async function handleDeleteDuplicates(
    invoice,
  ) {
    if (
      !invoice?.id ||
      !invoice?.hasDuplicates
    ) {
      return;
    }

    const duplicateCopies =
      Number(
        invoice.duplicateCopies ||
          0,
      );

    const invoiceLabel =
      invoice.number ||
      'cette facture';

    const confirmed =
      window.confirm(
        `Supprimer les doublons de la facture ${invoiceLabel} ?\n\n` +
          `${duplicateCopies} ancienne(s) copie(s) seront supprimée(s).\n` +
          'La facture actuellement affichée sera conservée.',
      );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingInvoiceId(
        invoice.id,
      );

      setError('');

      await deleteInvoiceDuplicates(
        invoice.id,
      );

      await Promise.all([
        loadDashboard(),
        loadMonthlyDigest(),
      ]);
    } catch (
      deleteError
    ) {
      setError(
        deleteError.message ||
          'Impossible de supprimer les doublons.',
      );
    } finally {
      setDeletingInvoiceId(
        null,
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | RENDER
  |--------------------------------------------------------------------------
  */

  return (
    <div className="client-dashboard-page">
      <AuthenticatedHeader
        profile={profile}
      />

      <main className="client-dashboard-main">
        <DashboardWelcome
          displayName={
            displayName
          }
          organizationName={
            organizationName
          }
        />

        {loading && (
          <section className="dashboard-loading">
            <div className="dashboard-loading-spinner" />

            <p>
              Chargement des factures réelles...
            </p>
          </section>
        )}

        {!loading &&
          error && (
            <section className="dashboard-error">
              <div>
                <strong>
                  Erreur de chargement
                </strong>

                <p>
                  {error}
                </p>
              </div>

              <button
                type="button"
                onClick={
                  loadDashboard
                }
              >
                Réessayer
              </button>
            </section>
          )}

        {!loading &&
          !error && (
            <>
              <DashboardStats
                items={
                  dashboardData.stats
                }
              />

              <MonthlyFinancialDigest
                digest={
                  monthlyDigest
                }
                loading={
                  monthlyDigestLoading
                }
                error={
                  monthlyDigestError
                }
                onRetry={
                  loadMonthlyDigest
                }
              />

              <section className="client-dashboard-grid">
                <InvoiceStatusOverview
                  items={
                    dashboardData.statusOverview
                  }
                />

                {dashboardData.currentProcessing ? (
                  <ProcessingTimeline
                    invoice={
                      dashboardData.currentProcessing
                    }
                  />
                ) : (
                  <DashboardEmptyState
                    title="Aucun traitement en cours"
                    description="Les factures en cours d’extraction, de validation ou de signature apparaîtront ici."
                    actionLabel="Importer une facture"
                    actionPath="/client/invoices/upload"
                  />
                )}
              </section>

              {dashboardData
                .recentInvoices
                .length > 0 ? (
                <RecentInvoices
                  invoices={
                    dashboardData.recentInvoices
                  }
                  retryingInvoiceId={
                    retryingInvoiceId
                  }
                  deletingInvoiceId={
                    deletingInvoiceId
                  }
                  onRetry={
                    handleRetryInvoice
                  }
                  onDeleteDuplicates={
                    handleDeleteDuplicates
                  }
                />
              ) : (
                <DashboardEmptyState
                  title="Aucune facture disponible"
                  description="Importez votre première facture pour démarrer son traitement automatique."
                  actionLabel="Importer une facture"
                  actionPath="/client/invoices/upload"
                />
              )}
            </>
          )}
      </main>
        <AuthenticatedFooter />
    </div>
  );
}

export default ClientDashboard;