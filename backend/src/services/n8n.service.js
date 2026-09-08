const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

/*
|--------------------------------------------------------------------------
| CONFIGURATION
|--------------------------------------------------------------------------
*/

const N8N_BASE_URL =
  process.env.N8N_BASE_URL ||
  'http://localhost:5678';

/*
|--------------------------------------------------------------------------
| WEBHOOK PRODUCTION
|--------------------------------------------------------------------------
|
| IMPORTANT :
|
| Le site doit utiliser le webhook PRODUCTION.
|
| Il n'est donc plus nécessaire de cliquer sur :
|
| - Execute workflow
| - Listen for test event
|
| Le workflow n8n doit simplement être publié / actif.
|
|--------------------------------------------------------------------------
*/

const N8N_PDF_WEBHOOK =
  '/webhook/client-invoices-pdf';

const N8N_WORKFLOW_MODE =
  String(
    process.env.N8N_WORKFLOW_MODE ||
      'demo',
  )
    .trim()
    .toLowerCase();

const N8N_DEMO_SCENARIO =
  String(
    process.env.N8N_DEMO_SCENARIO ||
      'accepted',
  )
    .trim()
    .toLowerCase();

/*
|--------------------------------------------------------------------------
| BUILD WEBHOOK URL
|--------------------------------------------------------------------------
*/

function getInvoiceWebhookUrl() {
  return (
    `${N8N_BASE_URL}` +
    `${N8N_PDF_WEBHOOK}`
  );
}

/*
|--------------------------------------------------------------------------
| SEND INVOICE TO N8N
|--------------------------------------------------------------------------
*/

async function sendInvoiceToN8n({
  filePath,
  originalName,
  platformInvoiceId,
  userId,
  organizationId,
}) {
  /*
  |--------------------------------------------------------------------------
  | FILE
  |--------------------------------------------------------------------------
  */

  if (
    !filePath ||
    !fs.existsSync(filePath)
  ) {
    throw new Error(
      `Fichier introuvable : ${filePath}`,
    );
  }

  /*
  |--------------------------------------------------------------------------
  | WEBHOOK URL
  |--------------------------------------------------------------------------
  */

  const webhookUrl =
    getInvoiceWebhookUrl();

  /*
  |--------------------------------------------------------------------------
  | FORM DATA
  |--------------------------------------------------------------------------
  */

  const form =
    new FormData();

  /*
  |--------------------------------------------------------------------------
  | PDF / IMAGE
  |--------------------------------------------------------------------------
  |
  | Ton workflow n8n attend :
  |
  | binary.data
  |
  |--------------------------------------------------------------------------
  */

  form.append(
    'data',
    fs.createReadStream(
      filePath,
    ),
    {
      filename:
        originalName,
    },
  );

  /*
  |--------------------------------------------------------------------------
  | PLATFORM INVOICE ID
  |--------------------------------------------------------------------------
  */

  form.append(
    'platform_invoice_id',
    String(
      platformInvoiceId,
    ),
  );

  /*
  |--------------------------------------------------------------------------
  | USER
  |--------------------------------------------------------------------------
  */

  form.append(
    'user_id',
    String(
      userId,
    ),
  );

  /*
  |--------------------------------------------------------------------------
  | ORGANIZATION
  |--------------------------------------------------------------------------
  */

  form.append(
    'organization_id',
    String(
      organizationId,
    ),
  );

  /*
  |--------------------------------------------------------------------------
  | BACKEND CALLBACK
  |--------------------------------------------------------------------------
  */

  if (
    process.env
      .BACKEND_WORKFLOW_CALLBACK_URL
  ) {
    form.append(
      'callback_url',
      process.env
        .BACKEND_WORKFLOW_CALLBACK_URL,
    );
  }

  /*
  |--------------------------------------------------------------------------
  | CALLBACK SECRET
  |--------------------------------------------------------------------------
  */

  if (
    process.env
      .WORKFLOW_CALLBACK_SECRET
  ) {
    form.append(
      'callback_secret',
      process.env
        .WORKFLOW_CALLBACK_SECRET,
    );
  }

  /*
  |--------------------------------------------------------------------------
  | WORKFLOW MODE
  |--------------------------------------------------------------------------
  |
  | On garde ton mode "demo".
  |
  | Cela signifie :
  |
  | vrai pipeline
  | +
  | signature mock
  |
  |--------------------------------------------------------------------------
  */

  form.append(
    'workflow_mode',
    N8N_WORKFLOW_MODE,
  );

  /*
  |--------------------------------------------------------------------------
  | DEMO SCENARIO
  |--------------------------------------------------------------------------
  */

  form.append(
    'scenario',
    N8N_DEMO_SCENARIO,
  );

  /*
  |--------------------------------------------------------------------------
  | LOG
  |--------------------------------------------------------------------------
  */

  console.log(
    '[sendInvoiceToN8n]',
    {
      mode:
        N8N_WORKFLOW_MODE,

      scenario:
        N8N_DEMO_SCENARIO,

      platformInvoiceId,

      webhookUrl,
    },
  );

  /*
  |--------------------------------------------------------------------------
  | REQUEST
  |--------------------------------------------------------------------------
  */

  try {
    const response =
      await axios.post(
        webhookUrl,
        form,
        {
          headers: {
            ...form.getHeaders(),
          },

          timeout:
            30000,

          maxBodyLength:
            Infinity,

          maxContentLength:
            Infinity,
        },
      );

    console.log(
      '[sendInvoiceToN8n] SUCCESS',
      {
        status:
          response.status,

        data:
          response.data,
      },
    );

    return response.data;
  } catch (error) {
    console.error(
      '[sendInvoiceToN8n] ERROR',
      {
        message:
          error.message,

        code:
          error.code,

        status:
          error.response
            ?.status,

        data:
          error.response
            ?.data,

        webhookUrl,
      },
    );

    throw error;
  }
}

/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
  sendInvoiceToN8n,
};