import {
  useEffect,
  useState,
} from "react";

import {
  Link,
} from "react-router-dom";

import "./DashboardWelcome.css";

const WORKFLOW_WORDS = [
  {
    text: "extraites",
    tone: "blue",
  },
  {
    text: "validées",
    tone: "green",
  },
  {
    text: "signées",
    tone: "purple",
  },
  {
    text: "transmises",
    tone: "pink",
  },
  {
    text: "automatisées",
    tone: "yellow",
  },
];

function DashboardWelcome({
  displayName,
  organizationName,
}) {
  const [
    currentWordIndex,
    setCurrentWordIndex,
  ] = useState(0);

  const [
    wordVisible,
    setWordVisible,
  ] = useState(true);

  useEffect(() => {
    const intervalId =
      window.setInterval(
        () => {
          setWordVisible(
            false,
          );

          window.setTimeout(
            () => {
              setCurrentWordIndex(
                (current) =>
                  (
                    current +
                    1
                  ) %
                  WORKFLOW_WORDS.length,
              );

              setWordVisible(
                true,
              );
            },
            250,
          );
        },
        2600,
      );

    return () => {
      window.clearInterval(
        intervalId,
      );
    };
  }, []);

  const currentWord =
    WORKFLOW_WORDS[
      currentWordIndex
    ];

  return (
    <section className="dashboard-welcome-panel">
      {/*
      |--------------------------------------------------------------------------
      | DECORATIONS
      |--------------------------------------------------------------------------
      */}

      <span className="dashboard-welcome-orb dashboard-welcome-orb--one" />

      <span className="dashboard-welcome-orb dashboard-welcome-orb--two" />

      <span className="dashboard-welcome-orb dashboard-welcome-orb--three" />

      {/*
      |--------------------------------------------------------------------------
      | FLOATING CARD - ANALYSIS
      |--------------------------------------------------------------------------
      */}

      <div className="dashboard-floating-card dashboard-floating-card--analysis">
        <span>
          Facture analysée
        </span>

        <strong>
          FA260002
        </strong>

        <small>
          ✓ Validée
        </small>
      </div>

      {/*
      |--------------------------------------------------------------------------
      | FLOATING CARD - TTN
      |--------------------------------------------------------------------------
      */}

      <div className="dashboard-floating-card dashboard-floating-card--ttn">
        <span>
          Transmission TTN
        </span>

        <strong>
          Terminée
        </strong>

        <small>
          ✓ Acceptée
        </small>
      </div>

      {/*
      |--------------------------------------------------------------------------
      | MAIN CONTENT
      |--------------------------------------------------------------------------
      */}

      <div className="dashboard-welcome-copy">
        

        <h1>
          Bonjour{" "}
          <span>
            {displayName}
          </span>
        </h1>

        <div className="dashboard-welcome-animated-title">
          <span className="dashboard-welcome-animated-prefix">
            Vos factures sont
          </span>

          <span
            className={[
              "dashboard-welcome-dynamic-word",
              `dashboard-welcome-dynamic-word--${currentWord.tone}`,
              wordVisible
                ? "is-visible"
                : "is-hidden",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <i
              aria-hidden="true"
            />

            {currentWord.text}
          </span>
        </div>

        <p>
          Suivez vos factures
          depuis leur import
          jusqu’à leur acceptation
          TTN, depuis un seul
          tableau de bord.
        </p>


      </div>

      {/*
      |--------------------------------------------------------------------------
      | ACTIONS
      |--------------------------------------------------------------------------
      */}

      
    </section>
  );
}

export default DashboardWelcome;