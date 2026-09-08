import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Link,
} from "react-router-dom";

import AdminShell from "../AdminShell/AdminShell";

import {
  getAccessToken,
} from "../../../../services/authService";

import "./AdminExecutionsPage.css";

/*
|--------------------------------------------------------------------------
| CONFIG
|--------------------------------------------------------------------------
*/

const API_BASE_URL =
  String(
    import.meta.env.VITE_API_URL ||
      "http://localhost:3000",
  ).replace(/\/+$/, "");

const AUTO_REFRESH_INTERVAL =
  15000;

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function safeArray(
  value,
) {
  return Array.isArray(
    value,
  )
    ? value
    : [];
}

function normalize(
  value,
) {
  return String(
    value || "",
  )
    .trim()
    .toUpperCase();
}

function formatInteger(
  value,
) {
  const number =
    Number(value);

  return new Intl.NumberFormat(
    "fr-FR",
  ).format(
    Number.isFinite(
      number,
    )
      ? number
      : 0,
  );
}

function formatDateTime(
  value,
) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "fr-FR",
    {
      dateStyle:
        "short",

      timeStyle:
        "short",
    },
  ).format(
    date,
  );
}

function formatDuration(
  value,
) {
  const seconds =
    Math.max(
      0,
      Number(
        value ||
          0,
      ),
    );

  if (
    seconds <
    60
  ) {
    return `${seconds} s`;
  }

  const minutes =
    Math.floor(
      seconds /
        60,
    );

  const remainingSeconds =
    seconds %
    60;

  if (
    minutes <
    60
  ) {
    return `${minutes} min ${remainingSeconds} s`;
  }

  const hours =
    Math.floor(
      minutes /
        60,
    );

  const remainingMinutes =
    minutes %
    60;

  return `${hours} h ${remainingMinutes} min`;
}

function getExecutionStatusData(
  value,
) {
  const status =
    normalize(
      value,
    );

  if (
    status ===
    "COMPLETED"
  ) {
    return {
      label:
        "Terminée",

      icon:
        "✅",

      className:
        "admin-executions-status--completed",
    };
  }

  if (
    status ===
    "RUNNING"
  ) {
    return {
      label:
        "En cours",

      icon:
        "⚡",

      className:
        "admin-executions-status--running",
    };
  }

  if (
    status ===
    "PAUSED"
  ) {
    return {
      label:
        "En attente",

      icon:
        "⏸️",

      className:
        "admin-executions-status--paused",
    };
  }

  if (
    status ===
    "FAILED"
  ) {
    return {
      label:
        "Échec",

      icon:
        "❌",

      className:
        "admin-executions-status--failed",
    };
  }

  return {
    label:
      "Inconnue",

    icon:
      "❔",

    className:
      "admin-executions-status--unknown",
  };
}

function getStageLabel(
  value,
) {
  const stage =
    normalize(
      value,
    );

  const labels = {
    IMPORT:
      "Import",

    EXTRACTION:
      "Extraction",

    VALIDATION:
      "Validation",

    TEIF:
      "TEIF",

    SIGNATURE:
      "Signature",

    TTN:
      "TTN",
  };

  return (
    labels[
      stage
    ] ||
    stage ||
    "Inconnue"
  );
}

function getSourceLabel(
  value,
) {
  const source =
    normalize(
      value,
    );

  if (
    source ===
    "PDF_TEXT"
  ) {
    return "PDF";
  }

  if (
    source ===
      "OCR_TESSERACT" ||
    source ===
      "OCR"
  ) {
    return "OCR";
  }

  if (
    source ===
    "ERP"
  ) {
    return "ERP";
  }

  return (
    source ||
    "UNKNOWN"
  );
}

function getProgressClass(
  execution,
) {
  const status =
    normalize(
      execution.execution_status,
    );

  if (
    status ===
    "COMPLETED"
  ) {
    return "admin-executions-progress--completed";
  }

  if (
    status ===
    "FAILED"
  ) {
    return "admin-executions-progress--failed";
  }

  if (
    status ===
    "PAUSED"
  ) {
    return "admin-executions-progress--paused";
  }

  return "admin-executions-progress--running";
}

/*
|--------------------------------------------------------------------------
| PAGE
|--------------------------------------------------------------------------
*/

function AdminExecutionsPage() {
  const [
    executions,
    setExecutions,
  ] =
    useState([]);

  const [
    stats,
    setStats,
  ] =
    useState({});

  const [
    pipeline,
    setPipeline,
  ] =
    useState({});

  const [
    sources,
    setSources,
  ] =
    useState([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    executionStatusFilter,
    setExecutionStatusFilter,
  ] =
    useState("");

  const [
    stageFilter,
    setStageFilter,
  ] =
    useState("");

  const [
    sourceFilter,
    setSourceFilter,
  ] =
    useState("");

  const [
    organizationFilter,
    setOrganizationFilter,
  ] =
    useState("");

  /*
  |--------------------------------------------------------------------------
  | LOAD
  |--------------------------------------------------------------------------
  */

  const loadExecutions =
    useCallback(
      async ({
        silent = false,
      } = {}) => {
        const token =
          getAccessToken();

        if (!token) {
          setError(
            "Session administrateur introuvable.",
          );

          setLoading(
            false,
          );

          return;
        }

        if (silent) {
          setRefreshing(
            true,
          );
        } else {
          setLoading(
            true,
          );
        }

        try {
          const response =
            await fetch(
              `${API_BASE_URL}/api/admin/executions`,
              {
                method:
                  "GET",

                headers: {
                  Accept:
                    "application/json",

                  Authorization:
                    `Bearer ${token}`,
                },

                cache:
                  "no-store",
              },
            );

          const responseText =
            await response.text();

          let data =
            {};

          if (
            responseText
          ) {
            try {
              data =
                JSON.parse(
                  responseText,
                );
            } catch {
              data = {
                message:
                  responseText,
              };
            }
          }

          if (
            !response.ok
          ) {
            throw new Error(
              data?.message ||
                `Erreur HTTP ${response.status}`,
            );
          }

          setExecutions(
            safeArray(
              data?.executions,
            ),
          );

          setStats(
            data?.stats ||
              {},
          );

          setPipeline(
            data?.pipeline ||
              {},
          );

          setSources(
            safeArray(
              data?.sources,
            ),
          );

          setError(
            "",
          );
        } catch (
          loadError
        ) {
          console.error(
            "Admin executions error:",
            loadError,
          );

          setError(
            loadError?.message ||
              "Impossible de charger les exécutions.",
          );
        } finally {
          setLoading(
            false,
          );

          setRefreshing(
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
    loadExecutions();

    const interval =
      window.setInterval(
        () => {
          loadExecutions({
            silent:
              true,
          });
        },
        AUTO_REFRESH_INTERVAL,
      );

    return () => {
      window.clearInterval(
        interval,
      );
    };
  }, [
    loadExecutions,
  ]);

  /*
  |--------------------------------------------------------------------------
  | ORGANIZATIONS
  |--------------------------------------------------------------------------
  */

  const organizations =
    useMemo(
      () =>
        [
          ...new Set(
            executions
              .map(
                (
                  execution,
                ) =>
                  String(
                    execution.organization_name ||
                      "",
                  ).trim(),
              )
              .filter(Boolean),
          ),
        ].sort(),
      [
        executions,
      ],
    );

  /*
  |--------------------------------------------------------------------------
  | FILTER
  |--------------------------------------------------------------------------
  */

  const filteredExecutions =
    useMemo(
      () => {
        const needle =
          search
            .trim()
            .toLowerCase();

        return executions.filter(
          (
            execution,
          ) => {
            if (
              executionStatusFilter &&
              normalize(
                execution.execution_status,
              ) !==
                executionStatusFilter
            ) {
              return false;
            }

            if (
              stageFilter &&
              normalize(
                execution.current_stage,
              ) !==
                stageFilter
            ) {
              return false;
            }

            if (
              sourceFilter &&
              normalize(
                getSourceLabel(
                  execution.source,
                ),
              ) !==
                normalize(
                  sourceFilter,
                )
            ) {
              return false;
            }

            if (
              organizationFilter &&
              execution.organization_name !==
                organizationFilter
            ) {
              return false;
            }

            if (
              !needle
            ) {
              return true;
            }

            const haystack =
              [
                execution.invoice_number,
                execution.original_filename,
                execution.organization_name,
                execution.client_name,
                execution.client_email,
                execution.source,
                execution.current_stage,
                execution.execution_status,
                execution.status,
                execution.error_code,
                execution.error_message,
                execution.transaction_id,
                execution.ttn_reference,
              ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return haystack.includes(
              needle,
            );
          },
        );
      },
      [
        executions,
        search,
        executionStatusFilter,
        stageFilter,
        sourceFilter,
        organizationFilter,
      ],
    );

  /*
  |--------------------------------------------------------------------------
  | RESET
  |--------------------------------------------------------------------------
  */

  function resetFilters() {
    setSearch(
      "",
    );

    setExecutionStatusFilter(
      "",
    );

    setStageFilter(
      "",
    );

    setSourceFilter(
      "",
    );

    setOrganizationFilter(
      "",
    );
  }

  /*
  |--------------------------------------------------------------------------
  | ACTIONS
  |--------------------------------------------------------------------------
  */

  const actions = (
    <button
      type="button"
      className="admin-action-btn"
      disabled={
        refreshing
      }
      onClick={() =>
        loadExecutions({
          silent:
            true,
        })
      }
    >
      {refreshing
        ? "Actualisation..."
        : "↻ Actualiser"}
    </button>
  );

  return (
    <AdminShell
      eyebrow="Supervision des workflows"
      title="Exécutions"
      actions={
        actions
      }
    >
      <section className="admin-executions">
        {/*
        |--------------------------------------------------------------------------
        | ERROR
        |--------------------------------------------------------------------------
        */}

        {error && (
          <article className="admin-executions__error">
            <div>
              <strong>
                ⚠ Impossible de charger les exécutions
              </strong>

              <p>
                {
                  error
                }
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                loadExecutions()
              }
            >
              Réessayer
            </button>
          </article>
        )}

        {/*
        |--------------------------------------------------------------------------
        | STATS
        |--------------------------------------------------------------------------
        */}

        <div className="admin-executions__stats">
          <button
            type="button"
            className="admin-executions-stat admin-executions-stat--purple"
            onClick={
              resetFilters
            }
          >
            <span>
              🔄 Exécutions
            </span>

            <strong>
              {formatInteger(
                stats.total,
              )}
            </strong>

            <small>
              Toutes les exécutions
            </small>
          </button>

          <button
            type="button"
            className="admin-executions-stat admin-executions-stat--green"
            onClick={() =>
              setExecutionStatusFilter(
                "COMPLETED",
              )
            }
          >
            <span>
              ✅ Terminées
            </span>

            <strong>
              {formatInteger(
                stats.completed,
              )}
            </strong>

            <small>
              Workflow terminé
            </small>
          </button>

          <button
            type="button"
            className="admin-executions-stat admin-executions-stat--blue"
            onClick={() =>
              setExecutionStatusFilter(
                "RUNNING",
              )
            }
          >
            <span>
              ⚡ En cours
            </span>

            <strong>
              {formatInteger(
                stats.running,
              )}
            </strong>

            <small>
              Traitement actif
            </small>
          </button>

          <button
            type="button"
            className="admin-executions-stat admin-executions-stat--orange"
            onClick={() =>
              setExecutionStatusFilter(
                "PAUSED",
              )
            }
          >
            <span>
              ⏸️ En attente
            </span>

            <strong>
              {formatInteger(
                stats.paused,
              )}
            </strong>

            <small>
              Intervention ou reprise
            </small>
          </button>

          <button
            type="button"
            className="admin-executions-stat admin-executions-stat--red"
            onClick={() =>
              setExecutionStatusFilter(
                "FAILED",
              )
            }
          >
            <span>
              ❌ Échecs
            </span>

            <strong>
              {formatInteger(
                stats.failed,
              )}
            </strong>

            <small>
              Workflow interrompu
            </small>
          </button>
        </div>

        {/*
        |--------------------------------------------------------------------------
        | PIPELINE OVERVIEW
        |--------------------------------------------------------------------------
        */}

        <article className="admin-executions-pipeline">
          <header className="admin-executions-section-header">
            <div>
              <span>
                Pipeline métier
              </span>

              <h2>
                Répartition des exécutions
              </h2>

              <p>
                Position actuelle des factures dans les différentes étapes du workflow.
              </p>
            </div>

            <div className="admin-executions-pipeline__duration">
              <span>
                Temps moyen
              </span>

              <strong>
                {formatDuration(
                  stats.average_duration_seconds,
                )}
              </strong>
            </div>
          </header>

          <div className="admin-executions-pipeline__steps">
            {[
              {
                key:
                  "IMPORT",

                icon:
                  "📥",
              },

              {
                key:
                  "EXTRACTION",

                icon:
                  "🧠",
              },

              {
                key:
                  "VALIDATION",

                icon:
                  "✅",
              },

              {
                key:
                  "TEIF",

                icon:
                  "🧾",
              },

              {
                key:
                  "SIGNATURE",

                icon:
                  "✍️",
              },

              {
                key:
                  "TTN",

                icon:
                  "📡",
              },
            ].map(
              (
                stage,
                index,
              ) => (
                <button
                  type="button"
                  key={
                    stage.key
                  }
                  className="admin-executions-pipeline__step"
                  onClick={() =>
                    setStageFilter(
                      stage.key,
                    )
                  }
                >
                  <span className="admin-executions-pipeline__step-number">
                    {String(
                      index +
                        1,
                    ).padStart(
                      2,
                      "0",
                    )}
                  </span>

                  <span className="admin-executions-pipeline__step-icon">
                    {
                      stage.icon
                    }
                  </span>

                  <strong>
                    {getStageLabel(
                      stage.key,
                    )}
                  </strong>

                  <em>
                    {formatInteger(
                      pipeline?.[
                        stage.key
                      ],
                    )}
                  </em>
                </button>
              ),
            )}
          </div>
        </article>

        {/*
        |--------------------------------------------------------------------------
        | SOURCE DISTRIBUTION
        |--------------------------------------------------------------------------
        */}

        <article className="admin-executions-sources">
          <header>
            <div>
              <span>
                Origine
              </span>

              <h2>
                Sources des traitements
              </h2>
            </div>
          </header>

          <div className="admin-executions-sources__grid">
            {sources.length ===
            0 ? (
              <p className="admin-executions-muted">
                Aucune source disponible.
              </p>
            ) : (
              sources.map(
                (
                  source,
                ) => (
                  <button
                    type="button"
                    key={
                      source.source
                    }
                    onClick={() =>
                      setSourceFilter(
                        getSourceLabel(
                          source.source,
                        ),
                      )
                    }
                  >
                    <span>
                      {getSourceLabel(
                        source.source,
                      )}
                    </span>

                    <strong>
                      {formatInteger(
                        source.total,
                      )}
                    </strong>
                  </button>
                ),
              )
            )}
          </div>
        </article>

        {/*
        |--------------------------------------------------------------------------
        | FILTERS
        |--------------------------------------------------------------------------
        */}

        <article className="admin-executions__filters">
          <div className="admin-executions-search">
            <span>
              🔎
            </span>

            <input
              type="search"
              value={
                search
              }
              onChange={(
                event,
              ) =>
                setSearch(
                  event.target.value,
                )
              }
              placeholder="Facture, client, organisation, erreur, transaction..."
            />
          </div>

          <select
            value={
              executionStatusFilter
            }
            onChange={(
              event,
            ) =>
              setExecutionStatusFilter(
                event.target.value,
              )
            }
          >
            <option value="">
              Tous les états
            </option>

            <option value="COMPLETED">
              Terminée
            </option>

            <option value="RUNNING">
              En cours
            </option>

            <option value="PAUSED">
              En attente
            </option>

            <option value="FAILED">
              Échec
            </option>
          </select>

          <select
            value={
              stageFilter
            }
            onChange={(
              event,
            ) =>
              setStageFilter(
                event.target.value,
              )
            }
          >
            <option value="">
              Toutes les étapes
            </option>

            <option value="IMPORT">
              Import
            </option>

            <option value="EXTRACTION">
              Extraction
            </option>

            <option value="VALIDATION">
              Validation
            </option>

            <option value="TEIF">
              TEIF
            </option>

            <option value="SIGNATURE">
              Signature
            </option>

            <option value="TTN">
              TTN
            </option>
          </select>

          <select
            value={
              sourceFilter
            }
            onChange={(
              event,
            ) =>
              setSourceFilter(
                event.target.value,
              )
            }
          >
            <option value="">
              Toutes les sources
            </option>

            <option value="PDF">
              PDF
            </option>

            <option value="OCR">
              OCR
            </option>

            <option value="ERP">
              ERP
            </option>
          </select>

          <select
            value={
              organizationFilter
            }
            onChange={(
              event,
            ) =>
              setOrganizationFilter(
                event.target.value,
              )
            }
          >
            <option value="">
              Toutes les organisations
            </option>

            {organizations.map(
              (
                organization,
              ) => (
                <option
                  key={
                    organization
                  }
                  value={
                    organization
                  }
                >
                  {
                    organization
                  }
                </option>
              ),
            )}
          </select>

          <button
            type="button"
            className="admin-executions__reset"
            onClick={
              resetFilters
            }
          >
            Réinitialiser
          </button>
        </article>

        {/*
        |--------------------------------------------------------------------------
        | EXECUTIONS PANEL
        |--------------------------------------------------------------------------
        */}

        <article className="admin-executions__panel">
          <header className="admin-executions__panel-header">
            <div>
              <span>
                Suivi opérationnel
              </span>

              <h2>
                Exécutions métier
              </h2>

              <p>
                {formatInteger(
                  filteredExecutions.length,
                )} résultat(s)
              </p>
            </div>
          </header>

          {loading ? (
            <div className="admin-executions__loading">
              <span />

              <p>
                Chargement des exécutions...
              </p>
            </div>
          ) : filteredExecutions.length ===
            0 ? (
            <div className="admin-executions__empty">
              <span>
                🔄
              </span>

              <h3>
                Aucune exécution
              </h3>

              <p>
                Aucune exécution ne correspond aux filtres sélectionnés.
              </p>
            </div>
          ) : (
            <div className="admin-executions-list">
              {filteredExecutions.map(
                (
                  execution,
                ) => {
                  const status =
                    getExecutionStatusData(
                      execution.execution_status,
                    );

                  const progress =
                    Math.min(
                      100,
                      Math.max(
                        0,
                        Number(
                          execution.progress_percent ||
                            0,
                        ),
                      ),
                    );

                  return (
                    <article
                      key={
                        execution.execution_id
                      }
                      className="admin-execution-card"
                    >
                      {/*
                      |--------------------------------------------------------------------------
                      | HEADER
                      |--------------------------------------------------------------------------
                      */}

                      <div className="admin-execution-card__header">
                        <div className="admin-execution-card__identity">
                          <span className="admin-execution-card__icon">
                            🔄
                          </span>

                          <div>
                            <span className="admin-execution-card__eyebrow">
                              Exécution
                            </span>

                            <h3>
                              {execution.invoice_number ||
                                "Facture sans numéro"}
                            </h3>

                            <small>
                              {execution.original_filename ||
                                execution.execution_id}
                            </small>
                          </div>
                        </div>

                        <span
                          className={`admin-executions-status ${status.className}`}
                        >
                          <span>
                            {
                              status.icon
                            }
                          </span>

                          {
                            status.label
                          }
                        </span>
                      </div>

                      {/*
                      |--------------------------------------------------------------------------
                      | META
                      |--------------------------------------------------------------------------
                      */}

                      <div className="admin-execution-card__meta">
                        <span>
                          🏢 {execution.organization_name ||
                            "Organisation inconnue"}
                        </span>

                        <span>
                          👤 {execution.client_name ||
                            "Client"}
                        </span>

                        <span>
                          📥 {getSourceLabel(
                            execution.source,
                          )}
                        </span>

                        <span>
                          🕒 {formatDateTime(
                            execution.started_at,
                          )}
                        </span>
                      </div>

                      {/*
                      |--------------------------------------------------------------------------
                      | PROGRESS
                      |--------------------------------------------------------------------------
                      */}

                      <div className="admin-execution-card__progress">
                        <div className="admin-execution-card__progress-head">
                          <div>
                            <span>
                              Étape actuelle
                            </span>

                            <strong>
                              {getStageLabel(
                                execution.current_stage,
                              )}
                            </strong>
                          </div>

                          <strong>
                            {progress} %
                          </strong>
                        </div>

                        <div className="admin-execution-card__progress-track">
                          <span
                            className={`admin-execution-card__progress-value ${getProgressClass(
                              execution,
                            )}`}
                            style={{
                              width:
                                `${progress}%`,
                            }}
                          />
                        </div>
                      </div>

                      {/*
                      |--------------------------------------------------------------------------
                      | PIPELINE STEPS
                      |--------------------------------------------------------------------------
                      */}

                      <div className="admin-execution-card__pipeline">
                        {[
                          "IMPORT",
                          "EXTRACTION",
                          "VALIDATION",
                          "TEIF",
                          "SIGNATURE",
                          "TTN",
                        ].map(
                          (
                            stage,
                            index,
                            allStages,
                          ) => {
                            const currentStage =
                              normalize(
                                execution.current_stage,
                              );

                            const currentIndex =
                              allStages.indexOf(
                                currentStage,
                              );

                            const isCompleted =
                              normalize(
                                execution.execution_status,
                              ) ===
                              "COMPLETED"
                                ? true
                                : currentIndex >
                                  index;

                            const isCurrent =
                              currentStage ===
                              stage;

                            return (
                              <div
                                key={
                                  stage
                                }
                                className={`admin-execution-card__pipeline-step${
                                  isCompleted
                                    ? " admin-execution-card__pipeline-step--done"
                                    : ""
                                }${
                                  isCurrent
                                    ? " admin-execution-card__pipeline-step--current"
                                    : ""
                                }`}
                              >
                                <span>
                                  {isCompleted
                                    ? "✓"
                                    : index +
                                      1}
                                </span>

                                <strong>
                                  {getStageLabel(
                                    stage,
                                  )}
                                </strong>
                              </div>
                            );
                          },
                        )}
                      </div>

                      {/*
                      |--------------------------------------------------------------------------
                      | ERROR
                      |--------------------------------------------------------------------------
                      */}

                      {(execution.has_error ||
                        execution.execution_status ===
                          "FAILED" ||
                        execution.execution_status ===
                          "PAUSED") && (
                        <div className="admin-execution-card__error">
                          <span>
                            ⚠
                          </span>

                          <div>
                            <strong>
                              {execution.error_code ||
                                (
                                  execution.execution_status ===
                                  "PAUSED"
                                    ? "EXECUTION_PAUSED"
                                    : "EXECUTION_FAILED"
                                )}
                            </strong>

                            <p>
                              {execution.error_message ||
                                (
                                  execution.execution_status ===
                                  "PAUSED"
                                    ? "L’exécution est en attente d’une intervention ou d’une reprise."
                                    : "Le traitement n’a pas pu être terminé."
                                )}
                            </p>
                          </div>
                        </div>
                      )}

                      {/*
                      |--------------------------------------------------------------------------
                      | FOOTER
                      |--------------------------------------------------------------------------
                      */}

                      <footer className="admin-execution-card__footer">
                        <div className="admin-execution-card__metrics">
                          <div>
                            <span>
                              Durée
                            </span>

                            <strong>
                              {formatDuration(
                                execution.duration_seconds,
                              )}
                            </strong>
                          </div>

                          <div>
                            <span>
                              Dernière activité
                            </span>

                            <strong>
                              {formatDateTime(
                                execution.last_activity_at,
                              )}
                            </strong>
                          </div>

                          <div>
                            <span>
                              Retry
                            </span>

                            <strong>
                              {execution.can_retry
                                ? "Oui"
                                : "Non"}
                            </strong>
                          </div>
                        </div>

                        <div className="admin-execution-card__actions">
                          {execution.can_retry && (
                            <span className="admin-execution-card__retry">
                              🔁 Relançable
                            </span>
                          )}

                          <Link
                            to={`/admin/invoices/${execution.invoice_id}`}
                          >
                            Voir la facture
                            <span>
                              →
                            </span>
                          </Link>
                        </div>
                      </footer>
                    </article>
                  );
                },
              )}
            </div>
          )}
        </article>
      </section>
    </AdminShell>
  );
}

export default AdminExecutionsPage;