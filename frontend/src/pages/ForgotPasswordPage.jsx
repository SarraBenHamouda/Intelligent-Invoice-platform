import {
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import {
  forgotPassword,
} from "../services/authService";

import RecaptchaV2 from "../components/auth/RecaptchaV2";

import logoDark from "../assets/logo-dark.png";
import logoLight from "../assets/logo-light.png";

import "./public/styles/PasswordResetPage.css";

function ForgotPasswordPage() {
  const navigate =
    useNavigate();

  const [
    email,
    setEmail,
  ] =
    useState("");

  const [
    captchaVisible,
    setCaptchaVisible,
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

  function handleSubmit(
    event,
  ) {
    event.preventDefault();

    setError("");
    setSuccess("");

    const normalizedEmail =
      String(
        email || "",
      )
        .trim()
        .toLowerCase();

    if (
      !normalizedEmail ||
      !normalizedEmail.includes(
        "@",
      )
    ) {
      setError(
        "Veuillez saisir une adresse e-mail valide.",
      );

      return;
    }

    setCaptchaVisible(
      true,
    );
  }

  async function handleCaptchaVerified(
    token,
  ) {
    setCaptchaVisible(
      false,
    );

    setLoading(
      true,
    );

    setError("");

    try {
      const result =
        await forgotPassword({
          email:
            email
              .trim()
              .toLowerCase(),

          recaptchaToken:
            token,
        });

      setSuccess(
        result?.message ||
          "Si un compte correspondant existe, un lien de réinitialisation a été envoyé.",
      );
    } catch (
      submitError
    ) {
      setError(
        submitError?.message ||
          "Impossible d'envoyer la demande.",
      );
    } finally {
      setLoading(
        false,
      );
    }
  }

  return (
    <main className="password-reset-page">
      <section className="password-reset-card">

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
              src={logoDark}
              alt="Tenor Afrique"
              className="password-reset-logo password-reset-logo--dark"
            />

            <img
              src={logoLight}
              alt="Tenor Afrique"
              className="password-reset-logo password-reset-logo--light"
            />
          </button>
        </div>

        <span className="password-reset-eyebrow">
          Sécurité du compte
        </span>

        <h1>
          Mot de passe oublié ?
        </h1>

        <p className="password-reset-description">
          Entrez votre adresse e-mail.
          Si un compte correspondant existe,
          nous vous enverrons un lien sécurisé
          pour choisir un nouveau mot de passe.
        </p>

        {error && (
          <div className="password-reset-message password-reset-message--error">
            {error}
          </div>
        )}

        {success && (
          <div className="password-reset-message password-reset-message--success">
            {success}
          </div>
        )}

        {!success && (
          <form
            onSubmit={
              handleSubmit
            }
            className="password-reset-form"
          >
            <div className="password-reset-group">
              <label htmlFor="reset-email">
                Adresse e-mail
              </label>

              <input
                id="reset-email"
                type="email"
                value={
                  email
                }
                onChange={(
                  event,
                ) =>
                  setEmail(
                    event.target.value,
                  )
                }
                placeholder="nom@entreprise.tn"
                autoComplete="email"
                required
              />
            </div>

            <button
              type="submit"
              className="password-reset-primary"
              disabled={
                loading ||
                captchaVisible
              }
            >
              {loading
                ? "Envoi en cours..."
                : "Envoyer le lien"}
            </button>
          </form>
        )}

        <RecaptchaV2
          visible={
            captchaVisible
          }
          onVerified={
            handleCaptchaVerified
          }
          onExpired={() => {
            setCaptchaVisible(
              false,
            );

            setError(
              "Le reCAPTCHA a expiré. Veuillez recommencer.",
            );
          }}
          onError={(
            captchaError,
          ) => {
            setCaptchaVisible(
              false,
            );

            setError(
              captchaError?.message ||
                "Impossible de vérifier reCAPTCHA.",
            );
          }}
        />

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

export default ForgotPasswordPage;