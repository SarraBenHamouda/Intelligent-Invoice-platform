/*
|--------------------------------------------------------------------------
| MONTHLY DIGEST AI SERVICE
|--------------------------------------------------------------------------
|
| Objectif :
| - recevoir les statistiques mensuelles calculées par SQL Server
| - envoyer les données à Ollama / Mistral
| - récupérer un résumé financier structuré
| - valider le JSON produit par l'IA
| - appliquer des règles métier déterministes
| - ne jamais casser le dashboard si Ollama échoue
|
|--------------------------------------------------------------------------
*/

const axios = require('axios');

/*
|--------------------------------------------------------------------------
| CONFIGURATION OLLAMA
|--------------------------------------------------------------------------
*/

const OLLAMA_BASE_URL =
  'http://127.0.0.1:11434';

const OLLAMA_MODEL =
  'mistral:latest';

const OLLAMA_TIMEOUT =
  180000;

/*
|--------------------------------------------------------------------------
| NUMBER HELPERS
|--------------------------------------------------------------------------
*/

function toNumber(
  value,
  fallback = 0,
) {
  const numericValue =
    Number(value);

  if (
    !Number.isFinite(
      numericValue,
    )
  ) {
    return fallback;
  }

  return numericValue;
}

function toOptionalNumber(
  value,
) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const numericValue =
    Number(value);

  if (
    !Number.isFinite(
      numericValue,
    )
  ) {
    return null;
  }

  return numericValue;
}

/*
|--------------------------------------------------------------------------
| STRING HELPERS
|--------------------------------------------------------------------------
*/

function cleanString(
  value,
  fallback = '',
) {
  const normalized =
    String(
      value ?? '',
    ).trim();

  return (
    normalized ||
    fallback
  );
}

function limitText(
  value,
  maxLength = 500,
) {
  const text =
    cleanString(
      value,
    );

  if (
    text.length <=
    maxLength
  ) {
    return text;
  }

  return `${text.slice(
    0,
    maxLength,
  )}…`;
}

/*
|--------------------------------------------------------------------------
| SANITIZE SUPPLIERS
|--------------------------------------------------------------------------
*/

function sanitizeSuppliers(
  suppliers,
) {
  if (
    !Array.isArray(
      suppliers,
    )
  ) {
    return [];
  }

  return suppliers
    .slice(
      0,
      5,
    )
    .map(
      (
        supplier,
      ) => ({
        supplier_identifier:
          cleanString(
            supplier
              ?.supplier_identifier,
            'Non renseigné',
          ),

        invoice_count:
          toNumber(
            supplier
              ?.invoice_count,
          ),

        total_ttc:
          toNumber(
            supplier
              ?.total_ttc,
          ),

        average_ttc:
          toNumber(
            supplier
              ?.average_ttc,
          ),
      }),
    );
}

/*
|--------------------------------------------------------------------------
| SANITIZE ERRORS
|--------------------------------------------------------------------------
*/

function sanitizeErrors(
  errors,
) {
  if (
    !Array.isArray(
      errors,
    )
  ) {
    return [];
  }

  return errors
    .slice(
      0,
      5,
    )
    .map(
      (
        error,
      ) => ({
        code:
          cleanString(
            error?.code ||
            error
              ?.error_code,
            'UNKNOWN',
          ),

        count:
          toNumber(
            error?.count ??
            error
              ?.error_count,
          ),

        example_message:
          limitText(
            error
              ?.example_message ||
            error
              ?.last_error_message ||
            '',
            350,
          ) ||
          null,
      }),
    );
}

/*
|--------------------------------------------------------------------------
| BUILD DIGEST INPUT
|--------------------------------------------------------------------------
*/

function buildDigestInput({
  summary = {},
  ttn = {},
  trend = {},
  topSuppliers = [],
  topErrors = [],
  currentPeriodLabel = '',
  previousPeriodLabel = '',
}) {
  return {
    period: {
      current:
        cleanString(
          currentPeriodLabel,
          'Mois courant',
        ),

      previous:
        cleanString(
          previousPeriodLabel,
          'Mois précédent',
        ),
    },

    financial_summary: {
      invoice_count:
        toNumber(
          summary.invoice_count,
        ),

      total_ht:
        toNumber(
          summary.total_ht,
        ),

      total_tva:
        toNumber(
          summary.total_tva,
        ),

      total_ttc:
        toNumber(
          summary.total_ttc,
        ),

      average_invoice_ttc:
        toNumber(
          summary
            .average_invoice_ttc,
        ),
    },

    ttn: {
      total_invoices:
        toNumber(
          ttn.total_invoices,
        ),

      accepted:
        toNumber(
          ttn.accepted_count ??
          ttn.accepted,
        ),

      rejected:
        toNumber(
          ttn.rejected_count ??
          ttn.rejected,
        ),

      errors:
        toNumber(
          ttn.error_count ??
          ttn.errors,
        ),

      pending_retry:
        toNumber(
          ttn
            .pending_retry_count ??
          ttn.pending_retry,
        ),

      pending_review:
        toNumber(
          ttn
            .pending_review_count ??
          ttn.pending_review,
        ),

      processing:
        toNumber(
          ttn.processing_count ??
          ttn.processing,
        ),

      acceptance_rate:
        toOptionalNumber(
          ttn.acceptance_rate,
        ),
    },

    trend: {
      direction:
        cleanString(
          trend.trend_direction ||
          trend.direction,
          'STABLE',
        ),

      current_invoice_count:
        toNumber(
          trend
            .current_invoice_count,
        ),

      previous_invoice_count:
        toNumber(
          trend
            .previous_invoice_count,
        ),

      invoice_count_change_percent:
        toOptionalNumber(
          trend
            .invoice_count_change_percent,
        ),

      current_total_ttc:
        toNumber(
          trend
            .current_total_ttc,
        ),

      previous_total_ttc:
        toNumber(
          trend
            .previous_total_ttc,
        ),

      total_ttc_change_percent:
        toOptionalNumber(
          trend
            .total_ttc_change_percent,
        ),

      current_acceptance_rate:
        toOptionalNumber(
          trend
            .current_acceptance_rate,
        ),

      previous_acceptance_rate:
        toOptionalNumber(
          trend
            .previous_acceptance_rate,
        ),

      acceptance_rate_change:
        toOptionalNumber(
          trend
            .acceptance_rate_change,
        ),
    },

    top_suppliers:
      sanitizeSuppliers(
        topSuppliers,
      ),

    top_errors:
      sanitizeErrors(
        topErrors,
      ),
  };
}

/*
|--------------------------------------------------------------------------
| SYSTEM PROMPT
|--------------------------------------------------------------------------
*/

function buildSystemPrompt() {
  return `
Tu es un analyste spécialisé dans la facturation électronique et le suivi financier mensuel.

Tu analyses uniquement les données JSON fournies.

Contexte :
- extraction des factures ;
- validation ;
- génération TEIF ;
- signature électronique ;
- transmission TTN.

Le résultat est destiné à un client professionnel.

RÈGLES ABSOLUES :

1. Réponds uniquement en français.
2. N'invente aucune donnée.
3. N'invente aucun fournisseur.
4. Un identifiant fournisseur doit rester un identifiant.
5. N'invente aucune devise.
6. Ne donne aucun conseil juridique, fiscal ou comptable.
7. Utilise uniquement les chiffres présents dans le JSON.
8. Si previous_invoice_count = 0 et direction = NEW_ACTIVITY, ne parle jamais de hausse, croissance ou baisse.
9. Dans ce cas, indique qu'aucune comparaison fiable avec le mois précédent n'est possible.
10. Si acceptance_rate = 100, tu peux indiquer que toutes les factures ont été acceptées.
11. Si top_errors est vide, indique qu'aucune erreur significative n'a été détectée.
12. Si aucune donnée ne justifie un risque, retourne [].
13. Ne retourne aucun Markdown.
14. Ne retourne aucun texte avant le JSON.
15. Ne retourne aucun texte après le JSON.

IMPORTANT SUR LES DEVISES :

Aucune devise n'est fournie dans les données.
N'écris donc jamais :
€, EUR, TND, $, USD ou toute autre devise.

Écris seulement les montants numériques.

Retourne STRICTEMENT :

{
  "headline": "Titre court",
  "summary": "Résumé professionnel du mois en 2 à 4 phrases.",
  "insights": [
    "Observation importante 1",
    "Observation importante 2"
  ],
  "highlights": [
    "Point positif important"
  ],
  "risks": [],
  "recommendations": [],
  "trend_label": "Nouvelle activité"
}

Valeurs autorisées pour trend_label :
- Nouvelle activité
- En progression
- En baisse
- Stable
`.trim();
}

/*
|--------------------------------------------------------------------------
| USER PROMPT
|--------------------------------------------------------------------------
*/

function buildUserPrompt(
  digestData,
) {
  return `
Analyse ces statistiques mensuelles provenant de SQL Server.

Données :

${JSON.stringify(
  digestData,
  null,
  2,
)}
`.trim();
}

/*
|--------------------------------------------------------------------------
| JSON EXTRACTION
|--------------------------------------------------------------------------
*/

function extractJsonText(
  value,
) {
  let text =
    cleanString(
      value,
    );

  if (!text) {
    return '';
  }

  text =
    text.replace(
      /^```json\s*/i,
      '',
    );

  text =
    text.replace(
      /^```\s*/i,
      '',
    );

  text =
    text.replace(
      /\s*```$/i,
      '',
    );

  text =
    text.trim();

  const firstBrace =
    text.indexOf(
      '{',
    );

  const lastBrace =
    text.lastIndexOf(
      '}',
    );

  if (
    firstBrace >= 0 &&
    lastBrace >
      firstBrace
  ) {
    return text.slice(
      firstBrace,
      lastBrace + 1,
    );
  }

  return text;
}

/*
|--------------------------------------------------------------------------
| ARRAY NORMALIZATION
|--------------------------------------------------------------------------
*/

function normalizeStringArray(
  value,
  maxItems = 5,
) {
  if (
    !Array.isArray(
      value,
    )
  ) {
    return [];
  }

  return value
    .map(
      (
        item,
      ) =>
        cleanString(
          item,
        ),
    )
    .filter(Boolean)
    .slice(
      0,
      maxItems,
    );
}

/*
|--------------------------------------------------------------------------
| TREND LABEL
|--------------------------------------------------------------------------
*/

function normalizeTrendLabel(
  value,
  direction,
) {
  const allowed = [
    'Nouvelle activité',
    'En progression',
    'En baisse',
    'Stable',
  ];

  const normalized =
    cleanString(
      value,
    );

  if (
    allowed.includes(
      normalized,
    )
  ) {
    return normalized;
  }

  switch (
    String(
      direction || '',
    )
      .trim()
      .toUpperCase()
  ) {
    case 'NEW_ACTIVITY':
      return 'Nouvelle activité';

    case 'UP':
      return 'En progression';

    case 'DOWN':
      return 'En baisse';

    default:
      return 'Stable';
  }
}

/*
|--------------------------------------------------------------------------
| REMOVE INVENTED CURRENCY
|--------------------------------------------------------------------------
*/

function removeInventedCurrency(
  text,
) {
  if (!text) {
    return text;
  }

  return String(text)
    .replace(
      /\s*(?:€|\$|EUR\b|TND\b|USD\b)/gi,
      '',
    )
    .replace(
      /\s{2,}/g,
      ' ',
    )
    .replace(
      /\s+([.,;:!?])/g,
      '$1',
    )
    .trim();
}

/*
|--------------------------------------------------------------------------
| BUSINESS RULES
|--------------------------------------------------------------------------
*/

function enforceBusinessRules(
  aiResponse,
  digestData,
) {
  const result = {
    ...aiResponse,

    insights:
      Array.isArray(
        aiResponse.insights,
      )
        ? [
            ...aiResponse.insights,
          ]
        : [],

    highlights:
      Array.isArray(
        aiResponse.highlights,
      )
        ? [
            ...aiResponse.highlights,
          ]
        : [],

    risks:
      Array.isArray(
        aiResponse.risks,
      )
        ? [
            ...aiResponse.risks,
          ]
        : [],

    recommendations:
      Array.isArray(
        aiResponse.recommendations,
      )
        ? [
            ...aiResponse.recommendations,
          ]
        : [],
  };

  const direction =
    String(
      digestData
        ?.trend
        ?.direction ||
      '',
    )
      .trim()
      .toUpperCase();

  const previousInvoiceCount =
    Number(
      digestData
        ?.trend
        ?.previous_invoice_count ||
      0,
    );

  /*
  |--------------------------------------------------------------------------
  | NEW ACTIVITY
  |--------------------------------------------------------------------------
  */

  if (
    direction ===
      'NEW_ACTIVITY' ||
    previousInvoiceCount ===
      0
  ) {
    const forbiddenTrendWords =
      /augment|augmentation|progress|croissance|hausse|diminu|diminution|baisse|recul/i;

    result.insights =
      result.insights.filter(
        (
          item,
        ) =>
          !forbiddenTrendWords.test(
            String(item),
          ),
      );

    const comparisonMessage =
      "Aucune comparaison fiable avec le mois précédent n'est encore possible.";

    const alreadyExists =
      result.insights.some(
        (
          item,
        ) =>
          String(item)
            .toLowerCase()
            .includes(
              'aucune comparaison',
            ),
      );

    if (!alreadyExists) {
      result.insights.push(
        comparisonMessage,
      );
    }

    result.trend_label =
      'Nouvelle activité';
  }

  /*
  |--------------------------------------------------------------------------
  | ACCEPTANCE RATE
  |--------------------------------------------------------------------------
  */

  const acceptanceRate =
    digestData
      ?.ttn
      ?.acceptance_rate;

  if (
    Number(
      acceptanceRate,
    ) === 100
  ) {
    const hasAcceptanceHighlight =
      result.highlights.some(
        (
          item,
        ) =>
          /100|toutes les factures|acceptées/i.test(
            String(item),
          ),
      );

    if (
      !hasAcceptanceHighlight
    ) {
      result.highlights.push(
        'Toutes les factures ont été acceptées.',
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | REMOVE INVENTED CURRENCIES
  |--------------------------------------------------------------------------
  */

  result.headline =
    removeInventedCurrency(
      result.headline,
    );

  result.summary =
    removeInventedCurrency(
      result.summary,
    );

  result.insights =
    result.insights.map(
      removeInventedCurrency,
    );

  result.highlights =
    result.highlights.map(
      removeInventedCurrency,
    );

  result.risks =
    result.risks.map(
      removeInventedCurrency,
    );

  result.recommendations =
    result.recommendations.map(
      removeInventedCurrency,
    );

  return result;
}

/*
|--------------------------------------------------------------------------
| NORMALIZE AI RESPONSE
|--------------------------------------------------------------------------
*/

function normalizeAIResponse(
  parsed,
  digestData,
) {
  if (
    !parsed ||
    typeof parsed !==
      'object' ||
    Array.isArray(
      parsed,
    )
  ) {
    throw new Error(
      'La réponse Ollama ne contient pas un objet JSON valide.',
    );
  }

  const headline =
    cleanString(
      parsed.headline,
    );

  const summary =
    cleanString(
      parsed.summary,
    );

  if (!headline) {
    throw new Error(
      "La réponse de l'IA ne contient pas de headline.",
    );
  }

  if (!summary) {
    throw new Error(
      "La réponse de l'IA ne contient pas de summary.",
    );
  }

  const normalized = {
    source:
      'ollama',

    model:
      OLLAMA_MODEL,

    headline:
      headline.slice(
        0,
        100,
      ),

    summary:
      summary.slice(
        0,
        700,
      ),

    insights:
      normalizeStringArray(
        parsed.insights,
        5,
      ),

    highlights:
      normalizeStringArray(
        parsed.highlights,
        4,
      ),

    risks:
      normalizeStringArray(
        parsed.risks,
        4,
      ),

    recommendations:
      normalizeStringArray(
        parsed.recommendations,
        4,
      ),

    trend_label:
      normalizeTrendLabel(
        parsed.trend_label,
        digestData
          ?.trend
          ?.direction,
      ),
  };

  /*
  |--------------------------------------------------------------------------
  | IMPORTANT
  |--------------------------------------------------------------------------
  |
  | Les règles métier sont appliquées APRÈS la génération IA.
  |--------------------------------------------------------------------------
  */

  return enforceBusinessRules(
    normalized,
    digestData,
  );
}

/*
|--------------------------------------------------------------------------
| CALL OLLAMA
|--------------------------------------------------------------------------
*/

async function callOllama(
  digestData,
) {
  const systemPrompt =
    buildSystemPrompt();

  const userPrompt =
    buildUserPrompt(
      digestData,
    );

  const prompt =
    `
${systemPrompt}

----------------------------------------

${userPrompt}
`.trim();

  const url =
    `${OLLAMA_BASE_URL.replace(
      /\/+$/,
      '',
    )}/api/generate`;

  console.log(
    'MONTHLY DIGEST AI - Request:',
    {
      url,

      model:
        OLLAMA_MODEL,

      timeout:
        OLLAMA_TIMEOUT,

      invoices:
        digestData
          ?.financial_summary
          ?.invoice_count,
    },
  );

  const startedAt =
    Date.now();

  const response =
    await axios.post(
      url,
      {
        model:
          OLLAMA_MODEL,

        prompt,

        stream:
          false,

        format:
          'json',

        options: {
          temperature:
            0.1,

          top_p:
            0.9,

          num_predict:
            800,
        },
      },
      {
        timeout:
          OLLAMA_TIMEOUT,

        headers: {
          'Content-Type':
            'application/json',
        },
      },
    );

  const elapsedMs =
    Date.now() -
    startedAt;

  console.log(
    'MONTHLY DIGEST AI - Ollama response received:',
    {
      model:
        response
          ?.data
          ?.model ||
        OLLAMA_MODEL,

      done:
        response
          ?.data
          ?.done,

      done_reason:
        response
          ?.data
          ?.done_reason,

      elapsed_ms:
        elapsedMs,
    },
  );

  const content =
    response
      ?.data
      ?.response;

  if (
    !content ||
    !cleanString(
      content,
    )
  ) {
    throw new Error(
      'Ollama a retourné une réponse vide.',
    );
  }

  const jsonText =
    extractJsonText(
      content,
    );

  if (!jsonText) {
    throw new Error(
      "Impossible d'extraire le JSON retourné par Ollama.",
    );
  }

  let parsed;

  try {
    parsed =
      JSON.parse(
        jsonText,
      );
  } catch (
    parseError
  ) {
    console.error(
      'MONTHLY DIGEST AI - JSON invalide:',
      jsonText,
    );

    throw new Error(
      "La réponse d'Ollama n'est pas un JSON valide.",
    );
  }

  return normalizeAIResponse(
    parsed,
    digestData,
  );
}

/*
|--------------------------------------------------------------------------
| GENERATE MONTHLY DIGEST AI
|--------------------------------------------------------------------------
*/

async function generateMonthlyDigestAI({
  summary,
  ttn,
  trend,
  topSuppliers,
  topErrors,
  currentPeriodLabel,
  previousPeriodLabel,
}) {
  try {
    const digestData =
      buildDigestInput({
        summary,
        ttn,
        trend,
        topSuppliers,
        topErrors,
        currentPeriodLabel,
        previousPeriodLabel,
      });

    console.log(
      'MONTHLY DIGEST AI - Starting generation:',
      {
        period:
          digestData
            .period
            .current,

        invoice_count:
          digestData
            .financial_summary
            .invoice_count,

        total_ttc:
          digestData
            .financial_summary
            .total_ttc,

        acceptance_rate:
          digestData
            .ttn
            .acceptance_rate,

        direction:
          digestData
            .trend
            .direction,
      },
    );

    /*
    |--------------------------------------------------------------------------
    | EMPTY MONTH
    |--------------------------------------------------------------------------
    */

    if (
      digestData
        .financial_summary
        .invoice_count === 0
    ) {
      console.log(
        'MONTHLY DIGEST AI - No invoice, fallback used.',
      );

      return null;
    }

    /*
    |--------------------------------------------------------------------------
    | CALL OLLAMA
    |--------------------------------------------------------------------------
    */

    const result =
      await callOllama(
        digestData,
      );

    console.log(
      'MONTHLY DIGEST AI - Generation successful:',
      {
        source:
          result.source,

        model:
          result.model,

        headline:
          result.headline,
      },
    );

    return result;
  } catch (
    error
  ) {
    if (
      axios.isAxiosError(
        error,
      )
    ) {
      console.error(
        'MONTHLY DIGEST AI - Ollama unavailable:',
        {
          message:
            error.message,

          code:
            error.code,

          status:
            error.response
              ?.status,

          response:
            error.response
              ?.data,

          baseUrl:
            OLLAMA_BASE_URL,

          model:
            OLLAMA_MODEL,

          timeout:
            OLLAMA_TIMEOUT,
        },
      );
    } else {
      console.error(
        'MONTHLY DIGEST AI ERROR:',
        {
          message:
            error?.message,

          stack:
            process.env
              .NODE_ENV ===
            'development'
              ? error?.stack
              : undefined,
        },
      );
    }

    /*
    |--------------------------------------------------------------------------
    | FALLBACK
    |--------------------------------------------------------------------------
    */

    return null;
  }
}

/*
|--------------------------------------------------------------------------
| HEALTH CHECK
|--------------------------------------------------------------------------
*/

async function checkMonthlyDigestAIHealth() {
  try {
    const url =
      `${OLLAMA_BASE_URL.replace(
        /\/+$/,
        '',
      )}/api/tags`;

    const response =
      await axios.get(
        url,
        {
          timeout:
            10000,
        },
      );

    const models =
      Array.isArray(
        response
          ?.data
          ?.models,
      )
        ? response
            .data
            .models
            .map(
              (
                model,
              ) =>
                model.name ||
                model.model,
            )
            .filter(
              Boolean,
            )
        : [];

    const modelAvailable =
      models.includes(
        OLLAMA_MODEL,
      );

    return {
      available:
        true,

      baseUrl:
        OLLAMA_BASE_URL,

      model:
        OLLAMA_MODEL,

      modelAvailable,

      models,
    };
  } catch (
    error
  ) {
    return {
      available:
        false,

      baseUrl:
        OLLAMA_BASE_URL,

      model:
        OLLAMA_MODEL,

      modelAvailable:
        false,

      models: [],

      error:
        error?.message ||
        'Ollama indisponible.',
    };
  }
}

/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
  generateMonthlyDigestAI,
  checkMonthlyDigestAIHealth,
};