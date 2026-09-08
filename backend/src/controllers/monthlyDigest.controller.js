const {
  sql,
  getDatabase,
} = require('../config/database');

const {
  generateMonthlyDigestAI,
} = require('../services/monthlyDigestAI.service');

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function getCurrentYear() {
  return new Date().getFullYear();
}

function getCurrentMonth() {
  return new Date().getMonth() + 1;
}

function parseYear(value) {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return getCurrentYear();
  }

  const year =
    Number.parseInt(
      value,
      10,
    );

  if (
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2100
  ) {
    return null;
  }

  return year;
}

function parseMonth(value) {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return getCurrentMonth();
  }

  const month =
    Number.parseInt(
      value,
      10,
    );

  if (
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return null;
  }

  return month;
}

function getMonthLabel(
  year,
  month,
) {
  const date =
    new Date(
      year,
      month - 1,
      1,
    );

  return new Intl.DateTimeFormat(
    'fr-FR',
    {
      month: 'long',
      year: 'numeric',
    },
  ).format(date);
}

function getPreviousMonthLabel(
  year,
  month,
) {
  const date =
    new Date(
      year,
      month - 2,
      1,
    );

  return new Intl.DateTimeFormat(
    'fr-FR',
    {
      month: 'long',
      year: 'numeric',
    },
  ).format(date);
}

/*
|--------------------------------------------------------------------------
| FALLBACK SUMMARY
|--------------------------------------------------------------------------
|
| Utilisé seulement si Ollama :
| - ne répond pas
| - timeout
| - retourne un mauvais JSON
| - modèle indisponible
|
|--------------------------------------------------------------------------
*/

function buildFallbackAnalysis({
  summary,
  ttn,
  trend,
  topSuppliers,
  topErrors,
  currentPeriodLabel,
  previousPeriodLabel,
}) {
  const invoiceCount =
    Number(
      summary?.invoice_count ||
        0,
    );

  const totalTtc =
    Number(
      summary?.total_ttc ||
        0,
    );

  const acceptanceRate =
    ttn?.acceptance_rate ===
      null ||
    ttn?.acceptance_rate ===
      undefined
      ? null
      : Number(
          ttn.acceptance_rate,
        );

  const supplier =
    topSuppliers?.[0] ||
    null;

  const topError =
    topErrors?.[0] ||
    null;

  let headline =
    `Résumé de ${currentPeriodLabel}`;

  const insights = [];

  /*
  |--------------------------------------------------------------------------
  | VOLUME
  |--------------------------------------------------------------------------
  */

  insights.push(
    `${invoiceCount} facture${
      invoiceCount > 1
        ? 's'
        : ''
    } traitée${
      invoiceCount > 1
        ? 's'
        : ''
    } pour un montant TTC total de ${totalTtc.toFixed(
      3,
    )}.`,
  );

  /*
  |--------------------------------------------------------------------------
  | ACCEPTATION TTN
  |--------------------------------------------------------------------------
  */

  if (
    acceptanceRate !== null
  ) {
    insights.push(
      `Le taux d'acceptation TTN est de ${acceptanceRate.toFixed(
        2,
      )} %.`,
    );
  }

  /*
  |--------------------------------------------------------------------------
  | FOURNISSEUR PRINCIPAL
  |--------------------------------------------------------------------------
  */

  if (supplier) {
    insights.push(
      `Le fournisseur ${supplier.supplier_identifier} est le plus fréquent avec ${supplier.invoice_count} facture${
        Number(
          supplier.invoice_count,
        ) > 1
          ? 's'
          : ''
      }.`,
    );
  }

  /*
  |--------------------------------------------------------------------------
  | ERREURS
  |--------------------------------------------------------------------------
  */

  if (topError) {
    insights.push(
      `L'erreur la plus fréquente est ${topError.error_code} avec ${topError.error_count} occurrence${
        Number(
          topError.error_count,
        ) > 1
          ? 's'
          : ''
      }.`,
    );
  } else {
    insights.push(
      `Aucune erreur significative n'a été détectée pour ${currentPeriodLabel}.`,
    );
  }

  /*
  |--------------------------------------------------------------------------
  | TENDANCE
  |--------------------------------------------------------------------------
  */

  let trendLabel =
    'Stable';

  let trendMessage =
    `Aucune variation significative par rapport à ${previousPeriodLabel}.`;

  if (
    trend?.trend_direction ===
    'NEW_ACTIVITY'
  ) {
    trendLabel =
      'Nouvelle activité';

    trendMessage =
      `Aucune donnée comparable n'est disponible pour ${previousPeriodLabel}.`;
  }

  if (
    trend?.trend_direction ===
    'UP'
  ) {
    trendLabel =
      'En progression';

    trendMessage =
      `L'activité progresse par rapport à ${previousPeriodLabel}.`;
  }

  if (
    trend?.trend_direction ===
    'DOWN'
  ) {
    trendLabel =
      'En baisse';

    trendMessage =
      `Le volume d'activité diminue par rapport à ${previousPeriodLabel}.`;
  }

  insights.push(
    trendMessage,
  );

  /*
  |--------------------------------------------------------------------------
  | HEADLINE
  |--------------------------------------------------------------------------
  */

  if (
    invoiceCount === 0
  ) {
    headline =
      `Aucune facture en ${currentPeriodLabel}`;
  } else if (
    acceptanceRate === 100
  ) {
    headline =
      `Toutes vos factures ont été acceptées en ${currentPeriodLabel}`;
  } else if (
    trend?.trend_direction ===
    'UP'
  ) {
    headline =
      `Votre activité progresse en ${currentPeriodLabel}`;
  }

  return {
    source:
      'automatic',

    headline,

    summary:
      insights.join(' '),

    insights,

    highlights: [],

    risks: [],

    recommendations: [],

    trend_label:
      trendLabel,
  };
}

/*
|--------------------------------------------------------------------------
| GET MONTHLY FINANCIAL DIGEST
|--------------------------------------------------------------------------
|
| GET
|
| /api/client-dashboard/monthly-digest?year=2026&month=8
|
|--------------------------------------------------------------------------
*/

async function getMonthlyFinancialDigest(
  req,
  res,
) {
  try {
    /*
    |--------------------------------------------------------------------------
    | AUTHENTICATED ORGANIZATION
    |--------------------------------------------------------------------------
    */

    const organizationId =
      req.user
        ?.organizationId ||
      req.user
        ?.organization_id ||
      null;

    if (!organizationId) {
      return res
        .status(403)
        .json({
          success: false,

          error:
            'ORGANIZATION_REQUIRED',

          message:
            "Aucune organisation n'est associée à ce compte.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | QUERY PARAMS
    |--------------------------------------------------------------------------
    */

    const year =
      parseYear(
        req.query.year,
      );

    const month =
      parseMonth(
        req.query.month,
      );

    if (!year) {
      return res
        .status(400)
        .json({
          success: false,

          error:
            'INVALID_YEAR',

          message:
            "L'année doit être comprise entre 2000 et 2100.",
        });
    }

    if (!month) {
      return res
        .status(400)
        .json({
          success: false,

          error:
            'INVALID_MONTH',

          message:
            'Le mois doit être compris entre 1 et 12.',
        });
    }

    /*
    |--------------------------------------------------------------------------
    | DATABASE
    |--------------------------------------------------------------------------
    */

    const pool =
      await getDatabase();

    const request =
      pool.request();

    request.input(
      'organization_id',
      sql.UniqueIdentifier,
      organizationId,
    );

    request.input(
      'year',
      sql.Int,
      year,
    );

    request.input(
      'month',
      sql.Int,
      month,
    );

    /*
    |--------------------------------------------------------------------------
    | STORED PROCEDURE
    |--------------------------------------------------------------------------
    */

    const result =
      await request.execute(
        'dbo.sp_GetMonthlyFinancialDigest',
      );

    /*
    |--------------------------------------------------------------------------
    | RECORDSETS
    |--------------------------------------------------------------------------
    |
    | recordsets[0] = summary
    | recordsets[1] = TTN
    | recordsets[2] = trend
    | recordsets[3] = top suppliers
    | recordsets[4] = top errors
    |
    |--------------------------------------------------------------------------
    */

    const summary =
      result.recordsets
        ?.[0]
        ?.[0] ||
      {};

    const ttn =
      result.recordsets
        ?.[1]
        ?.[0] ||
      {};

    const trend =
      result.recordsets
        ?.[2]
        ?.[0] ||
      {};

    const topSuppliers =
      result.recordsets
        ?.[3] ||
      [];

    const topErrors =
      result.recordsets
        ?.[4] ||
      [];

    /*
    |--------------------------------------------------------------------------
    | LABELS
    |--------------------------------------------------------------------------
    */

    const periodLabel =
      getMonthLabel(
        year,
        month,
      );

    const previousPeriodLabel =
      getPreviousMonthLabel(
        year,
        month,
      );

    /*
    |--------------------------------------------------------------------------
    | AI ANALYSIS
    |--------------------------------------------------------------------------
    |
    | 1. On essaye Ollama
    | 2. Si Ollama échoue -> null
    | 3. On utilise automatiquement le fallback
    |
    |--------------------------------------------------------------------------
    */

    let aiAnalysis =
      null;

    try {
      aiAnalysis =
        await generateMonthlyDigestAI({
          summary,

          ttn,

          trend,

          topSuppliers,

          topErrors,

          currentPeriodLabel:
            periodLabel,

          previousPeriodLabel,
        });
    } catch (aiError) {
      /*
      |--------------------------------------------------------------------------
      | Sécurité supplémentaire.
      |
      | Normalement le service retourne déjà null.
      | Mais même s'il lance une exception, le digest SQL doit continuer.
      |--------------------------------------------------------------------------
      */

      console.error(
        'Monthly Digest AI generation error:',
        aiError,
      );

      aiAnalysis =
        null;
    }

    const analysis =
      aiAnalysis ||
      buildFallbackAnalysis({
        summary,

        ttn,

        trend,

        topSuppliers,

        topErrors,

        currentPeriodLabel:
          periodLabel,

        previousPeriodLabel,
      });

    /*
    |--------------------------------------------------------------------------
    | NORMALIZED DATA
    |--------------------------------------------------------------------------
    */

    const normalizedSummary = {
      invoice_count:
        Number(
          summary.invoice_count ||
            0,
        ),

      total_ht:
        Number(
          summary.total_ht ||
            0,
        ),

      total_tva:
        Number(
          summary.total_tva ||
            0,
        ),

      total_ttc:
        Number(
          summary.total_ttc ||
            0,
        ),

      average_invoice_ttc:
        Number(
          summary.average_invoice_ttc ||
            0,
        ),
    };

    const normalizedTtn = {
      total_invoices:
        Number(
          ttn.total_invoices ||
            0,
        ),

      accepted:
        Number(
          ttn.accepted_count ||
            0,
        ),

      rejected:
        Number(
          ttn.rejected_count ||
            0,
        ),

      errors:
        Number(
          ttn.error_count ||
            0,
        ),

      pending_retry:
        Number(
          ttn.pending_retry_count ||
            0,
        ),

      pending_review:
        Number(
          ttn.pending_review_count ||
            0,
        ),

      processing:
        Number(
          ttn.processing_count ||
            0,
        ),

      acceptance_rate:
        ttn.acceptance_rate ===
          null ||
        ttn.acceptance_rate ===
          undefined
          ? null
          : Number(
              ttn.acceptance_rate,
            ),
    };

    const normalizedTrend = {
      current_invoice_count:
        Number(
          trend.current_invoice_count ||
            0,
        ),

      previous_invoice_count:
        Number(
          trend.previous_invoice_count ||
            0,
        ),

      invoice_count_change_percent:
        trend.invoice_count_change_percent ===
          null ||
        trend.invoice_count_change_percent ===
          undefined
          ? null
          : Number(
              trend.invoice_count_change_percent,
            ),

      current_total_ttc:
        Number(
          trend.current_total_ttc ||
            0,
        ),

      previous_total_ttc:
        Number(
          trend.previous_total_ttc ||
            0,
        ),

      total_ttc_change_percent:
        trend.total_ttc_change_percent ===
          null ||
        trend.total_ttc_change_percent ===
          undefined
          ? null
          : Number(
              trend.total_ttc_change_percent,
            ),

      current_acceptance_rate:
        trend.current_acceptance_rate ===
          null ||
        trend.current_acceptance_rate ===
          undefined
          ? null
          : Number(
              trend.current_acceptance_rate,
            ),

      previous_acceptance_rate:
        trend.previous_acceptance_rate ===
          null ||
        trend.previous_acceptance_rate ===
          undefined
          ? null
          : Number(
              trend.previous_acceptance_rate,
            ),

      acceptance_rate_change:
        trend.acceptance_rate_change ===
          null ||
        trend.acceptance_rate_change ===
          undefined
          ? null
          : Number(
              trend.acceptance_rate_change,
            ),

      direction:
        trend.trend_direction ||
        'STABLE',
    };

    const normalizedSuppliers =
      topSuppliers.map(
        (
          supplier,
        ) => ({
          supplier_identifier:
            supplier
              .supplier_identifier,

          invoice_count:
            Number(
              supplier.invoice_count ||
                0,
            ),

          total_ttc:
            Number(
              supplier.total_ttc ||
                0,
            ),

          average_ttc:
            Number(
              supplier.average_ttc ||
                0,
            ),
        }),
      );

    const normalizedErrors =
      topErrors.map(
        (
          error,
        ) => ({
          code:
            error.error_code,

          count:
            Number(
              error.error_count ||
                0,
            ),

          example_message:
            error.example_message ||
            null,
        }),
      );

    /*
    |--------------------------------------------------------------------------
    | RESPONSE
    |--------------------------------------------------------------------------
    */

    return res
      .status(200)
      .json({
        success: true,

        digest: {
          /*
          |--------------------------------------------------------------------------
          | PERIOD
          |--------------------------------------------------------------------------
          */

          period: {
            year,

            month,

            label:
              periodLabel,

            previous_label:
              previousPeriodLabel,

            start_date:
              summary.start_date ||
              null,

            end_date:
              summary.end_date ||
              null,
          },

          /*
          |--------------------------------------------------------------------------
          | SUMMARY
          |--------------------------------------------------------------------------
          */

          summary:
            normalizedSummary,

          /*
          |--------------------------------------------------------------------------
          | TTN
          |--------------------------------------------------------------------------
          */

          ttn:
            normalizedTtn,

          /*
          |--------------------------------------------------------------------------
          | TREND
          |--------------------------------------------------------------------------
          */

          trend:
            normalizedTrend,

          /*
          |--------------------------------------------------------------------------
          | SUPPLIERS
          |--------------------------------------------------------------------------
          */

          top_suppliers:
            normalizedSuppliers,

          /*
          |--------------------------------------------------------------------------
          | ERRORS
          |--------------------------------------------------------------------------
          */

          top_errors:
            normalizedErrors,

          /*
          |--------------------------------------------------------------------------
          | AI
          |--------------------------------------------------------------------------
          |
          | source = "ollama"
          |    -> vrai résumé IA
          |
          | source = "automatic"
          |    -> fallback automatique
          |
          |--------------------------------------------------------------------------
          */

          ai:
            analysis,

          /*
          |--------------------------------------------------------------------------
          | AI STATUS
          |--------------------------------------------------------------------------
          |
          | Très pratique pour ton frontend et tes tests Postman.
          |--------------------------------------------------------------------------
          */

          ai_status: {
            enabled:
              true,

            generated:
              analysis?.source ===
              'ollama',

            source:
              analysis?.source ||
              'automatic',

            model:
              analysis?.model ||
              null,

            fallback_used:
              analysis?.source !==
              'ollama',
          },
        },
      });
  } catch (error) {
    console.error(
      'getMonthlyFinancialDigest error:',
      error,
    );

    return res
      .status(500)
      .json({
        success: false,

        error:
          'MONTHLY_DIGEST_ERROR',

        message:
          'Impossible de générer le résumé financier mensuel.',

        details:
          process.env.NODE_ENV ===
          'development'
            ? error.message
            : undefined,
      });
  }
}

module.exports = {
  getMonthlyFinancialDigest,
};