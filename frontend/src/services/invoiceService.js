const CONFIGURED_API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  '';

const API_BASE_URL =
  CONFIGURED_API_BASE_URL ||
  'http://localhost:3000/api';

function getPublicApiBaseUrl() {
  if (typeof window !== 'undefined') {
    const hostname =
      window.location.hostname;

    if (hostname) {
      return `http://${hostname}:3000/api`;
    }
  }

  return (
    CONFIGURED_API_BASE_URL ||
    'http://localhost:3000/api'
  );
}

function getToken() {
  return (
    localStorage.getItem('auth_token') ||
    localStorage.getItem('token') ||
    localStorage.getItem('accessToken') ||
    localStorage.getItem('authToken') ||
    ''
  );
}

function getAuthorizationHeaders() {
  const token =
    getToken();

  if (!token) {
    throw new Error(
      'Utilisateur non authentifié.',
    );
  }

  return {
    Authorization:
      `Bearer ${token}`,
  };
}

async function parseResponse(
  response,
) {
  let data = null;

  try {
    data =
      await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const error =
      new Error(
        data?.message ||
        data?.error ||
        `Erreur HTTP ${response.status}`,
      );

    error.status =
      response.status;

    error.data =
      data;

    throw error;
  }

  return data;
}

async function parsePublicVerificationResponse(
  response,
) {
  let data = null;

  try {
    data =
      await response.json();
  } catch {
    data = null;
  }

  if (data) {
    return {
      ...data,
      http_status:
        response.status,
    };
  }

  if (!response.ok) {
    throw new Error(
      `Erreur HTTP ${response.status}`,
    );
  }

  return {
    success: false,
    valid: false,
    verification_status:
      'UNKNOWN',
    message:
      'Réponse de vérification invalide.',
    http_status:
      response.status,
  };
}

function parseJsonField(
  value,
) {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return null;
  }

  if (
    typeof value ===
    'object'
  ) {
    return value;
  }

  if (
    typeof value !==
    'string'
  ) {
    return value;
  }

  try {
    return JSON.parse(
      value,
    );
  } catch {
    return value;
  }
}

function normalizeInvoice(
  invoice,
) {
  if (!invoice) {
    return invoice;
  }

  const extractedData =
    parseJsonField(
      invoice.extracted_data,
    );

  const validationErrors =
    parseJsonField(
      invoice.validation_errors,
    );

  return {
    ...invoice,
    extracted_data:
      extractedData,
    extracted_data_object:
      invoice.extracted_data_object ||
      extractedData ||
      null,
    validation_errors:
      Array.isArray(
        validationErrors,
      )
        ? validationErrors
        : [],
    xml_available:
      Boolean(
        invoice.xml_available ||
        invoice.signed_xml_path,
      ),
  };
}

async function throwBlobResponseError(
  response,
) {
  let data = null;

  try {
    data =
      await response.json();
  } catch {
    data = null;
  }

  const error =
    new Error(
      data?.message ||
      data?.error ||
      `Erreur HTTP ${response.status}`,
    );

  error.status =
    response.status;
  error.data =
    data;

  throw error;
}

function getFilenameFromResponse(
  response,
  fallbackFilename,
) {
  const contentDisposition =
    response.headers.get(
      'content-disposition',
    ) ||
    '';

  let filename =
    '';

  const utf8FilenameMatch =
    contentDisposition.match(
      /filename\*=UTF-8''([^;]+)/i,
    );

  const normalFilenameMatch =
    contentDisposition.match(
      /filename="?([^";]+)"?/i,
    );

  if (
    utf8FilenameMatch?.[1]
  ) {
    try {
      filename =
        decodeURIComponent(
          utf8FilenameMatch[1],
        );
    } catch {
      filename =
        utf8FilenameMatch[1];
    }
  } else if (
    normalFilenameMatch?.[1]
  ) {
    filename =
      normalFilenameMatch[1];
  }

  return (
    filename ||
    fallbackFilename
  );
}

export async function verifyInvoiceByToken(
  token,
) {
  if (!token) {
    throw new Error(
      'Token de vérification manquant.',
    );
  }

  const publicApiBaseUrl =
    getPublicApiBaseUrl();

  const response =
    await fetch(
      `${publicApiBaseUrl}/invoices/public/verify/${encodeURIComponent(
        token,
      )}`,
      {
        method: 'GET',
        headers: {
          Accept:
            'application/json',
          'Cache-Control':
            'no-cache',
          Pragma:
            'no-cache',
        },
        cache: 'no-store',
      },
    );

  return (
    parsePublicVerificationResponse(
      response,
    )
  );
}

export async function getInvoices() {
  const response =
    await fetch(
      `${API_BASE_URL}/invoices`,
      {
        method: 'GET',
        headers: {
          ...getAuthorizationHeaders(),
          Accept:
            'application/json',
          'Cache-Control':
            'no-cache',
          Pragma:
            'no-cache',
        },
        cache: 'no-store',
      },
    );

  const data =
    await parseResponse(
      response,
    );

  if (
    Array.isArray(
      data?.invoices,
    )
  ) {
    data.invoices =
      data.invoices.map(
        normalizeInvoice,
      );
  }

  return data;
}

export async function getInvoiceById(
  invoiceId,
) {
  if (!invoiceId) {
    throw new Error(
      'Identifiant facture manquant.',
    );
  }

  const response =
    await fetch(
      `${API_BASE_URL}/invoices/${encodeURIComponent(
        invoiceId,
      )}`,
      {
        method: 'GET',
        headers: {
          ...getAuthorizationHeaders(),
          Accept:
            'application/json',
          'Cache-Control':
            'no-cache',
          Pragma:
            'no-cache',
        },
        cache: 'no-store',
      },
    );

  const data =
    await parseResponse(
      response,
    );

  if (data?.invoice) {
    data.invoice =
      normalizeInvoice(
        data.invoice,
      );
  }

  return data;
}

/*
|--------------------------------------------------------------------------
| MISSION 3 - DOCUMENT ORIGINAL
|--------------------------------------------------------------------------
*/

export async function getInvoiceOriginalDocument(
  invoiceId,
) {
  if (!invoiceId) {
    throw new Error(
      'Identifiant facture manquant.',
    );
  }

  const response =
    await fetch(
      `${API_BASE_URL}/invoices/${encodeURIComponent(
        invoiceId,
      )}/original`,
      {
        method: 'GET',
        headers: {
          ...getAuthorizationHeaders(),
          Accept:
            'application/pdf,image/png,image/jpeg,image/webp,*/*',
          'Cache-Control':
            'no-cache',
          Pragma:
            'no-cache',
        },
        cache: 'no-store',
      },
    );

  if (!response.ok) {
    await throwBlobResponseError(
      response,
    );
  }

  const blob =
    await response.blob();

  return {
    blob,
    filename:
      getFilenameFromResponse(
        response,
        `facture-${invoiceId}`,
      ),
    contentType:
      response.headers.get(
        'content-type',
      ) ||
      blob.type ||
      '',
  };
}

export async function updateInvoiceById(
  invoiceId,
  payload,
) {
  if (!invoiceId) {
    throw new Error(
      'Identifiant facture manquant.',
    );
  }

  const response =
    await fetch(
      `${API_BASE_URL}/invoices/${encodeURIComponent(
        invoiceId,
      )}`,
      {
        method: 'PUT',
        headers: {
          ...getAuthorizationHeaders(),
          Accept:
            'application/json',
          'Content-Type':
            'application/json',
          'Cache-Control':
            'no-cache',
          Pragma:
            'no-cache',
        },
        body:
          JSON.stringify(
            payload,
          ),
        cache: 'no-store',
      },
    );

  const data =
    await parseResponse(
      response,
    );

  if (data?.invoice) {
    data.invoice =
      normalizeInvoice(
        data.invoice,
      );
  }

  return data;
}

export async function uploadInvoice(
  file,
  source = 'PDF',
) {
  if (!file) {
    throw new Error(
      'Aucun fichier sélectionné.',
    );
  }

  const formData =
    new FormData();

  formData.append(
    'file',
    file,
  );

  formData.append(
    'source',
    source,
  );

  const response =
    await fetch(
      `${API_BASE_URL}/invoices/upload`,
      {
        method: 'POST',
        headers: {
          ...getAuthorizationHeaders(),
        },
        body: formData,
        cache: 'no-store',
      },
    );

  const data =
    await parseResponse(
      response,
    );

  if (data?.invoice) {
    data.invoice =
      normalizeInvoice(
        data.invoice,
      );
  }

  return data;
}

export async function importInvoiceFromErp(
  payload,
) {
  const invoiceNumber =
    String(
      payload?.invoice_number ||
      '',
    ).trim();

  const clientCode =
    String(
      payload?.client_code ||
      '',
    ).trim();

  if (!invoiceNumber) {
    throw new Error(
      'Le numéro de facture ERP est obligatoire.',
    );
  }

  if (!clientCode) {
    throw new Error(
      'Le code client ERP est obligatoire.',
    );
  }

  const response =
    await fetch(
      `${API_BASE_URL}/invoices/import-erp`,
      {
        method: 'POST',
        headers: {
          ...getAuthorizationHeaders(),
          Accept:
            'application/json',
          'Content-Type':
            'application/json',
          'Cache-Control':
            'no-cache',
          Pragma:
            'no-cache',
        },
        body:
          JSON.stringify({
            invoice_number:
              invoiceNumber,
            client_code:
              clientCode,
          }),
        cache: 'no-store',
      },
    );

  const data =
    await parseResponse(
      response,
    );

  if (data?.invoice) {
    data.invoice =
      normalizeInvoice(
        data.invoice,
      );
  }

  if (data?.existing_invoice) {
    data.existing_invoice =
      normalizeInvoice(
        data.existing_invoice,
      );
  }

  return data;
}

export async function retryInvoice(
  invoiceId,
) {
  if (!invoiceId) {
    throw new Error(
      'Identifiant facture manquant.',
    );
  }

  const response =
    await fetch(
      `${API_BASE_URL}/invoices/${encodeURIComponent(
        invoiceId,
      )}/retry`,
      {
        method: 'POST',
        headers: {
          ...getAuthorizationHeaders(),
          Accept:
            'application/json',
          'Content-Type':
            'application/json',
          'Cache-Control':
            'no-cache',
          Pragma:
            'no-cache',
        },
        body:
          JSON.stringify({}),
        cache: 'no-store',
      },
    );

  const data =
    await parseResponse(
      response,
    );

  if (data?.invoice) {
    data.invoice =
      normalizeInvoice(
        data.invoice,
      );
  }

  return data;
}

export async function retryErpInvoice(
  invoiceId,
  payload,
) {
  if (!invoiceId) {
    throw new Error(
      'Identifiant facture manquant.',
    );
  }

  const invoiceNumber =
    String(
      payload?.invoice_number ||
      '',
    ).trim();

  const clientCode =
    String(
      payload?.client_code ||
      '',
    ).trim();

  if (!invoiceNumber) {
    throw new Error(
      'Le numéro de facture ERP est obligatoire.',
    );
  }

  if (!clientCode) {
    throw new Error(
      'Le code client ERP est obligatoire.',
    );
  }

  const response =
    await fetch(
      `${API_BASE_URL}/invoices/${encodeURIComponent(
        invoiceId,
      )}/retry-erp`,
      {
        method: 'POST',
        headers: {
          ...getAuthorizationHeaders(),
          Accept:
            'application/json',
          'Content-Type':
            'application/json',
          'Cache-Control':
            'no-cache',
          Pragma:
            'no-cache',
        },
        body:
          JSON.stringify({
            invoice_number:
              invoiceNumber,
            client_code:
              clientCode,
          }),
        cache: 'no-store',
      },
    );

  const data =
    await parseResponse(
      response,
    );

  if (data?.invoice) {
    data.invoice =
      normalizeInvoice(
        data.invoice,
      );
  }

  return data;
}

export async function humanCorrectionInvoice(
  invoiceId,
  payload,
) {
  if (!invoiceId) {
    throw new Error(
      'Identifiant facture manquant.',
    );
  }

  if (
    !payload ||
    typeof payload !== 'object'
  ) {
    throw new Error(
      'Données de correction manquantes.',
    );
  }

  const response =
    await fetch(
      `${API_BASE_URL}/invoices/${encodeURIComponent(
        invoiceId,
      )}/human-correction`,
      {
        method: 'POST',
        headers: {
          ...getAuthorizationHeaders(),
          Accept:
            'application/json',
          'Content-Type':
            'application/json',
          'Cache-Control':
            'no-cache',
          Pragma:
            'no-cache',
        },
        body:
          JSON.stringify(
            payload,
          ),
        cache: 'no-store',
      },
    );

  const data =
    await parseResponse(
      response,
    );

  if (data?.invoice) {
    data.invoice =
      normalizeInvoice(
        data.invoice,
      );
  }

  return data;
}

export async function approveInvoiceExtraction(
  invoiceId,
) {
  if (!invoiceId) {
    throw new Error(
      'Identifiant facture manquant.',
    );
  }

  const response =
    await fetch(
      `${API_BASE_URL}/invoices/${encodeURIComponent(
        invoiceId,
      )}/approve-extraction`,
      {
        method: 'POST',
        headers: {
          ...getAuthorizationHeaders(),
          Accept:
            'application/json',
          'Content-Type':
            'application/json',
          'Cache-Control':
            'no-cache',
          Pragma:
            'no-cache',
        },
        body:
          JSON.stringify({}),
        cache: 'no-store',
      },
    );

  const data =
    await parseResponse(
      response,
    );

  if (data?.invoice) {
    data.invoice =
      normalizeInvoice(
        data.invoice,
      );
  }

  return data;
}

export async function deleteInvoice(
  invoiceId,
) {
  if (!invoiceId) {
    throw new Error(
      'Identifiant facture manquant.',
    );
  }

  const response =
    await fetch(
      `${API_BASE_URL}/invoices/${encodeURIComponent(
        invoiceId,
      )}`,
      {
        method: 'DELETE',
        headers: {
          ...getAuthorizationHeaders(),
          Accept:
            'application/json',
          'Content-Type':
            'application/json',
          'Cache-Control':
            'no-cache',
          Pragma:
            'no-cache',
        },
        cache: 'no-store',
      },
    );

  return parseResponse(
    response,
  );
}

async function getInvoiceXmlBlob(
  invoiceId,
  {
    download = false,
  } = {},
) {
  if (!invoiceId) {
    throw new Error(
      'Identifiant facture manquant.',
    );
  }

  const suffix =
    download
      ? '/download'
      : '';

  const response =
    await fetch(
      `${API_BASE_URL}/invoices/${encodeURIComponent(
        invoiceId,
      )}/xml${suffix}`,
      {
        method: 'GET',
        headers: {
          ...getAuthorizationHeaders(),
          Accept:
            'application/xml,text/xml,*/*',
          'Cache-Control':
            'no-cache',
          Pragma:
            'no-cache',
        },
        cache: 'no-store',
      },
    );

  if (!response.ok) {
    await throwBlobResponseError(
      response,
    );
  }

  const blob =
    await response.blob();

  return {
    blob,
    filename:
      getFilenameFromResponse(
        response,
        `facture-${invoiceId}.xml`,
      ),
  };
}

export async function viewInvoiceXml(
  invoiceId,
) {
  if (!invoiceId) {
    throw new Error(
      'Identifiant facture manquant.',
    );
  }

  const previewWindow =
    typeof window !== 'undefined'
      ? window.open('', '_blank')
      : null;

  try {
    const { blob } =
      await getInvoiceXmlBlob(
        invoiceId,
      );

    const objectUrl =
      URL.createObjectURL(
        blob,
      );

    if (
      previewWindow &&
      !previewWindow.closed
    ) {
      previewWindow.location.href =
        objectUrl;
    } else if (
      typeof window !== 'undefined'
    ) {
      window.open(
        objectUrl,
        '_blank',
        'noopener,noreferrer',
      );
    }

    window.setTimeout(
      () => {
        URL.revokeObjectURL(
          objectUrl,
        );
      },
      60000,
    );

    return {
      success: true,
    };
  } catch (error) {
    if (
      previewWindow &&
      !previewWindow.closed
    ) {
      previewWindow.close();
    }

    throw error;
  }
}

export async function downloadInvoiceXml(
  invoiceId,
  fallbackInvoiceNumber = '',
) {
  if (!invoiceId) {
    throw new Error(
      'Identifiant facture manquant.',
    );
  }

  const {
    blob,
    filename,
  } =
    await getInvoiceXmlBlob(
      invoiceId,
      {
        download: true,
      },
    );

  const objectUrl =
    URL.createObjectURL(
      blob,
    );

  const anchor =
    document.createElement('a');

  const safeInvoiceNumber =
    String(
      fallbackInvoiceNumber ||
      '',
    )
      .trim()
      .replace(
        /[^a-zA-Z0-9._-]+/g,
        '-',
      );

  anchor.href =
    objectUrl;

  anchor.download =
    filename ||
    (
      safeInvoiceNumber
        ? `facture-${safeInvoiceNumber}.xml`
        : `facture-${invoiceId}.xml`
    );

  document.body.appendChild(
    anchor,
  );

  anchor.click();
  anchor.remove();

  window.setTimeout(
    () => {
      URL.revokeObjectURL(
        objectUrl,
      );
    },
    1000,
  );

  return {
    success: true,
    filename:
      anchor.download,
  };
}
