/*
|--------------------------------------------------------------------------
| PROCESSING ETA SERVICE
|--------------------------------------------------------------------------
|
| Objectif :
| - calculer la progression d'une facture
| - estimer le temps restant
| - fournir une estimation lisible
| - détecter un traitement plus long que prévu
| - préparer l'utilisation future d'un historique SQL réel
|
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| PIPELINE ORDER
|--------------------------------------------------------------------------
*/

const STAGE_ORDER = [
  'IMPORT',
  'EXTRACTION',
  'VALIDATION',
  'TEIF',
  'SIGNATURE',
  'TTN',
];

/*
|--------------------------------------------------------------------------
| STATIC FALLBACK DURATIONS
|--------------------------------------------------------------------------
|
| Valeurs initiales.
| Plus tard, elles pourront être remplacées par des moyennes SQL réelles.
|
|--------------------------------------------------------------------------
*/

const DEFAULT_STAGE_SECONDS = {
  IMPORT:
    5,

  EXTRACTION:
    25,

  VALIDATION:
    12,

  TEIF:
    8,

  SIGNATURE:
    20,

  TTN:
    35,
};

/*
|--------------------------------------------------------------------------
| PROGRESS PERCENTAGES
|--------------------------------------------------------------------------
*/

const STAGE_PROGRESS = {
  IMPORT:
    5,

  EXTRACTION:
    25,

  VALIDATION:
    45,

  TEIF:
    60,

  SIGNATURE:
    78,

  TTN:
    92,

  ACCEPTED:
    100,

  REJECTED:
    100,

  ERROR:
    100,
};

/*
|--------------------------------------------------------------------------
| TERMINAL STATUSES
|--------------------------------------------------------------------------
*/

const TERMINAL_STATUSES =
  new Set([
    'ACCEPTED',
    'REJECTED',
    'ERROR',
  ]);

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function cleanString(
  value,
  fallback = '',
) {
  const normalized =
    String(
      value ?? '',
    )
      .trim()
      .toUpperCase();

  return (
    normalized ||
    fallback
  );
}

function toNumber(
  value,
  fallback = 0,
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(
      number,
    )
  ) {
    return fallback;
  }

  return number;
}

/*
|--------------------------------------------------------------------------
| FORMAT DURATION
|--------------------------------------------------------------------------
*/

function formatDuration(
  seconds,
) {
  const value =
    Math.max(
      0,
      Math.round(
        toNumber(
          seconds,
          0,
        ),
      ),
    );

  if (
    value === 0
  ) {
    return 'Terminé';
  }

  if (
    value < 60
  ) {
    return `Environ ${value} sec`;
  }

  const minutes =
    Math.floor(
      value /
      60,
    );

  const remainingSeconds =
    value %
    60;

  if (
    remainingSeconds ===
    0
  ) {
    return `Environ ${minutes} min`;
  }

  return `Environ ${minutes} min ${remainingSeconds} sec`;
}

/*
|--------------------------------------------------------------------------
| TOTAL PIPELINE DURATION
|--------------------------------------------------------------------------
*/

function getEstimatedTotalSeconds(
  stageDurations =
    DEFAULT_STAGE_SECONDS,
) {
  return STAGE_ORDER.reduce(
    (
      total,
      stage,
    ) =>
      total +
      toNumber(
        stageDurations[
          stage
        ],
        0,
      ),

    0,
  );
}

/*
|--------------------------------------------------------------------------
| GET STAGE INDEX
|--------------------------------------------------------------------------
*/

function getStageIndex(
  stage,
) {
  const normalizedStage =
    cleanString(
      stage,
    );

  return STAGE_ORDER.indexOf(
    normalizedStage,
  );
}

/*
|--------------------------------------------------------------------------
| GET PROGRESS
|--------------------------------------------------------------------------
*/

function getProgressPercent({
  stage,
  status,
}) {
  const normalizedStatus =
    cleanString(
      status,
    );

  const normalizedStage =
    cleanString(
      stage,
    );

  if (
    TERMINAL_STATUSES.has(
      normalizedStatus,
    )
  ) {
    return 100;
  }

  if (
    STAGE_PROGRESS[
      normalizedStatus
    ] !==
    undefined
  ) {
    return STAGE_PROGRESS[
      normalizedStatus
    ];
  }

  if (
    STAGE_PROGRESS[
      normalizedStage
    ] !==
    undefined
  ) {
    return STAGE_PROGRESS[
      normalizedStage
    ];
  }

  return 0;
}

/*
|--------------------------------------------------------------------------
| REMAINING SECONDS
|--------------------------------------------------------------------------
|
| On considère que l'étape courante est déjà en cours.
| On compte donc :
| - une partie restante de l'étape actuelle
| - toutes les étapes suivantes
|
|--------------------------------------------------------------------------
*/

function getEstimatedRemainingSeconds({
  stage,
  status,
  stageDurations =
    DEFAULT_STAGE_SECONDS,
  stageProgressRatio = 0,
}) {
  const normalizedStatus =
    cleanString(
      status,
    );

  if (
    TERMINAL_STATUSES.has(
      normalizedStatus,
    )
  ) {
    return 0;
  }

  const normalizedStage =
    cleanString(
      stage,
    );

  const stageIndex =
    getStageIndex(
      normalizedStage,
    );

  if (
    stageIndex === -1
  ) {
    return null;
  }

  const normalizedRatio =
    Math.min(
      1,
      Math.max(
        0,
        toNumber(
          stageProgressRatio,
          0,
        ),
      ),
    );

  const currentStageSeconds =
    toNumber(
      stageDurations[
        normalizedStage
      ],
      0,
    );

  const currentStageRemaining =
    currentStageSeconds *
    (
      1 -
      normalizedRatio
    );

  let followingStagesSeconds =
    0;

  for (
    let index =
      stageIndex +
      1;
    index <
      STAGE_ORDER.length;
    index += 1
  ) {
    const nextStage =
      STAGE_ORDER[
        index
      ];

    followingStagesSeconds +=
      toNumber(
        stageDurations[
          nextStage
        ],
        0,
      );
  }

  return Math.max(
    0,
    Math.round(
      currentStageRemaining +
      followingStagesSeconds,
    ),
  );
}

/*
|--------------------------------------------------------------------------
| ESTIMATED COMPLETION DATE
|--------------------------------------------------------------------------
*/

function getEstimatedCompletionAt(
  remainingSeconds,
  now =
    new Date(),
) {
  if (
    remainingSeconds ===
      null ||
    remainingSeconds ===
      undefined
  ) {
    return null;
  }

  const date =
    new Date(
      now,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return null;
  }

  date.setSeconds(
    date.getSeconds() +
      Math.max(
        0,
        Math.round(
          toNumber(
            remainingSeconds,
            0,
          ),
        ),
      ),
  );

  return date.toISOString();
}

/*
|--------------------------------------------------------------------------
| ELAPSED SECONDS
|--------------------------------------------------------------------------
*/

function getElapsedSeconds(
  startedAt,
  now =
    new Date(),
) {
  if (!startedAt) {
    return null;
  }

  const start =
    new Date(
      startedAt,
    );

  const current =
    new Date(
      now,
    );

  if (
    Number.isNaN(
      start.getTime(),
    ) ||
    Number.isNaN(
      current.getTime(),
    )
  ) {
    return null;
  }

  return Math.max(
    0,
    Math.round(
      (
        current.getTime() -
        start.getTime()
      ) /
        1000,
    ),
  );
}

/*
|--------------------------------------------------------------------------
| SLOW PROCESS DETECTION
|--------------------------------------------------------------------------
|
| Exemple :
| estimation totale = 105 sec
| elapsed = 190 sec
| => traitement probablement plus long que prévu
|
|--------------------------------------------------------------------------
*/

function isProcessingDelayed({
  startedAt,
  estimatedTotalSeconds,
  delayFactor = 1.5,
  now =
    new Date(),
}) {
  const elapsedSeconds =
    getElapsedSeconds(
      startedAt,
      now,
    );

  if (
    elapsedSeconds ===
      null
  ) {
    return false;
  }

  const estimated =
    toNumber(
      estimatedTotalSeconds,
      0,
    );

  if (
    estimated <= 0
  ) {
    return false;
  }

  return (
    elapsedSeconds >
    estimated *
      delayFactor
  );
}

/*
|--------------------------------------------------------------------------
| STAGE LABEL
|--------------------------------------------------------------------------
*/

function getStageLabel(
  stage,
) {
  const normalizedStage =
    cleanString(
      stage,
    );

  const labels = {
    IMPORT:
      'Importation',

    EXTRACTION:
      'Extraction',

    VALIDATION:
      'Validation',

    TEIF:
      'Génération TEIF',

    SIGNATURE:
      'Signature',

    TTN:
      'Transmission TTN',
  };

  return (
    labels[
      normalizedStage
    ] ||
    normalizedStage ||
    'Traitement'
  );
}

/*
|--------------------------------------------------------------------------
| BUILD ETA
|--------------------------------------------------------------------------
|
| Fonction principale.
|
|--------------------------------------------------------------------------
*/

function buildProcessingEta({
  stage,
  status,
  startedAt = null,
  stageProgressRatio = 0,
  stageDurations =
    DEFAULT_STAGE_SECONDS,
  now =
    new Date(),
}) {
  const normalizedStage =
    cleanString(
      stage,
    );

  const normalizedStatus =
    cleanString(
      status,
    );

  const progressPercent =
    getProgressPercent({
      stage:
        normalizedStage,

      status:
        normalizedStatus,
    });

  const estimatedTotalSeconds =
    getEstimatedTotalSeconds(
      stageDurations,
    );

  const estimatedRemainingSeconds =
    getEstimatedRemainingSeconds({
      stage:
        normalizedStage,

      status:
        normalizedStatus,

      stageDurations,

      stageProgressRatio,
    });

  const estimatedCompletionAt =
    getEstimatedCompletionAt(
      estimatedRemainingSeconds,
      now,
    );

  const elapsedSeconds =
    getElapsedSeconds(
      startedAt,
      now,
    );

  const delayed =
    TERMINAL_STATUSES.has(
      normalizedStatus,
    )
      ? false
      : isProcessingDelayed({
          startedAt,

          estimatedTotalSeconds,

          now,
        });

  return {
    stage:
      normalizedStage ||
      null,

    stageLabel:
      getStageLabel(
        normalizedStage,
      ),

    status:
      normalizedStatus ||
      null,

    progressPercent,

    estimatedTotalSeconds,

    estimatedRemainingSeconds,

    estimatedRemainingLabel:
      estimatedRemainingSeconds ===
      null
        ? null
        : formatDuration(
            estimatedRemainingSeconds,
          ),

    estimatedCompletionAt,

    elapsedSeconds,

    elapsedLabel:
      elapsedSeconds ===
      null
        ? null
        : formatDuration(
            elapsedSeconds,
          ),

    delayed,

    source:
      'STATIC_FALLBACK',
  };
}

/*
|--------------------------------------------------------------------------
| BUILD NOTIFICATION META
|--------------------------------------------------------------------------
|
| Pratique pour remplir meta_json.
|
|--------------------------------------------------------------------------
*/

function buildNotificationEtaMeta(
  eta,
) {
  if (!eta) {
    return null;
  }

  return {
    current_stage:
      eta.stage,

    current_stage_label:
      eta.stageLabel,

    status:
      eta.status,

    progress_percent:
      eta.progressPercent,

    estimated_total_seconds:
      eta.estimatedTotalSeconds,

    estimated_remaining_seconds:
      eta.estimatedRemainingSeconds,

    estimated_remaining_label:
      eta.estimatedRemainingLabel,

    estimated_completion_at:
      eta.estimatedCompletionAt,

    elapsed_seconds:
      eta.elapsedSeconds,

    elapsed_label:
      eta.elapsedLabel,

    delayed:
      eta.delayed,

    eta_source:
      eta.source,
  };
}

/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
  STAGE_ORDER,
  DEFAULT_STAGE_SECONDS,
  STAGE_PROGRESS,

  formatDuration,

  getEstimatedTotalSeconds,
  getProgressPercent,
  getEstimatedRemainingSeconds,
  getEstimatedCompletionAt,
  getElapsedSeconds,

  isProcessingDelayed,

  getStageLabel,

  buildProcessingEta,
  buildNotificationEtaMeta,
};