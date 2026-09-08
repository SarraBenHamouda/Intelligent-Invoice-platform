import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  useTranslation,
} from "react-i18next";

const DEMO_STAGES = [
  {
    key: "waiting",
    duration: 900,
  },
  {
    key: "selected",
    duration: 1100,
  },
  {
    key: "uploading",
    duration: 1700,
  },
  {
    key: "extracting",
    duration: 1900,
  },
  {
    key: "validating",
    duration: 1500,
  },
  {
    key: "teif",
    duration: 1300,
  },
  {
    key: "signing",
    duration: 1500,
  },
  {
    key: "sending",
    duration: 1500,
  },
  {
    key: "accepted",
    duration: 3500,
  },
];

const PROCESS_STEPS = [
  {
    key: "import",
    icon: "📥",
  },
  {
    key: "extraction",
    icon: "🔎",
  },
  {
    key: "validation",
    icon: "✅",
  },
  {
    key: "teif",
    icon: "🧾",
  },
  {
    key: "signature",
    icon: "🔒",
  },
  {
    key: "ttn",
    icon: "📤",
  },
];

const DEMO_FIELDS = [
  {
    key: "supplier",
    value: "Tenor Afrique",
  },
  {
    key: "customer",
    value: "IT SOFT",
  },
  {
    key: "invoiceNumber",
    value: "FA260002",
  },
  {
    key: "invoiceDate",
    value: "31/12/2026",
  },
  {
    key: "lineCount",
    value: "5",
  },
  {
    key: "totalHt",
    value: "1 762,800 TND",
  },
  {
    key: "vat",
    value: "334,930 TND",
  },
  {
    key: "totalTtc",
    value: "2 097,730 TND",
  },
];

function PromotionalInvoiceDemo() {
  const {
    t,
  } = useTranslation();

  const timerRef = useRef(null);

  const [
    currentStageIndex,
    setCurrentStageIndex,
  ] = useState(0);

  const [
    uploadProgress,
    setUploadProgress,
  ] = useState(0);

  const [
    isPaused,
    setIsPaused,
  ] = useState(false);

  const [
    playCount,
    setPlayCount,
  ] = useState(0);

  const currentStage =
    DEMO_STAGES[currentStageIndex];

  useEffect(() => {
    if (isPaused) {
      return undefined;
    }

    clearCurrentTimer();

    if (
      currentStage.key ===
      "uploading"
    ) {
      startUploadAnimation();
    } else {
      setUploadProgress(
        currentStageIndex > 2
          ? 100
          : 0,
      );
    }

    timerRef.current =
      window.setTimeout(() => {
        setCurrentStageIndex(
          (previousIndex) => {
            const isLastStage =
              previousIndex ===
              DEMO_STAGES.length - 1;

            if (isLastStage) {
              setPlayCount(
                (previousCount) =>
                  previousCount + 1,
              );

              return 0;
            }

            return previousIndex + 1;
          },
        );
      }, currentStage.duration);

    return () => {
      clearCurrentTimer();
    };
  }, [
    currentStageIndex,
    isPaused,
    playCount,
  ]);

  function clearCurrentTimer() {
    if (timerRef.current) {
      window.clearTimeout(
        timerRef.current,
      );

      timerRef.current = null;
    }
  }

  function startUploadAnimation() {
    setUploadProgress(0);

    let progress = 0;

    const intervalId =
      window.setInterval(() => {
        progress += 5;

        setUploadProgress(progress);

        if (progress >= 100) {
          window.clearInterval(
            intervalId,
          );
        }
      }, 70);
  }

  function restartDemo() {
    clearCurrentTimer();

    setUploadProgress(0);
    setCurrentStageIndex(0);
    setIsPaused(false);

    setPlayCount(
      (previousCount) =>
        previousCount + 1,
    );
  }

  function togglePause() {
    setIsPaused(
      (previousValue) =>
        !previousValue,
    );
  }

  function getProcessStepState(
    stepKey,
  ) {
    const stageOrder = {
      waiting: 0,
      selected: 0,
      uploading: 0,
      extracting: 1,
      validating: 2,
      teif: 3,
      signing: 4,
      sending: 5,
      accepted: 6,
    };

    const stepOrder = {
      import: 0,
      extraction: 1,
      validation: 2,
      teif: 3,
      signature: 4,
      ttn: 5,
    };

    const currentOrder =
      stageOrder[
        currentStage.key
      ];

    const targetOrder =
      stepOrder[stepKey];

    if (
      currentStage.key ===
      "accepted"
    ) {
      return "completed";
    }

    if (
      targetOrder <
      currentOrder
    ) {
      return "completed";
    }

    if (
      targetOrder ===
      currentOrder
    ) {
      return "active";
    }

    return "waiting";
  }

  function getVisibleFieldCount() {
    const fieldCountByStage = {
      waiting: 0,
      selected: 0,
      uploading: 0,
      extracting: 4,
      validating: 8,
      teif: 8,
      signing: 8,
      sending: 8,
      accepted: 8,
    };

    return (
      fieldCountByStage[
        currentStage.key
      ] || 0
    );
  }

  function getStatusText() {
    return t(
      `promotionalDemo.status.${currentStage.key}`,
      {
        defaultValue: {
          waiting:
            "Préparation de votre facture",
          selected:
            "Facture prête à être traitée",
          uploading:
            "Ajout de votre facture",
          extracting:
            "Lecture des informations",
          validating:
            "Vérification de la facture",
          teif:
            "Préparation pour l’envoi",
          signing:
            "Sécurisation de la facture",
          sending:
            "Envoi de la facture",
          accepted:
            "Facture validée",
        }[currentStage.key],
      },
    );
  }

  function getStatusDescription() {
    return t(
      `promotionalDemo.statusDescription.${currentStage.key}`,
      {
        defaultValue: {
          waiting:
            "La plateforme prépare la prise en charge de votre facture.",
          selected:
            "Votre facture est prête à être prise en charge.",
          uploading:
            "Votre document est ajouté à votre espace.",
          extracting:
            "La plateforme lit automatiquement les informations importantes de votre facture.",
          validating:
            "Les informations sont vérifiées avant l’envoi.",
          teif:
            "Votre facture est préparée dans le format attendu pour sa transmission.",
          signing:
            "Votre facture est sécurisée avant son envoi.",
          sending:
            "Votre facture est transmise au service officiel.",
          accepted:
            "Votre facture a été acceptée et son traitement est terminé.",
        }[currentStage.key],
      },
    );
  }

  const visibleFieldCount =
    getVisibleFieldCount();

  return (
    <section
      id="promotional-demo"
      className="promotional-demo-section"
    >
      <div className="public-container">
        <div className="public-section-heading">
          <h2>
            {t(
              "promotionalDemo.title",
              {
                defaultValue:
                  "Suivez votre facture, de son ajout jusqu’à sa validation.",
              },
            )}
          </h2>
        </div>

        <div className="promotional-demo-player">
          <div className="demo-player-topbar">
            <div className="demo-window-controls">
              <span />
              <span />
              <span />
            </div>

            <div className="demo-player-title" />

            <div className="demo-live-badge">
              <span />

              {t(
                "promotionalDemo.automatic",
                {
                  defaultValue:
                    "Démonstration automatique",
                },
              )}
            </div>
          </div>

          <div className="demo-player-body">
            <div className="demo-import-column">
              <div className="demo-column-header">
                <div>
                  <span>
                    {t(
                      "promotionalDemo.importLabel",
                      {
                        defaultValue:
                          "Votre facture",
                      },
                    )}
                  </span>

                  <h3>
                    {t(
                      "promotionalDemo.importTitle",
                      {
                        defaultValue:
                          "Ajouter une facture",
                      },
                    )}
                  </h3>
                </div>

                <span className="demo-source-badge">
                  Document
                </span>
              </div>

              <div
                className={`demo-file-selector stage-${currentStage.key}`}
              >
                <div className="demo-file-icon">
                  📄
                </div>

                <div className="demo-file-information">
                  <strong>
                    FA260002.pdf
                  </strong>

                  <span>
                    426 Ko
                  </span>
                </div>

                <div className="demo-file-selection-status">
                  {currentStageIndex === 0
                    ? "···"
                    : "✓"}
                </div>
              </div>

              <div className="demo-upload-progress">
                <div className="demo-progress-header">
                  <span>
                    {getStatusText()}
                  </span>

                  <strong>
                    {currentStage.key ===
                    "waiting"
                      ? "0 %"
                      : currentStage.key ===
                          "selected"
                        ? "10 %"
                        : currentStage.key ===
                            "uploading"
                          ? `${uploadProgress} %`
                          : "100 %"}
                  </strong>
                </div>

                <div className="demo-progress-track">
                  <div
                    className="demo-progress-value"
                    style={{
                      width:
                        currentStage.key ===
                        "waiting"
                          ? "0%"
                          : currentStage.key ===
                              "selected"
                            ? "10%"
                            : currentStage.key ===
                                "uploading"
                              ? `${uploadProgress}%`
                              : "100%",
                    }}
                  />
                </div>
              </div>

              <div
                className={`demo-document-preview stage-${currentStage.key}`}
              >
                <div className="demo-document-header">
                  <div>
                    <strong>
                      TENOR AFRIQUE
                    </strong>

                    <span>
                      FACTURE
                    </span>
                  </div>

                  <span>
                    FA260002
                  </span>
                </div>

                <div className="demo-document-client">
                  <span>
                    Client
                  </span>

                  <strong>
                    IT SOFT
                  </strong>
                </div>

                <div className="demo-document-lines">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>

                <div className="demo-document-total">
                  <span>
                    Montant total
                  </span>

                  <strong>
                    2 097,730 TND
                  </strong>
                </div>

                {[
                  "extracting",
                  "validating",
                ].includes(
                  currentStage.key,
                ) && (
                  <div className="demo-scan-line" />
                )}
              </div>
            </div>

            <div className="demo-process-column">
              <div className="demo-status-card">
                <div
                  className={`demo-main-status status-${currentStage.key}`}
                >
                  <span className="demo-main-status-icon">
                    {currentStage.key ===
                    "accepted"
                      ? "✓"
                      : "●"}
                  </span>

                  <div>
                    <strong>
                      {getStatusText()}
                    </strong>

                    <p>
                      {getStatusDescription()}
                    </p>
                  </div>
                </div>
              </div>

              <div className="demo-process-list">
                {PROCESS_STEPS.map(
                  (step) => {
                    const state =
                      getProcessStepState(
                        step.key,
                      );

                    return (
                      <div
                        key={step.key}
                        className={`demo-process-step ${state}`}
                      >
                        <span className="demo-process-step-icon">
                          {state ===
                          "completed"
                            ? "✓"
                            : step.icon}
                        </span>

                        <div>
                          <strong>
                            {t(
                              `promotionalDemo.steps.${step.key}`,
                              {
                                defaultValue: {
                                  import:
                                    "Ajout de la facture",
                                  extraction:
                                    "Lecture des informations",
                                  validation:
                                    "Vérification des données",
                                  teif:
                                    "Préparation du document",
                                  signature:
                                    "Validation",
                                  ttn:
                                    "Envoi et confirmation",
                                }[step.key],
                              },
                            )}
                          </strong>

                          <span>
                            {state ===
                            "completed"
                              ? t(
                                  "promotionalDemo.completed",
                                  {
                                    defaultValue:
                                      "Terminée",
                                  },
                                )
                              : state ===
                                  "active"
                                ? t(
                                    "promotionalDemo.inProgress",
                                    {
                                      defaultValue:
                                        "En cours",
                                    },
                                  )
                                : t(
                                    "promotionalDemo.waiting",
                                    {
                                      defaultValue:
                                        "En attente",
                                    },
                                  )}
                          </span>
                        </div>

                        {state ===
                          "active" && (
                          <span className="demo-process-spinner" />
                        )}
                      </div>
                    );
                  },
                )}
              </div>

              <div className="demo-extracted-data">
                <div className="demo-data-header">
                  <strong>
                    {t(
                      "promotionalDemo.detectedData",
                      {
                        defaultValue:
                          "Informations de la facture",
                      },
                    )}
                  </strong>

                  <span>
                    Vérifiées
                  </span>
                </div>

                <div className="demo-data-grid">
                  {DEMO_FIELDS.map(
                    (
                      field,
                      index,
                    ) => (
                      <div
                        key={field.key}
                        className={`demo-data-field ${
                          index <
                          visibleFieldCount
                            ? "visible"
                            : ""
                        }`}
                      >
                        <span>
                          {t(
                            `promotionalDemo.fields.${field.key}`,
                            {
                              defaultValue: {
                                supplier:
                                  "Fournisseur",
                                customer:
                                  "Client",
                                invoiceNumber:
                                  "N° de facture",
                                invoiceDate:
                                  "Date",
                                lineCount:
                                  "Articles",
                                totalHt:
                                  "Montant HT",
                                vat:
                                  "TVA",
                                totalTtc:
                                  "Montant total",
                              }[field.key],
                            },
                          )}
                        </span>

                        <strong>
                          {field.value}
                        </strong>
                      </div>
                    ),
                  )}
                </div>
              </div>

              <div
                className={`demo-accepted-result ${
                  currentStage.key ===
                  "accepted"
                    ? "visible"
                    : ""
                }`}
              >
                <div className="accepted-result-icon">
                  ✓
                </div>

                <div className="accepted-result-content">
                  <strong>
                    {t(
                      "promotionalDemo.acceptedTitle",
                      {
                        defaultValue:
                          "Votre facture est validée",
                      },
                    )}
                  </strong>

                  <span>
                    Confirmation enregistrée
                  </span>
                </div>

                <div className="demo-qr-code">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          </div>

          <div className="demo-player-footer">
            <div className="demo-player-controls">
              <button
                type="button"
                className="demo-control-button"
                onClick={togglePause}
              >
                {isPaused
                  ? "▶"
                  : "⏸"}

                <span>
                  {isPaused
                    ? t(
                        "promotionalDemo.play",
                        {
                          defaultValue:
                            "Continuer",
                        },
                      )
                    : t(
                        "promotionalDemo.pause",
                        {
                          defaultValue:
                            "Pause",
                        },
                      )}
                </span>
              </button>

              <button
                type="button"
                className="demo-control-button"
                onClick={restartDemo}
              >
                ↻

                <span>
                  {t(
                    "promotionalDemo.replay",
                    {
                      defaultValue:
                        "Recommencer",
                    },
                  )}
                </span>
              </button>
            </div>

            <div className="demo-stage-indicators">
              {DEMO_STAGES.map(
                (
                  stage,
                  index,
                ) => (
                  <span
                    key={stage.key}
                    className={
                      index ===
                      currentStageIndex
                        ? "active"
                        : index <
                            currentStageIndex
                          ? "completed"
                          : ""
                    }
                  />
                ),
              )}
            </div>

            <span className="demo-auto-replay">
              ●{" "}
              {t(
                "promotionalDemo.autoReplay",
                {
                  defaultValue:
                    "La démonstration redémarre automatiquement",
                },
              )}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default PromotionalInvoiceDemo;