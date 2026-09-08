import {
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import {
  resetPassword,
} from "../services/authService";

import logoDark from "../assets/logo-dark.png";
import logoLight from "../assets/logo-light.png";

import "./public/styles/PasswordResetPage.css";

function ResetPasswordPage() {
  const navigate =
    useNavigate();

  const [
    searchParams,
  ] =
    useSearchParams();

  const token =
    String(
      searchParams.get(
        "token",
      ) || "",
    ).trim();

  const [
    password,
    setPassword,
  ] =
    useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] =
    useState("");

  const [
    showPassword,
    setShowPassword,
  ] =
    useState(false);

  const [
    showConfirmPassword,
    setShowConfirmPassword,
  ] =
    useState(false);

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    success,
    setSuccess,
  ] =
    useState("");

  /*
  |--------------------------------------------------------------------------
  | TOKEN
  |--------------------------------------------------------------------------
  */

  const validToken =
    useMemo(
      () =>
        Boolean(
          token,
        ),
      [
        token,
      ],
    );

  /*
  |--------------------------------------------------------------------------
  | PASSWORD STRENGTH
  |--------------------------------------------------------------------------
  */

  const passwordStrength =
    useMemo(
      () => {
        if (!password) {
          return 0;
        }

        let score =
          0;

        if (
          password.length >=
          8
        ) {
          score += 1;
        }

        if (
          /[A-Z]/.test(
            password,
          )
        ) {
          score += 1;
        }

        if (
          /[a-z]/.test(
            password,
          )
        ) {
          score += 1;
        }

        if (
          /\d/.test(
            password,
          )
        ) {
          score += 1;
        }

        if (
          /[^A-Za-z0-9]/.test(
            password,
          )
        ) {
          score += 1;
        }

        return score;
      },
      [
        password,
      ],
    );

  const passwordStrengthLabel =
    useMemo(
      () => {
        switch (
          passwordStrength
        ) {
          case 1:
            return "Très faible";

          case 2:
            return "Faible";

          case 3:
            return "Correct";

          case 4:
            return "Bon";

          case 5:
            return "Très bon";

          default:
            return "Non évalué";
        }
      },
      [
        passwordStrength,
      ],
    );

  /*
  |--------------------------------------------------------------------------
  | SUBMIT
  |--------------------------------------------------------------------------
  */

  async function handleSubmit(
    event,
  ) {
    event.preventDefault();

    setError("");

    if (!token) {
      setError(
        "Le lien de réinitialisation est invalide.",
      );

      return;
    }

    if (
      password.length <
      8
    ) {
      setError(
        "Le mot de passe doit contenir au moins 8 caractères.",
      );

      return;
    }

    if (
      password !==
      confirmPassword
    ) {
      setError(
        "Les mots de passe ne correspondent pas.",
      );

      return;
    }

    setLoading(
      true,
    );

    try {
      const result =
        await resetPassword({
          token,
          password,
          confirmPassword,
        });

      setSuccess(
        result?.message ||
          "Votre mot de passe a été modifié avec succès.",
      );

      window.setTimeout(
        () => {
          navigate(
            "/auth?mode=login&success=Mot%20de%20passe%20modifié%20avec%20succès.",
            {
              replace:
                true,
            },
          );
        },
        1800,
      );
    } catch (
      submitError
    ) {
      setError(
        submitError?.message ||
          "Impossible de modifier le mot de passe.",
      );
    } finally {
      setLoading(
        false,
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | RENDER
  |--------------------------------------------------------------------------
  */

  return (
    <main className="password-reset-page">
      <section className="password-reset-card">
        {/*
        |--------------------------------------------------------------------------
        | TENOR LOGO
        |--------------------------------------------------------------------------
        */}

        <div className="password-reset-brand">
          <button
            type="button"
            className="password-reset-logo-button"
            onClick={() =>
              navigate("/")
            }
            aria-label="Retour à l'accueil"
          >
            <img
              src={
                logoDark
              }
              alt="Tenor Afrique"
              className="password-reset-logo password-reset-logo--dark"
            />

            <img
              src={
                logoLight
              }
              alt="Tenor Afrique"
              className="password-reset-logo password-reset-logo--light"
            />
          </button>
        </div>

        <span className="password-reset-eyebrow">
          Sécurité du compte
        </span>

        <h1>
          Nouveau mot de passe
        </h1>

        <p className="password-reset-description">
          Choisissez un nouveau mot de passe
          pour sécuriser votre compte.
        </p>

        {/*
        |--------------------------------------------------------------------------
        | INVALID TOKEN
        |--------------------------------------------------------------------------
        */}

        {!validToken && (
          <div className="password-reset-message password-reset-message--error">
            Le lien de réinitialisation est invalide
            ou incomplet.
          </div>
        )}

        {/*
        |--------------------------------------------------------------------------
        | ERROR
        |--------------------------------------------------------------------------
        */}

        {error && (
          <div className="password-reset-message password-reset-message--error">
            {error}
          </div>
        )}

        {/*
        |--------------------------------------------------------------------------
        | SUCCESS
        |--------------------------------------------------------------------------
        */}

        {success && (
          <div className="password-reset-message password-reset-message--success">
            {success}
          </div>
        )}

        {/*
        |--------------------------------------------------------------------------
        | FORM
        |--------------------------------------------------------------------------
        */}

        {validToken &&
          !success && (
            <form
              className="password-reset-form"
              onSubmit={
                handleSubmit
              }
            >
              {/*
              |--------------------------------------------------------------------------
              | NEW PASSWORD
              |--------------------------------------------------------------------------
              */}

              <div className="password-reset-group">
                <label htmlFor="new-password">
                  Nouveau mot de passe
                </label>

                <div className="password-reset-password">
                  <input
                    id="new-password"
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    value={
                      password
                    }
                    onChange={(
                      event,
                    ) =>
                      setPassword(
                        event.target.value,
                      )
                    }
                    placeholder="Minimum 8 caractères"
                    autoComplete="new-password"
                    required
                  />

                  <button
                    type="button"
                    className="password-reset-toggle"
                    onClick={() =>
                      setShowPassword(
                        (
                          value,
                        ) =>
                          !value,
                      )
                    }
                    aria-label={
                      showPassword
                        ? "Masquer le mot de passe"
                        : "Afficher le mot de passe"
                    }
                  >
                    {showPassword
                      ? "Masquer"
                      : "Afficher"}
                  </button>
                </div>
              </div>

              {/*
              |--------------------------------------------------------------------------
              | PASSWORD SECURITY
              |--------------------------------------------------------------------------
              */}

              <div className="password-reset-security">
                <div className="password-reset-strength-header">
                  <span>
                    Sécurité du mot de passe
                  </span>

                  <strong>
                    {
                      passwordStrengthLabel
                    }
                  </strong>
                </div>

                <div className="password-reset-strength-track">
                  <span
                    className={`password-reset-strength-value password-reset-strength-value--${passwordStrength}`}
                  />
                </div>

                <div className="password-reset-requirements">
                  <span
                    className={
                      password.length >=
                      8
                        ? "is-valid"
                        : ""
                    }
                  >
                    ✓ 8 caractères
                  </span>

                  <span
                    className={
                      /[A-Z]/.test(
                        password,
                      )
                        ? "is-valid"
                        : ""
                    }
                  >
                    ✓ Majuscule
                  </span>

                  <span
                    className={
                      /[a-z]/.test(
                        password,
                      )
                        ? "is-valid"
                        : ""
                    }
                  >
                    ✓ Minuscule
                  </span>

                  <span
                    className={
                      /\d/.test(
                        password,
                      )
                        ? "is-valid"
                        : ""
                    }
                  >
                    ✓ Chiffre
                  </span>
                </div>
              </div>

              {/*
              |--------------------------------------------------------------------------
              | CONFIRM PASSWORD
              |--------------------------------------------------------------------------
              */}

              <div className="password-reset-group">
                <label htmlFor="confirm-new-password">
                  Confirmer le mot de passe
                </label>

                <div className="password-reset-password">
                  <input
                    id="confirm-new-password"
                    type={
                      showConfirmPassword
                        ? "text"
                        : "password"
                    }
                    value={
                      confirmPassword
                    }
                    onChange={(
                      event,
                    ) =>
                      setConfirmPassword(
                        event.target.value,
                      )
                    }
                    placeholder="Confirmez le nouveau mot de passe"
                    autoComplete="new-password"
                    required
                  />

                  <button
                    type="button"
                    className="password-reset-toggle"
                    onClick={() =>
                      setShowConfirmPassword(
                        (
                          value,
                        ) =>
                          !value,
                      )
                    }
                    aria-label={
                      showConfirmPassword
                        ? "Masquer la confirmation"
                        : "Afficher la confirmation"
                    }
                  >
                    {showConfirmPassword
                      ? "Masquer"
                      : "Afficher"}
                  </button>
                </div>
              </div>

              {/*
              |--------------------------------------------------------------------------
              | SUBMIT
              |--------------------------------------------------------------------------
              */}

              <button
                type="submit"
                className="password-reset-primary"
                disabled={
                  loading
                }
              >
                {loading
                  ? "Modification..."
                  : "Modifier mon mot de passe"}
              </button>
            </form>
          )}

        {/*
        |--------------------------------------------------------------------------
        | BACK
        |--------------------------------------------------------------------------
        */}

        <button
          type="button"
          className="password-reset-back"
          onClick={() =>
            navigate(
              "/auth?mode=login",
            )
          }
        >
          ← Retour à la connexion
        </button>
      </section>
    </main>
  );
}

export default ResetPasswordPage;