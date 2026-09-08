const API_BASE_URL =
  import.meta.env
    .VITE_API_BASE_URL ||
  import.meta.env
    .VITE_API_URL ||
  'http://localhost:3000/api';

/*
|--------------------------------------------------------------------------
| AUTH TOKEN
|--------------------------------------------------------------------------
*/

function getAuthToken() {
  return (
    localStorage.getItem(
      'auth_token',
    ) ||
    localStorage.getItem(
      'token',
    ) ||
    localStorage.getItem(
      'accessToken',
    ) ||
    localStorage.getItem(
      'authToken',
    ) ||
    ''
  );
}

/*
|--------------------------------------------------------------------------
| GENERIC REQUEST
|--------------------------------------------------------------------------
*/

async function request(
  path,
  options = {},
) {
  const token =
    getAuthToken();

  const response =
    await fetch(
      `${API_BASE_URL}${path}`,
      {
        ...options,

        cache:
          'no-store',

        headers: {
          Accept:
            'application/json',

          'Content-Type':
            'application/json',

          'Cache-Control':
            'no-cache',

          Pragma:
            'no-cache',

          ...(token
            ? {
                Authorization:
                  `Bearer ${token}`,
              }
            : {}),

          ...options.headers,
        },
      },
    );

  let data = null;

  try {
    data =
      await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(
      data?.message ||
        data?.error ||
        `Erreur HTTP ${response.status}`,
    );
  }

  return data;
}

/*
|--------------------------------------------------------------------------
| CLIENT DASHBOARD
|--------------------------------------------------------------------------
*/

export async function getClientDashboard() {
  return request(
    '/client/dashboard',
  );
}

/*
|--------------------------------------------------------------------------
| MONTHLY FINANCIAL DIGEST
|--------------------------------------------------------------------------
*/

export async function getMonthlyFinancialDigest({
  year,
  month,
} = {}) {
  const params =
    new URLSearchParams();

  if (year) {
    params.set(
      'year',
      String(year),
    );
  }

  if (month) {
    params.set(
      'month',
      String(month),
    );
  }

  const query =
    params.toString();

  const response =
    await request(
      `/client-dashboard/monthly-digest${
        query
          ? `?${query}`
          : ''
      }`,
    );

  return (
    response?.digest ||
    null
  );
}

/*
|--------------------------------------------------------------------------
| CLIENT INVOICES
|--------------------------------------------------------------------------
*/

export async function getClientInvoices({
  status = '',
  page = 1,
  limit = 20,
} = {}) {
  const params =
    new URLSearchParams();

  if (status) {
    params.set(
      'status',
      status,
    );
  }

  params.set(
    'page',
    String(page),
  );

  params.set(
    'limit',
    String(limit),
  );

  return request(
    `/client/invoices?${params.toString()}`,
  );
}

/*
|--------------------------------------------------------------------------
| ONE INVOICE
|--------------------------------------------------------------------------
*/

export async function getInvoiceById(
  invoiceId,
) {
  if (!invoiceId) {
    throw new Error(
      'Identifiant facture manquant',
    );
  }

  return request(
    `/client/invoices/${encodeURIComponent(
      invoiceId,
    )}`,
  );
}

/*
|--------------------------------------------------------------------------
| RETRY INVOICE
|--------------------------------------------------------------------------
*/

export async function retryInvoice(
  invoiceId,
) {
  if (!invoiceId) {
    throw new Error(
      'Identifiant facture manquant',
    );
  }

  return request(
    `/client/invoices/${encodeURIComponent(
      invoiceId,
    )}/retry`,
    {
      method:
        'POST',
    },
  );
}

/*
|--------------------------------------------------------------------------
| DELETE DUPLICATES
|--------------------------------------------------------------------------
*/

export async function deleteInvoiceDuplicates(
  invoiceId,
) {
  if (!invoiceId) {
    throw new Error(
      'Identifiant facture manquant',
    );
  }

  return request(
    `/client/invoices/${encodeURIComponent(
      invoiceId,
    )}/duplicates`,
    {
      method:
        'DELETE',
    },
  );
}

/*
|--------------------------------------------------------------------------
| UPLOAD INVOICE
|--------------------------------------------------------------------------
*/

export async function uploadInvoice(
  file,
  source = 'PDF',
) {
  if (!file) {
    throw new Error(
      'Aucun fichier sélectionné',
    );
  }

  const token =
    getAuthToken();

  const formData =
    new FormData();

  formData.append(
    'invoice',
    file,
  );

  formData.append(
    'source',
    source,
  );

  const response =
    await fetch(
      `${API_BASE_URL}/client/invoices/upload`,
      {
        method:
          'POST',

        cache:
          'no-store',

        headers: {
          'Cache-Control':
            'no-cache',

          Pragma:
            'no-cache',

          ...(token
            ? {
                Authorization:
                  `Bearer ${token}`,
              }
            : {}),
        },

        body:
          formData,
      },
    );

  let data = null;

  try {
    data =
      await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(
      data?.message ||
        data?.error ||
        'Impossible d’importer la facture',
    );
  }

  return data;
}