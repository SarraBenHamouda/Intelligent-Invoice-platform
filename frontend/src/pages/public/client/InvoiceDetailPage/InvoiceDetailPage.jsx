import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  Link,
  useParams,
} from 'react-router-dom';

import AuthenticatedHeader from '../../../../components/navigation/AuthenticatedHeader/AuthenticatedHeader';
import AuthenticatedFooter from '../../../../components/navigation/AuthenticatedFooter/AuthenticatedFooter';

import {
  getInvoiceById,
  updateInvoiceById,
  retryInvoice,
  retryErpInvoice,
  humanCorrectionInvoice,
  approveInvoiceExtraction,
  getInvoiceOriginalDocument,
} from '../../../../services/invoiceService';

import './InvoiceDetailPage.css';

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase();
}

function parseJsonField(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function formatDate(value) {
  if (!value) return 'Non renseignée';

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(String(value))) {
    return String(value);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function formatAmount(value, currency = 'EUR') {
  if (value === null || value === undefined || value === '') {
    return 'Non renseigné';
  }

  const parsed = Number(
    String(value)
      .replace(/[^0-9,.-]/g, '')
      .replace(',', '.'),
  );

  if (!Number.isFinite(parsed)) {
    return String(value);
  }

  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency || 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(parsed);
  } catch {
    return `${parsed.toFixed(2)} ${currency || ''}`.trim();
  }
}

function getDisplayInvoiceNumber(invoice, invoiceData, documentData) {
  const extractedNumber = invoiceData?.numero || documentData?.numero;

  if (extractedNumber && String(extractedNumber).trim()) {
    return String(extractedNumber).trim();
  }

  const databaseNumber = invoice?.invoice_number;

  if (
    databaseNumber &&
    !String(databaseNumber).toUpperCase().startsWith('PENDING-')
  ) {
    return String(databaseNumber).trim();
  }

  return 'Numéro en cours';
}


/*
|--------------------------------------------------------------------------
| QR CODE
|--------------------------------------------------------------------------
*/

function getQrCodeDataUri(qrCodeBase64) {
  if (!qrCodeBase64) {
    return null;
  }

  const value = String(qrCodeBase64).trim();

  if (!value) {
    return null;
  }

  if (value.startsWith('data:image/')) {
    return value;
  }

  return `data:image/png;base64,${value}`;
}

function buildCorrections(
  originalValue,
  correctedValue,
  currentPath = '',
  result = {},
) {
  if (Array.isArray(correctedValue)) {
    correctedValue.forEach((item, index) => {
      const path = currentPath ? `${currentPath}.${index}` : String(index);

      buildCorrections(
        Array.isArray(originalValue) ? originalValue[index] : undefined,
        item,
        path,
        result,
      );
    });

    return result;
  }

  if (correctedValue && typeof correctedValue === 'object') {
    Object.keys(correctedValue).forEach((key) => {
      const path = currentPath ? `${currentPath}.${key}` : key;

      buildCorrections(
        originalValue?.[key],
        correctedValue[key],
        path,
        result,
      );
    });

    return result;
  }

  const originalNormalized =
    originalValue === undefined || originalValue === null
      ? ''
      : String(originalValue);

  const correctedNormalized =
    correctedValue === undefined || correctedValue === null
      ? ''
      : String(correctedValue);

  if (originalNormalized !== correctedNormalized) {
    result[currentPath] = correctedValue;
  }

  return result;
}

function containsTechnicalDetails(value) {
  const text = String(value || '').trim().toLowerCase();

  if (!text) return false;

  const patterns = [
    'stacktrace',
    'stack trace',
    'node_modules',
    'axioserror',
    'requesterror',
    'sqlstate',
    'host.docker.internal',
    'tcpconnectwrap',
    'internal/process',
    'internal/modules',
  ];

  return patterns.some((pattern) => text.includes(pattern));
}

function getFriendlyErrorMessage({ code, message, stage }) {
  const normalizedCode = normalizeCode(code);
  const normalizedStage = normalizeCode(stage);

  const messages = {
    INVOICE_ALREADY_ACCEPTED:
      'Cette facture a déjà été traitée et acceptée.',
    DUPLICATE_INVOICE:
      'Cette facture existe déjà dans la plateforme.',
    IMPORT_ERROR:
      'La facture n’a pas pu être ajoutée correctement.',
    IMPORT_TEMPORARY_ERROR:
      'L’ajout de la facture est momentanément interrompu.',
    EXTRACTION_ERROR:
      'Nous n’avons pas réussi à lire toutes les informations de la facture.',
    EXTRACTION_TEMPORARY_ERROR:
      'La lecture de la facture est momentanément interrompue.',
    OCR_ERROR:
      'Nous n’avons pas réussi à lire correctement le document.',
    PDF_EXTRACTION_ERROR:
      'Nous n’avons pas réussi à lire correctement le PDF.',
    VALIDATION_ERROR:
      'Certaines informations doivent être vérifiées.',
    VALIDATION_REJECTED:
      'Certaines informations doivent être corrigées avant de continuer.',
    INVOICE_NUMBER_MISSING:
      'Le numéro de facture n’a pas été trouvé. Merci de le renseigner.',
    AMOUNT_ERROR:
      'Les montants de la facture ne semblent pas cohérents.',
    PARTNER_IDENTIFIER_ERROR:
      'Une information du fournisseur ou du client doit être corrigée.',
    SIGNATURE_ERROR:
      'La facture n’a pas pu être finalisée.',
    SIGNATURE_TEMPORARY_ERROR:
      'La finalisation est momentanément indisponible.',
    SIGNATURE_SERVICE_ERROR:
      'La finalisation est momentanément indisponible.',
    TTN_ERROR:
      'L’envoi de la facture n’a pas pu être terminé.',
    TTN_REJECTED:
      'La facture a été refusée lors de son envoi.',
    TTN_TEMPORARY_ERROR:
      'L’envoi est momentanément interrompu.',
    TTN_TIMEOUT:
      'Le service d’envoi met plus de temps que prévu.',
    TTN_UNAVAILABLE:
      'Le service d’envoi est momentanément indisponible.',
    TTN_SERVER_ERROR:
      'Le service d’envoi rencontre momentanément un problème.',
    SERVICE_UNAVAILABLE:
      'Un service nécessaire est momentanément indisponible.',
    NETWORK_ERROR:
      'Un problème de communication temporaire est survenu.',
    CONNECTION_ERROR:
      'Un service nécessaire est momentanément inaccessible.',
    ECONNREFUSED:
      'Un service nécessaire est momentanément inaccessible.',
    ETIMEDOUT:
      'Un service nécessaire met plus de temps que prévu.',
    WORKFLOW_STAGE_TIMEOUT:
      'Le traitement prend plus de temps que prévu.',
    N8N_CONTINUE_START_FAILED:
      'Vos corrections sont enregistrées, mais la suite du traitement n’a pas encore démarré.',
  };

  if (normalizedCode && messages[normalizedCode]) {
    return messages[normalizedCode];
  }

  if (message && !containsTechnicalDetails(message)) {
    return String(message).trim();
  }

  if (normalizedStage === 'IMPORT') {
    return 'La facture n’a pas pu être ajoutée correctement.';
  }

  if (normalizedStage === 'EXTRACTION') {
    return 'Nous n’avons pas réussi à lire toutes les informations de la facture.';
  }

  if (normalizedStage === 'VALIDATION') {
    return 'Certaines informations doivent être vérifiées avant de continuer.';
  }

  if (normalizedStage === 'SIGNATURE') {
    return 'La facture n’a pas pu être finalisée.';
  }

  if (normalizedStage === 'TTN') {
    return 'L’envoi de la facture n’a pas pu être terminé.';
  }

  return 'Cette facture nécessite votre attention.';
}

function getClientStatus(status) {
  const normalized = normalizeCode(status);

  if (normalized === 'ACCEPTED') {
    return {
      label: 'Terminée',
      title: 'Votre facture est prête',
      description:
        'Tout est terminé. Votre facture a été traitée avec succès.',
      tone: 'success',
      icon: '✓',
    };
  }

  if (['REJECTED', 'ERROR'].includes(normalized)) {
    return {
      label: 'À corriger',
      title: 'Cette facture nécessite votre attention',
      description:
        'Une information doit être corrigée avant de pouvoir continuer.',
      tone: 'danger',
      icon: '!',
    };
  }

  if (['PENDING_REVIEW', 'PENDING_RETRY'].includes(normalized)) {
    return {
      label: 'À vérifier',
      title: 'Cette facture doit être vérifiée',
      description:
        'Vérifiez les informations détectées avant de continuer.',
      tone: 'warning',
      icon: '!',
    };
  }

  return {
    label: 'En cours',
    title: 'Votre facture est en cours de traitement',
    description:
      'Vous n’avez rien à faire pour le moment. La page se met à jour automatiquement.',
    tone: 'primary',
    icon: '…',
  };
}

function Field({ label, value, emphasis = false }) {
  const displayValue =
    value === null || value === undefined || value === ''
      ? 'Non renseigné'
      : value;

  return (
    <div
      className={[
        'invoice-detail-field',
        emphasis ? 'invoice-detail-field--emphasis' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span>{label}</span>
      <strong>{displayValue}</strong>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder = '',
  hasError = false,
}) {
  return (
    <label
      className={[
        'invoice-detail-edit-field',
        hasError ? 'invoice-detail-edit-field--error' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span>{label}</span>

      <input
        type={type}
        value={value ?? ''}
        placeholder={placeholder}
        className="invoice-detail-edit-input"
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function InvoiceDetailPage() {
  const { id } = useParams();

  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState(null);
  const [saving, setSaving] = useState(false);

  const [retrying, setRetrying] = useState(false);
  const [approving, setApproving] = useState(false);

  const [erpRetryData, setErpRetryData] = useState({
    invoice_number: '',
    client_code: '',
  });

  const [originalDocument, setOriginalDocument] = useState({
    url: '',
    filename: '',
    contentType: '',
  });

  const [originalDocumentLoading, setOriginalDocumentLoading] =
    useState(false);

  const [originalDocumentError, setOriginalDocumentError] =
    useState('');

  const reviewSectionRef = useRef(null);

  const loadInvoice = useCallback(
    async ({ silent = false } = {}) => {
      try {
        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const result = await getInvoiceById(id);
        const loadedInvoice = result?.invoice || null;

        setInvoice(loadedInvoice);
        setError('');

        return loadedInvoice;
      } catch (loadError) {
        setError(
          loadError?.message ||
            'Impossible de charger cette facture.',
        );

        throw loadError;
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id],
  );

  useEffect(() => {
    loadInvoice().catch(() => {});
  }, [loadInvoice]);

  useEffect(() => {
    if (!invoice || editMode) {
      return undefined;
    }

    const currentStatus = normalizeCode(invoice.status);

    if (['ACCEPTED', 'REJECTED', 'ERROR'].includes(currentStatus)) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      loadInvoice({ silent: true }).catch(() => {});
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [invoice, editMode, loadInvoice]);

  const extraction = useMemo(
    () =>
      parseJsonField(
        invoice?.extracted_data ||
          invoice?.extracted_data_object,
      ),
    [invoice],
  );

  const documentData = extraction?.document || {};
  const supplier = extraction?.fournisseur || {};
  const customer = extraction?.client || {};
  const invoiceData = extraction?.facture || {};
  const totals = extraction?.totaux || {};

  const lines = Array.isArray(extraction?.lignes_facture)
    ? extraction.lignes_facture
    : [];

  const validationErrors = Array.isArray(invoice?.validation_errors)
    ? invoice.validation_errors
    : [];

  const extractionBlockingErrors = Array.isArray(
    extraction?.controle_validation?.erreurs_bloquantes,
  )
    ? extraction.controle_validation.erreurs_bloquantes
    : [];

  const blockingValidationErrors = validationErrors.filter(
    (validationError) =>
      normalizeCode(validationError?.severity) === 'ERROR',
  );

  const hasBlockingErrors =
    blockingValidationErrors.length > 0 ||
    extractionBlockingErrors.length > 0;

  const displayInvoiceNumber = getDisplayInvoiceNumber(
    invoice,
    invoiceData,
    documentData,
  );

  const status = normalizeCode(invoice?.status);
  const currentStage = normalizeCode(invoice?.current_stage);

  const invoiceSource = normalizeCode(
    invoice?.source ||
      invoice?.source_type ||
      documentData?.source,
  );

  const currency =
    documentData?.devise ||
    invoice?.currency ||
    'EUR';

  const totalTtc =
    totals?.total_ttc ??
    totals?.net_a_payer ??
    invoice?.total_ttc ??
    invoice?.total_amount;

  const isAccepted = status === 'ACCEPTED';

  const qrCodeDataUri = getQrCodeDataUri(
    invoice?.qr_code_base64,
  );

  const hasQrCode = Boolean(
    isAccepted && qrCodeDataUri,
  );

  const verificationUrl = invoice?.verification_token
    ? `${window.location.origin}/verify/${invoice.verification_token}`
    : '';

  const isPendingReview = status === 'PENDING_REVIEW';
  const isPendingRetry = status === 'PENDING_RETRY';
  const isError = status === 'ERROR';
  const isRejected = status === 'REJECTED';
  const isErpInvoice = invoiceSource === 'ERP';

  const hasProblem =
    isError ||
    isRejected ||
    isPendingRetry ||
    hasBlockingErrors;

  const canRetry = Boolean(invoice?.can_retry);

  const canApprove = Boolean(
    isPendingReview &&
      currentStage === 'VALIDATION' &&
      !hasBlockingErrors,
  );

  const clientStatus = getClientStatus(status);

  const rawErrorMessage =
    invoice?.last_error_message ||
    invoice?.rejection_reason ||
    '';

  const friendlyErrorMessage = getFriendlyErrorMessage({
    code:
      invoice?.last_error_code ||
      invoice?.error_code,
    message: rawErrorMessage,
    stage: currentStage,
  });

  const originalDocumentAvailable = Boolean(
    invoice?.original_filename &&
      invoice?.original_file_path &&
      !isErpInvoice,
  );

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';

    async function loadOriginalDocument() {
      if (!invoice?.id || !originalDocumentAvailable) {
        setOriginalDocument({
          url: '',
          filename: invoice?.original_filename || '',
          contentType: '',
        });
        return;
      }

      try {
        setOriginalDocumentLoading(true);
        setOriginalDocumentError('');

        const result = await getInvoiceOriginalDocument(invoice.id);

        if (cancelled) return;

        objectUrl = URL.createObjectURL(result.blob);

        setOriginalDocument({
          url: objectUrl,
          filename:
            result.filename ||
            invoice.original_filename ||
            'Document original',
          contentType:
            result.contentType ||
            result.blob?.type ||
            '',
        });
      } catch (documentError) {
        if (cancelled) return;

        setOriginalDocumentError(
          documentError?.message ||
            'Impossible d’afficher le document original.',
        );
      } finally {
        if (!cancelled) {
          setOriginalDocumentLoading(false);
        }
      }
    }

    loadOriginalDocument();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [
    invoice?.id,
    invoice?.original_filename,
    invoice?.original_file_path,
    originalDocumentAvailable,
  ]);

  function startEditing() {
    setError('');
    setMessage('');

    if (
      isErpInvoice &&
      (isError || isRejected || isPendingRetry)
    ) {
      setErpRetryData({
        invoice_number:
          invoice?.invoice_number ||
          (displayInvoiceNumber === 'Numéro en cours'
            ? ''
            : displayInvoiceNumber),
        client_code:
          invoice?.customer_identifier ||
          customer?.code_client ||
          customer?.identifiant ||
          '',
      });

      setEditData({ erp_retry: true });
      setEditMode(true);
      return;
    }

    setEditData({
      document: {
        ...documentData,
        numero:
          documentData?.numero ||
          invoiceData?.numero ||
          '',
        devise:
          documentData?.devise ||
          invoice?.currency ||
          '',
      },
      fournisseur: {
        ...supplier,
      },
      client: {
        ...customer,
      },
      facture: {
        ...invoiceData,
        numero:
          displayInvoiceNumber === 'Numéro en cours'
            ? ''
            : displayInvoiceNumber,
      },
      totaux: {
        ...totals,
        total_ht:
          totals?.total_ht ??
          invoice?.total_ht ??
          '',
        montant_tva:
          totals?.montant_tva ??
          totals?.total_tva ??
          invoice?.total_tva ??
          '',
        total_ttc:
          totals?.total_ttc ??
          invoice?.total_ttc ??
          '',
      },
      lignes_facture: lines.map((line) => ({ ...line })),
      controle_validation: {
        ...(extraction?.controle_validation || {}),
      },
    });

    setEditMode(true);

    window.requestAnimationFrame(() => {
      reviewSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }

  function cancelEditing() {
    setEditMode(false);
    setEditData(null);
    setError('');
  }

  function updateSection(section, field, value) {
    setEditData((current) => ({
      ...current,
      [section]: {
        ...(current?.[section] || {}),
        [field]: value,
      },
    }));
  }

  function updateInvoiceNumber(value) {
    setEditData((current) => ({
      ...current,
      document: {
        ...(current?.document || {}),
        numero: value,
      },
      facture: {
        ...(current?.facture || {}),
        numero: value,
      },
    }));
  }

  function updateLine(index, field, value) {
    setEditData((current) => {
      const updatedLines = [
        ...(current?.lignes_facture || []),
      ];

      updatedLines[index] = {
        ...updatedLines[index],
        [field]: value,
      };

      return {
        ...current,
        lignes_facture: updatedLines,
      };
    });
  }

  async function handleSave() {
    if (!editData || saving) return;

    if (editData.erp_retry === true) {
      await handleErpRetry();
      return;
    }

    try {
      setSaving(true);
      setError('');
      setMessage('');

      if (isAccepted) {
        const result = await updateInvoiceById(invoice.id, {
          metadata_only: true,
          supplier_identifier:
            editData?.fournisseur?.identifiant || null,
          customer_identifier:
            editData?.client?.identifiant ||
            editData?.client?.code_client ||
            null,
          extracted_data: editData,
        });

        setInvoice(result?.invoice || invoice);
        setMessage(
          result?.message ||
            'Les informations ont été enregistrées.',
        );

        setEditMode(false);
        setEditData(null);

        await loadInvoice({ silent: true });
        return;
      }

      const corrections = buildCorrections(extraction, editData);

      if (Object.keys(corrections).length === 0) {
        setEditMode(false);
        setEditData(null);
        setMessage('Aucune modification détectée.');
        return;
      }

      const result = await humanCorrectionInvoice(invoice.id, {
        corrections,
      });

      setInvoice(result?.invoice || invoice);
      setMessage(
        result?.message ||
          'Vos corrections ont été enregistrées.',
      );

      setEditMode(false);
      setEditData(null);

      await loadInvoice({ silent: true });
    } catch (saveError) {
      setError(
        saveError?.message ||
          'Impossible d’enregistrer les modifications.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleErpRetry() {
    if (!invoice?.id || retrying) return;

    const invoiceNumber = String(
      erpRetryData.invoice_number || '',
    ).trim();

    const clientCode = String(
      erpRetryData.client_code || '',
    ).trim();

    if (!invoiceNumber) {
      setError('Le numéro de facture est obligatoire.');
      return;
    }

    if (!clientCode) {
      setError('Le code client est obligatoire.');
      return;
    }

    try {
      setRetrying(true);
      setError('');
      setMessage('');

      const result = await retryErpInvoice(invoice.id, {
        invoice_number: invoiceNumber,
        client_code: clientCode,
      });

      setMessage(result?.message || 'La facture a été relancée.');
      setEditMode(false);
      setEditData(null);

      await loadInvoice({ silent: true });
    } catch (retryError) {
      setError(
        retryError?.message ||
          'Impossible de relancer cette facture.',
      );
    } finally {
      setRetrying(false);
    }
  }

  async function handleRetry() {
    if (!invoice?.id || retrying) return;

    try {
      setRetrying(true);
      setError('');
      setMessage('');

      const result = await retryInvoice(invoice.id);

      setMessage(result?.message || 'La facture a été relancée.');
      await loadInvoice({ silent: true });
    } catch (retryError) {
      setError(
        retryError?.message ||
          'Impossible de relancer cette facture.',
      );
    } finally {
      setRetrying(false);
    }
  }

  async function handleApprove() {
    if (!invoice?.id || approving) return;

    if (!canApprove) {
      setError(
        'Certaines informations doivent encore être corrigées.',
      );
      return;
    }

    try {
      setApproving(true);
      setError('');
      setMessage('');

      const result = await approveInvoiceExtraction(invoice.id);

      setMessage(
        result?.message ||
          'Merci. Le traitement de votre facture continue.',
      );

      await loadInvoice({ silent: true });
    } catch (approvalError) {
      setError(
        approvalError?.message ||
          'Impossible de continuer pour le moment.',
      );
    } finally {
      setApproving(false);
    }
  }

  if (loading && !invoice) {
    return (
      <div className="invoice-detail-page">
        <AuthenticatedHeader />

        <main className="invoice-detail-main">
          <div className="invoice-detail-state">
            <div className="invoice-detail-loader" />
            <strong>Chargement de votre facture...</strong>
            <p>Quelques secondes suffisent.</p>
          </div>
        </main>

        <AuthenticatedFooter />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="invoice-detail-page">
        <AuthenticatedHeader />

        <main className="invoice-detail-main">
          <div className="invoice-detail-state invoice-detail-state--error">
            <strong>Facture introuvable</strong>
            <p>Cette facture n’est pas disponible.</p>

         
          </div>
        </main>

        <AuthenticatedFooter />
      </div>
    );
  }

  const invoiceNumberHasError = blockingValidationErrors.some(
    (validationError) => {
      const field = String(validationError?.field || '')
        .trim()
        .toLowerCase();

      const code = normalizeCode(validationError?.code);

      return (
        field === 'document.numero' ||
        field === 'facture.numero' ||
        code === 'INVOICE_NUMBER_MISSING'
      );
    },
  );

  const supplierName =
    supplier?.nom ||
    invoice?.supplier_name ||
    invoice?.supplier_identifier;

  const customerName =
    customer?.nom ||
    invoice?.customer_name ||
    invoice?.customer_identifier;

  return (
    <div className="invoice-detail-page">
      <AuthenticatedHeader />

      <main className="invoice-detail-main">
        <div className="invoice-detail-topbar">
          <Link
            to="/client/invoices"
            className="invoice-detail-back-link"
          >
            ← Retour à mes factures
          </Link>

          <button
            type="button"
            className="invoice-detail-refresh-button"
            disabled={refreshing}
            onClick={() => loadInvoice({ silent: true })}
          >
            <span
              className={refreshing ? 'is-spinning' : ''}
              aria-hidden="true"
            >
              ↻
            </span>

            {refreshing ? 'Mise à jour...' : 'Actualiser'}
          </button>
        </div>

        <section className="invoice-detail-hero">
          <div>
           
            <h1>Facture {displayInvoiceNumber}</h1>

            <p>
              Retrouvez ici les informations importantes de votre facture
              et les actions à effectuer.
            </p>
          </div>

          <div className="invoice-detail-hero-summary">
            <div>
              <span>Montant</span>
              <strong>{formatAmount(totalTtc, currency)}</strong>
            </div>

            <div>
              <span>Date</span>
              <strong>
                {formatDate(
                  invoiceData?.date_facture ||
                    documentData?.date ||
                    invoice?.invoice_date,
                )}
              </strong>
            </div>

            <div>
              <span>État</span>
              <strong
                className={`invoice-detail-simple-status invoice-detail-simple-status--${clientStatus.tone}`}
              >
                {clientStatus.label}
              </strong>
            </div>
          </div>
        </section>

        {error && (
          <div className="invoice-detail-message invoice-detail-message--error">
            <span>!</span>
            <p>{error}</p>
          </div>
        )}

        {message && (
          <div className="invoice-detail-message invoice-detail-message--success">
            <span>✓</span>
            <p>{message}</p>
          </div>
        )}

        <section
          className={`invoice-detail-client-status invoice-detail-client-status--${clientStatus.tone}`}
        >
          <div className="invoice-detail-client-status__icon">
            {clientStatus.icon}
          </div>

          <div className="invoice-detail-client-status__content">
            <span className="invoice-detail-client-status__label">
              État de votre facture
            </span>

            <h2>{clientStatus.title}</h2>

            <p>
              {hasProblem
                ? friendlyErrorMessage
                : clientStatus.description}
            </p>

            <div className="invoice-detail-client-status__checks">
              <span className="is-done">
                <i>✓</i>
                Facture reçue
              </span>

              <span
                className={
                  extraction && Object.keys(extraction).length
                    ? 'is-done'
                    : ''
                }
              >
                <i>
                  {extraction && Object.keys(extraction).length
                    ? '✓'
                    : '•'}
                </i>
                Informations lues
              </span>

              <span
                className={
                  hasBlockingErrors
                    ? 'is-problem'
                    : canApprove || isAccepted
                      ? 'is-done'
                      : ''
                }
              >
                <i>
                  {hasBlockingErrors
                    ? '!'
                    : canApprove || isAccepted
                      ? '✓'
                      : '•'}
                </i>
                Vérification
              </span>
            </div>


            {isAccepted && hasQrCode && (
              <div className="invoice-detail-qr">
                <img
                  src={qrCodeDataUri}
                  alt="QR code de vérification de la facture"
                />

                <div className="invoice-detail-qr__content">
                  <span className="invoice-detail-qr__label">
                    Vérification publique
                  </span>

                  <strong>
                    Vérifiez l’authenticité de cette facture
                  </strong>

                  <p>
                    Scannez ce QR code pour ouvrir la page publique de
                    vérification et consulter la confirmation de la facture.
                  </p>

                  {verificationUrl && (
                    <a
                      href={verificationUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="invoice-detail-qr__link"
                    >
                      Ouvrir la vérification
                    </a>
                  )}
                </div>
              </div>
            )}

            <div className="invoice-detail-client-status__actions">
              {(isPendingReview || hasBlockingErrors || hasProblem) && (
                <button
                  type="button"
                  className="invoice-detail-primary-button"
                  onClick={startEditing}
                >
                  Vérifier les informations
                </button>
              )}

              {canRetry && (
                <button
                  type="button"
                  className="invoice-detail-secondary-button"
                  disabled={retrying}
                  onClick={handleRetry}
                >
                  {retrying ? 'Nouvelle tentative...' : 'Réessayer'}
                </button>
              )}
            </div>
          </div>
        </section>

        {!isErpInvoice && (
          <section className="invoice-detail-comparison">
            <header className="invoice-detail-section-heading">
              <div>
                <span>Vérification</span>
                <h2>Vérifiez votre facture</h2>
                <p>
                  Comparez le document original avec les informations
                  que nous avons détectées.
                </p>
              </div>
            </header>

            <div className="invoice-detail-comparison-grid">
              <article className="invoice-detail-document-card">
                <div className="invoice-detail-subheading">
                  <span className="invoice-detail-subheading__icon">
                    PDF
                  </span>

                  <div>
                    <strong>Document original</strong>
                    <small>
                      {originalDocument.filename ||
                        invoice?.original_filename ||
                        'Votre document'}
                    </small>
                  </div>
                </div>

                <div className="invoice-detail-document-preview">
                  {originalDocumentLoading ? (
                    <div className="invoice-detail-preview-state">
                      <div className="invoice-detail-loader" />
                      <span>Chargement du document...</span>
                    </div>
                  ) : originalDocument.url ? (
                    String(originalDocument.contentType).includes('pdf') ||
                    String(originalDocument.filename)
                      .toLowerCase()
                      .endsWith('.pdf') ? (
                      <iframe
                        src={originalDocument.url}
                        title="Document original de la facture"
                      />
                    ) : (
                      <img
                        src={originalDocument.url}
                        alt="Document original de la facture"
                      />
                    )
                  ) : (
                    <div className="invoice-detail-preview-state">
                      <span className="invoice-detail-preview-state__icon">
                        PDF
                      </span>
                      <strong>Aperçu non disponible</strong>
                      <p>
                        {originalDocumentError ||
                          'Le document original ne peut pas être affiché ici.'}
                      </p>
                    </div>
                  )}
                </div>
              </article>

              <article className="invoice-detail-detected-card">
                <div className="invoice-detail-subheading">
                  <span className="invoice-detail-subheading__icon invoice-detail-subheading__icon--success">
                    ✓
                  </span>

                  <div>
                    <strong>Informations détectées</strong>
                    <small>Vérifiez les informations importantes.</small>
                  </div>
                </div>

                <div className="invoice-detail-detected-fields">
                  <Field label="Numéro" value={displayInvoiceNumber} />
                  <Field label="Fournisseur" value={supplierName} />
                  <Field label="Client" value={customerName} />
                  <Field
                    label="Date"
                    value={formatDate(
                      invoiceData?.date_facture ||
                        documentData?.date ||
                        invoice?.invoice_date,
                    )}
                  />
                  <Field
                    label="Total HT"
                    value={formatAmount(
                      totals?.total_ht ?? invoice?.total_ht,
                      currency,
                    )}
                  />
                  <Field
                    label="TVA"
                    value={formatAmount(
                      totals?.montant_tva ??
                        totals?.total_tva ??
                        invoice?.total_tva,
                      currency,
                    )}
                  />
                  <Field
                    label="Total TTC"
                    value={formatAmount(totalTtc, currency)}
                    emphasis
                  />
                </div>

                {!isAccepted && (
                  <button
                    type="button"
                    className="invoice-detail-inline-edit"
                    onClick={startEditing}
                  >
                    Modifier une information
                  </button>
                )}
              </article>
            </div>
          </section>
        )}

        {(isPendingReview || hasBlockingErrors) && (
          <section className="invoice-detail-review-panel">
            <div className="invoice-detail-review-panel__icon">
              {hasBlockingErrors ? '!' : '✓'}
            </div>

            <div>
              <span>Votre vérification</span>

              <h2>
                {hasBlockingErrors
                  ? 'Quelques informations doivent être corrigées'
                  : 'Les informations sont-elles correctes ?'}
              </h2>

              <p>
                {hasBlockingErrors
                  ? 'Corrigez les informations signalées puis enregistrez vos modifications.'
                  : 'Si tout correspond bien à votre facture, vous pouvez continuer.'}
              </p>

              <div className="invoice-detail-review-panel__actions">
                <button
                  type="button"
                  className="invoice-detail-secondary-button"
                  onClick={startEditing}
                >
                  Modifier
                </button>

                {!hasBlockingErrors && canApprove && (
                  <button
                    type="button"
                    className="invoice-detail-primary-button invoice-detail-primary-button--success"
                    disabled={approving}
                    onClick={handleApprove}
                  >
                    {approving
                      ? 'Validation en cours...'
                      : 'Tout est correct, continuer'}
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        {editMode && editData && (
          <section
            ref={reviewSectionRef}
            className="invoice-detail-edit-panel"
          >
            <header>
              <div>
                <span>Modification</span>
                <h2>Corriger les informations</h2>
                <p>
                  Modifiez uniquement les informations nécessaires,
                  puis enregistrez.
                </p>
              </div>

              <button
                type="button"
                className="invoice-detail-close-edit"
                onClick={cancelEditing}
                disabled={saving || retrying}
                aria-label="Fermer"
              >
                ×
              </button>
            </header>

            {editData.erp_retry === true ? (
              <div className="invoice-detail-edit-grid">
                <EditField
                  label="Numéro de facture"
                  value={erpRetryData.invoice_number}
                  onChange={(value) =>
                    setErpRetryData((current) => ({
                      ...current,
                      invoice_number: value,
                    }))
                  }
                />

                <EditField
                  label="Code client"
                  value={erpRetryData.client_code}
                  onChange={(value) =>
                    setErpRetryData((current) => ({
                      ...current,
                      client_code: value,
                    }))
                  }
                />
              </div>
            ) : (
              <>
                <div className="invoice-detail-edit-group">
                  <h3>Facture</h3>

                  <div className="invoice-detail-edit-grid">
                    <EditField
                      label="Numéro"
                      value={editData?.facture?.numero || ''}
                      hasError={invoiceNumberHasError}
                      onChange={updateInvoiceNumber}
                    />

                    <EditField
                      label="Date"
                      value={editData?.facture?.date_facture || ''}
                      placeholder="JJ/MM/AAAA"
                      onChange={(value) =>
                        updateSection('facture', 'date_facture', value)
                      }
                    />

                    <EditField
                      label="Échéance"
                      value={editData?.facture?.date_echeance || ''}
                      placeholder="JJ/MM/AAAA"
                      onChange={(value) =>
                        updateSection('facture', 'date_echeance', value)
                      }
                    />

                    <EditField
                      label="Devise"
                      value={editData?.document?.devise || ''}
                      onChange={(value) =>
                        updateSection(
                          'document',
                          'devise',
                          value.toUpperCase(),
                        )
                      }
                    />
                  </div>
                </div>

                <div className="invoice-detail-edit-group">
                  <h3>Fournisseur</h3>

                  <div className="invoice-detail-edit-grid">
                    <EditField
                      label="Nom"
                      value={editData?.fournisseur?.nom || ''}
                      onChange={(value) =>
                        updateSection('fournisseur', 'nom', value)
                      }
                    />

                    <EditField
                      label="Identifiant / TVA"
                      value={editData?.fournisseur?.identifiant || ''}
                      onChange={(value) =>
                        updateSection(
                          'fournisseur',
                          'identifiant',
                          value,
                        )
                      }
                    />

                    <EditField
                      label="Adresse"
                      value={editData?.fournisseur?.adresse || ''}
                      onChange={(value) =>
                        updateSection('fournisseur', 'adresse', value)
                      }
                    />

                    <EditField
                      label="E-mail"
                      type="email"
                      value={editData?.fournisseur?.email || ''}
                      onChange={(value) =>
                        updateSection('fournisseur', 'email', value)
                      }
                    />
                  </div>
                </div>

                <div className="invoice-detail-edit-group">
                  <h3>Client</h3>

                  <div className="invoice-detail-edit-grid">
                    <EditField
                      label="Nom"
                      value={editData?.client?.nom || ''}
                      onChange={(value) =>
                        updateSection('client', 'nom', value)
                      }
                    />

                    <EditField
                      label="Identifiant"
                      value={editData?.client?.identifiant || ''}
                      onChange={(value) =>
                        updateSection('client', 'identifiant', value)
                      }
                    />

                    <EditField
                      label="Adresse"
                      value={editData?.client?.adresse || ''}
                      onChange={(value) =>
                        updateSection('client', 'adresse', value)
                      }
                    />

                    <EditField
                      label="E-mail"
                      type="email"
                      value={editData?.client?.email || ''}
                      onChange={(value) =>
                        updateSection('client', 'email', value)
                      }
                    />
                  </div>
                </div>

                <div className="invoice-detail-edit-group">
                  <h3>Montants</h3>

                  <div className="invoice-detail-edit-grid">
                    <EditField
                      label="Total HT"
                      value={editData?.totaux?.total_ht ?? ''}
                      onChange={(value) =>
                        updateSection('totaux', 'total_ht', value)
                      }
                    />

                    <EditField
                      label="TVA"
                      value={editData?.totaux?.montant_tva ?? ''}
                      onChange={(value) =>
                        updateSection('totaux', 'montant_tva', value)
                      }
                    />

                    <EditField
                      label="Total TTC"
                      value={editData?.totaux?.total_ttc ?? ''}
                      onChange={(value) =>
                        updateSection('totaux', 'total_ttc', value)
                      }
                    />
                  </div>
                </div>

                {editData?.lignes_facture?.length > 0 && (
                  <div className="invoice-detail-edit-group">
                    <h3>Articles</h3>

                    <div className="invoice-detail-edit-lines">
                      {editData.lignes_facture.map((line, index) => (
                        <div
                          className="invoice-detail-edit-line"
                          key={`${line?.reference || 'line'}-${index}`}
                        >
                          <EditField
                            label="Référence"
                            value={line?.reference ?? ''}
                            onChange={(value) =>
                              updateLine(index, 'reference', value)
                            }
                          />

                          <EditField
                            label="Désignation"
                            value={line?.designation ?? ''}
                            onChange={(value) =>
                              updateLine(index, 'designation', value)
                            }
                          />

                          <EditField
                            label="Quantité"
                            value={line?.quantite ?? ''}
                            onChange={(value) =>
                              updateLine(index, 'quantite', value)
                            }
                          />

                          <EditField
                            label="Prix unitaire"
                            value={line?.prix_unitaire ?? ''}
                            onChange={(value) =>
                              updateLine(index, 'prix_unitaire', value)
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            <footer>
              <button
                type="button"
                className="invoice-detail-secondary-button"
                disabled={saving || retrying}
                onClick={cancelEditing}
              >
                Annuler
              </button>

              <button
                type="button"
                className="invoice-detail-primary-button"
                disabled={saving || retrying}
                onClick={handleSave}
              >
                {saving || retrying
                  ? 'Enregistrement...'
                  : editData.erp_retry
                    ? 'Corriger et relancer'
                    : 'Enregistrer'}
              </button>
            </footer>
          </section>
        )}

        <section className="invoice-detail-information-section">
          <header className="invoice-detail-section-heading">
            <div>
              <span>Informations</span>
              <h2>Informations de la facture</h2>
              <p>Les informations essentielles sont regroupées ici.</p>
            </div>
          </header>

          <div className="invoice-detail-info-grid">
            <article className="invoice-detail-info-card invoice-detail-info-card--invoice">
              <header>
                <span>01</span>
                <div>
                  <h3>Facture</h3>
                  <p>Les informations principales.</p>
                </div>
              </header>

              <div className="invoice-detail-info-fields">
                <Field label="Numéro" value={displayInvoiceNumber} />
                <Field
                  label="Date"
                  value={formatDate(
                    invoiceData?.date_facture ||
                      documentData?.date ||
                      invoice?.invoice_date,
                  )}
                />
                <Field
                  label="Échéance"
                  value={formatDate(invoiceData?.date_echeance)}
                />
                <Field label="Devise" value={currency} />
              </div>
            </article>

            <article className="invoice-detail-info-card">
              <header>
                <span>02</span>
                <div>
                  <h3>Fournisseur</h3>
                  <p>Qui a émis la facture.</p>
                </div>
              </header>

              <div className="invoice-detail-info-fields">
                <Field label="Nom" value={supplierName} />
                <Field
                  label="Identifiant"
                  value={
                    supplier?.identifiant ||
                    invoice?.supplier_identifier
                  }
                />
                <Field label="Adresse" value={supplier?.adresse} />
                <Field label="E-mail" value={supplier?.email} />
              </div>
            </article>

            <article className="invoice-detail-info-card">
              <header>
                <span>03</span>
                <div>
                  <h3>Client</h3>
                  <p>À qui la facture est destinée.</p>
                </div>
              </header>

              <div className="invoice-detail-info-fields">
                <Field label="Nom" value={customerName} />
                <Field
                  label="Identifiant"
                  value={
                    customer?.identifiant ||
                    invoice?.customer_identifier
                  }
                />
                <Field label="Adresse" value={customer?.adresse} />
                <Field label="E-mail" value={customer?.email} />
              </div>
            </article>

            <article className="invoice-detail-info-card invoice-detail-info-card--totals">
              <header>
                <span>04</span>
                <div>
                  <h3>Montants</h3>
                  <p>Résumé financier.</p>
                </div>
              </header>

              <div className="invoice-detail-info-fields">
                <Field
                  label="Total HT"
                  value={formatAmount(
                    totals?.total_ht ?? invoice?.total_ht,
                    currency,
                  )}
                />
                <Field
                  label="TVA"
                  value={formatAmount(
                    totals?.montant_tva ??
                      totals?.total_tva ??
                      invoice?.total_tva,
                    currency,
                  )}
                />
                <Field
                  label="Total TTC"
                  value={formatAmount(totalTtc, currency)}
                  emphasis
                />
              </div>
            </article>
          </div>
        </section>

        <section className="invoice-detail-lines-section">
          <header className="invoice-detail-section-heading">
            <div>
              <span>Détail</span>
              <h2>Articles de la facture</h2>
              <p>
                Retrouvez les articles, quantités et montants indiqués
                sur la facture.
              </p>
            </div>
          </header>

          <div className="invoice-detail-table-wrapper">
            <table className="invoice-detail-table">
              <thead>
                <tr>
                  <th>Référence</th>
                  <th>Désignation</th>
                  <th>Qté</th>
                  <th>Prix unitaire</th>
                  <th>TVA</th>
                  <th>Total HT</th>
                </tr>
              </thead>

              <tbody>
                {lines.length > 0 ? (
                  lines.map((line, index) => (
                    <tr key={`${line?.reference || 'line'}-${index}`}>
                      <td>{line?.reference || '—'}</td>
                      <td className="invoice-detail-table__designation">
                        {line?.designation || 'Non renseigné'}
                      </td>
                      <td>{line?.quantite ?? '—'}</td>
                      <td>
                        {formatAmount(line?.prix_unitaire, currency)}
                      </td>
                      <td>
                        {line?.taux_tva !== undefined &&
                        line?.taux_tva !== null &&
                        line?.taux_tva !== ''
                          ? `${line.taux_tva} %`
                          : '—'}
                      </td>
                      <td>{formatAmount(line?.montant_ht, currency)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan="6"
                      className="invoice-detail-table-empty"
                    >
                      Aucun article n’a été détecté.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {(hasBlockingErrors || hasProblem) && (
          <section className="invoice-detail-problems">
            <header className="invoice-detail-section-heading">
              <div>
                <span>À vérifier</span>
                <h2>Informations à corriger</h2>
                <p>
                  Nous affichons uniquement ce qui demande votre attention.
                </p>
              </div>
            </header>

            <div className="invoice-detail-problem-list">
              {blockingValidationErrors.map((validationError, index) => (
                <div
                  key={`validation-${index}`}
                  className="invoice-detail-problem-item"
                >
                  <span>!</span>
                  <div>
                    <strong>
                      {getFriendlyErrorMessage({
                        code: validationError?.code,
                        message: validationError?.message,
                        stage: 'VALIDATION',
                      })}
                    </strong>
                    <p>
                      Vous pouvez corriger cette information avec le bouton
                      « Vérifier les informations ».
                    </p>
                  </div>
                </div>
              ))}

              {extractionBlockingErrors.map((validationError, index) => (
                <div
                  key={`extraction-${index}`}
                  className="invoice-detail-problem-item"
                >
                  <span>!</span>
                  <div>
                    <strong>
                      {containsTechnicalDetails(validationError)
                        ? 'Une information doit être vérifiée.'
                        : String(validationError)}
                    </strong>
                    <p>
                      Vérifiez les informations de la facture avant de continuer.
                    </p>
                  </div>
                </div>
              ))}

              {hasProblem &&
                blockingValidationErrors.length === 0 &&
                extractionBlockingErrors.length === 0 && (
                  <div className="invoice-detail-problem-item">
                    <span>!</span>
                    <div>
                      <strong>{friendlyErrorMessage}</strong>
                      <p>
                        Vous pouvez corriger les informations ou réessayer
                        selon le cas.
                      </p>
                    </div>
                  </div>
                )}
            </div>
          </section>
        )}

        {!isAccepted && (
          <section className="invoice-detail-final-action">
            <div>
              <span>Besoin de modifier quelque chose ?</span>
              <h2>Vérifiez votre facture avant de continuer</h2>
              <p>
                Si une information n’est pas correcte, modifiez-la.
                Si tout est correct, continuez.
              </p>
            </div>

            <div className="invoice-detail-final-action__buttons">
              <button
                type="button"
                className="invoice-detail-secondary-button"
                onClick={startEditing}
              >
                Modifier
              </button>

              {canApprove && (
                <button
                  type="button"
                  className="invoice-detail-primary-button invoice-detail-primary-button--success"
                  disabled={approving}
                  onClick={handleApprove}
                >
                  {approving
                    ? 'Validation en cours...'
                    : 'Tout est correct, continuer'}
                </button>
              )}
            </div>
          </section>
        )}

        {isAccepted && (
          <section className="invoice-detail-success-final">
            <span>✓</span>
            <div>
              <h2>Facture terminée</h2>
              <p>
                Aucune action n’est nécessaire. Cette facture a terminé
                son traitement.
              </p>
            </div>
          </section>
        )}

        <div className="invoice-detail-bottom-link">
      
        </div>
      </main>

      <AuthenticatedFooter />
    </div>
  );
}

export default InvoiceDetailPage;
