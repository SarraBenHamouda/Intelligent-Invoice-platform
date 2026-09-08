import './MonthlyFinancialDigest.css';

function formatNumber(
  value,
  options = {},
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {
    return '0';
  }

  return new Intl.NumberFormat(
    'fr-FR',
    {
      maximumFractionDigits: 2,
      ...options,
    },
  ).format(number);
}


function MetricCard({
  value,
  label,
  suffix = '',
}) {
  return (
    <article className="monthly-digest-metric">
      <strong className="monthly-digest-metric-value">
        {value}
        {suffix}
      </strong>

      <span className="monthly-digest-metric-label">
        {label}
      </span>
    </article>
  );
}


function DigestList({
  title,
  items,
  type = 'default',
}) {
  if (
    !Array.isArray(items) ||
    items.length === 0
  ) {
    return null;
  }

  return (
    <section
      className={`monthly-digest-list monthly-digest-list--${type}`}
    >
      <div className="monthly-digest-list-heading">

        {type === 'highlight' && (
          <span
            className="monthly-digest-list-icon"
            aria-hidden="true"
          >
            ✓
          </span>
        )}

        {type === 'risk' && (
          <span
            className="monthly-digest-list-icon"
            aria-hidden="true"
          >
            !
          </span>
        )}

        {type === 'recommendation' && (
          <span
            className="monthly-digest-list-icon"
            aria-hidden="true"
          >
            →
          </span>
        )}

        {type === 'insight' && (
          <span
            className="monthly-digest-list-icon"
            aria-hidden="true"
          >
            ✦
          </span>
        )}

        <h3>
          {title}
        </h3>
      </div>

      <ul>
        {items.map(
          (
            item,
            index,
          ) => (
            <li
              key={`${type}-${index}-${item}`}
            >
              {item}
            </li>
          ),
        )}
      </ul>
    </section>
  );
}


function MonthlyFinancialDigest({
  digest,
  loading = false,
  error = '',
  onRetry,
}) {

  /*
  |--------------------------------------------------------------------------
  | LOADING
  |--------------------------------------------------------------------------
  */

  if (loading) {
    return (
      <section className="monthly-digest monthly-digest--loading">
        <div className="monthly-digest-loading-header">
          <div>
            <span className="monthly-digest-eyebrow">
              Résumé du mois
            </span>

            <div className="monthly-digest-skeleton monthly-digest-skeleton--title" />
          </div>

          <div className="monthly-digest-skeleton monthly-digest-skeleton--badge" />
        </div>

        <div className="monthly-digest-skeleton monthly-digest-skeleton--text" />

        <div className="monthly-digest-skeleton monthly-digest-skeleton--text-small" />

        <div className="monthly-digest-loading-message">
          <span className="monthly-digest-loading-dot" />

          <span>
            Préparation du résumé...
          </span>
        </div>

        <div className="monthly-digest-loading-metrics">
          <div className="monthly-digest-skeleton monthly-digest-skeleton--metric" />

          <div className="monthly-digest-skeleton monthly-digest-skeleton--metric" />

          <div className="monthly-digest-skeleton monthly-digest-skeleton--metric" />

          <div className="monthly-digest-skeleton monthly-digest-skeleton--metric" />
        </div>
      </section>
    );
  }


  /*
  |--------------------------------------------------------------------------
  | ERROR
  |--------------------------------------------------------------------------
  */

  if (error) {
    return (
      <section className="monthly-digest monthly-digest--error">
        <div>
          <span className="monthly-digest-eyebrow">
            Résumé du mois
          </span>

          <h2>
            Le résumé n’est pas disponible
          </h2>

          <p>
            Nous n’avons pas pu préparer le résumé de vos factures.
          </p>
        </div>

        {typeof onRetry === 'function' && (
          <button
            type="button"
            className="monthly-digest-retry"
            onClick={onRetry}
          >
            Réessayer
          </button>
        )}
      </section>
    );
  }


  /*
  |--------------------------------------------------------------------------
  | NO DATA
  |--------------------------------------------------------------------------
  */

  if (!digest) {
    return null;
  }


  /*
  |--------------------------------------------------------------------------
  | DATA
  |--------------------------------------------------------------------------
  */

  const period =
    digest.period ||
    {};

  const summary =
    digest.summary ||
    {};

  const ttn =
    digest.ttn ||
    {};

  const trend =
    digest.trend ||
    {};

  const analysis =
    digest.ai ||
    {};

  const topSuppliers =
    Array.isArray(
      digest.top_suppliers,
    )
      ? digest.top_suppliers
      : [];

  const topErrors =
    Array.isArray(
      digest.top_errors,
    )
      ? digest.top_errors
      : [];

  const topSupplier =
    topSuppliers[0] ||
    null;


  /*
  |--------------------------------------------------------------------------
  | VALUES
  |--------------------------------------------------------------------------
  */

  const invoiceCount =
    Number(
      summary.invoice_count ||
        0,
    );

  const totalTtc =
    Number(
      summary.total_ttc ||
        0,
    );

  const averageTtc =
    Number(
      summary.average_invoice_ttc ||
        0,
    );

  const acceptanceRate =
    ttn.acceptance_rate === null ||
    ttn.acceptance_rate === undefined
      ? null
      : Number(
          ttn.acceptance_rate,
        );

  const hasErrors =
    topErrors.length > 0 ||
    Number(
      ttn.errors ||
        0,
    ) > 0;


  /*
  |--------------------------------------------------------------------------
  | SIMPLE FALLBACK TITLE
  |--------------------------------------------------------------------------
  */

  const title =
    analysis.headline ||
    `Analyse des factures pour ${
      period.label ||
      'ce mois'
    }`;


  /*
  |--------------------------------------------------------------------------
  | SIMPLE FALLBACK SUMMARY
  |--------------------------------------------------------------------------
  */

  const simpleSummary =
    invoiceCount > 0
      ? `${
          invoiceCount === 1
            ? 'Une facture a été traitée'
            : `${invoiceCount} factures ont été traitées`
        } pour un montant total TTC de ${formatNumber(totalTtc)}. ${
          acceptanceRate !== null
            ? `Le taux d’acceptation est de ${formatNumber(acceptanceRate)} %.`
            : ''
        }`
      : 'Aucune facture n’a été traitée pendant cette période.';


  /*
  |--------------------------------------------------------------------------
  | RENDER
  |--------------------------------------------------------------------------
  */

  return (
    <section className="monthly-digest">

      {/*
      |--------------------------------------------------------------------------
      | HEADER
      |--------------------------------------------------------------------------
      */}

      <header className="monthly-digest-header">
        <div className="monthly-digest-header-copy">

          <div className="monthly-digest-kicker-row">
            <span
              className="monthly-digest-ai-symbol"
              aria-hidden="true"
            >
              ✦
            </span>

            <span className="monthly-digest-eyebrow">
              Résumé du mois
            </span>
          </div>

          <h2>
            {title}
          </h2>

          <p className="monthly-digest-summary">
            {analysis.summary ||
              simpleSummary}
          </p>
        </div>


        <div className="monthly-digest-period">
          <span>
            Période
          </span>

          <strong>
            {period.label ||
              'Mois courant'}
          </strong>
        </div>
      </header>


      {/*
      |--------------------------------------------------------------------------
      | MAIN NUMBERS
      |--------------------------------------------------------------------------
      */}

      <div className="monthly-digest-metrics">

        <MetricCard
          value={formatNumber(
            invoiceCount,
            {
              maximumFractionDigits:
                0,
            },
          )}
          label={
            invoiceCount > 1
              ? 'Factures'
              : 'Facture'
          }
        />

        <MetricCard
          value={formatNumber(
            totalTtc,
          )}
          label="Total TTC"
        />

        <MetricCard
          value={
            acceptanceRate === null
              ? '—'
              : formatNumber(
                  acceptanceRate,
                )
          }
          suffix={
            acceptanceRate === null
              ? ''
              : ' %'
          }
          label="Factures acceptées"
        />

        <MetricCard
          value={formatNumber(
            averageTtc,
          )}
          label="Moyenne par facture"
        />
      </div>


      {/*
      |--------------------------------------------------------------------------
      | CONTENT
      |--------------------------------------------------------------------------
      */}

      <div className="monthly-digest-content-grid">

        {/*
        |--------------------------------------------------------------------------
        | LEFT SIDE
        |--------------------------------------------------------------------------
        */}

        <div className="monthly-digest-analysis">

          <DigestList
            title="Ce qu’il faut retenir"
            items={
              analysis.insights
            }
            type="insight"
          />

          <DigestList
            title="Points positifs"
            items={
              analysis.highlights
            }
            type="highlight"
          />

          <DigestList
            title="À surveiller"
            items={
              analysis.risks
            }
            type="risk"
          />

          <DigestList
            title="Conseils"
            items={
              analysis.recommendations
            }
            type="recommendation"
          />


          {!analysis.insights?.length &&
            !analysis.highlights?.length &&
            !analysis.risks?.length &&
            !analysis.recommendations?.length && (
              <div className="monthly-digest-no-analysis">
                Rien de particulier à signaler pour ce mois.
              </div>
            )}
        </div>


        {/*
        |--------------------------------------------------------------------------
        | RIGHT SIDE
        |--------------------------------------------------------------------------
        */}

        <aside className="monthly-digest-sidebar">

          {/*
          |--------------------------------------------------------------------------
          | TREND
          |--------------------------------------------------------------------------
          */}

          <article className="monthly-digest-side-card">
            <span className="monthly-digest-side-label">
              Évolution
            </span>

            <strong className="monthly-digest-trend">
              {analysis.trend_label ||
                'Stable'}
            </strong>

            {Number(
              trend.previous_invoice_count ||
                0,
            ) > 0 ? (
              <p>
                Comparaison avec{' '}
                {period.previous_label ||
                  'le mois précédent'}.
              </p>
            ) : (
              <p>
                Pas encore assez de données pour comparer.
              </p>
            )}
          </article>


          {/*
          |--------------------------------------------------------------------------
          | MAIN SUPPLIER
          |--------------------------------------------------------------------------
          */}

          <article className="monthly-digest-side-card">
            <span className="monthly-digest-side-label">
              Fournisseur principal
            </span>

            {topSupplier ? (
              <>
                <strong className="monthly-digest-supplier-id">
                  {
                    topSupplier.supplier_identifier
                  }
                </strong>

                <p>
                  {formatNumber(
                    topSupplier.invoice_count,
                    {
                      maximumFractionDigits:
                        0,
                    },
                  )}{' '}
                  facture
                  {Number(
                    topSupplier.invoice_count,
                  ) > 1
                    ? 's'
                    : ''}

                  {' · '}

                  {formatNumber(
                    topSupplier.total_ttc,
                  )}{' '}
                  TTC
                </p>
              </>
            ) : (
              <p>
                Aucun fournisseur pour cette période.
              </p>
            )}
          </article>


          {/*
          |--------------------------------------------------------------------------
          | QUALITY
          |--------------------------------------------------------------------------
          */}

          <article className="monthly-digest-side-card">
            <span className="monthly-digest-side-label">
              État des factures
            </span>

            <strong
              className={
                hasErrors
                  ? 'monthly-digest-quality monthly-digest-quality--warning'
                  : 'monthly-digest-quality monthly-digest-quality--success'
              }
            >
              {hasErrors
                ? 'Quelques éléments à vérifier'
                : 'Tout s’est bien passé'}
            </strong>

            <p>
              {hasErrors
                ? 'Certaines factures nécessitent votre attention.'
                : 'Aucun problème important n’a été détecté ce mois-ci.'}
            </p>
          </article>

        </aside>
      </div>
    </section>
  );
}

export default MonthlyFinancialDigest;