import {
  useState,
} from "react";

import RecaptchaV2 from "../../components/auth/RecaptchaV2";

import "./styles/ContactPage.css";

/*
|--------------------------------------------------------------------------
| API
|--------------------------------------------------------------------------
*/

const API_BASE_URL =
  String(
    import.meta.env.VITE_API_URL ||
      "http://localhost:3000",
  ).replace(/\/+$/, "");

/*
|--------------------------------------------------------------------------
| SUBJECTS
|--------------------------------------------------------------------------
*/

const CONTACT_SUBJECTS = [
  {
    value: "demo",
    label:
      "Demande de démonstration",
  },

  {
    value: "integration",
    label:
      "Intégration ERP",
  },

  {
    value: "signature",
    label:
      "Signature électronique",
  },

  {
    value: "ttn",
    label:
      "Transmission TTN",
  },

  {
    value: "support",
    label:
      "Support technique",
  },

  {
    value: "other",
    label:
      "Autre demande",
  },
];

/*
|--------------------------------------------------------------------------
| CONTACT PAGE
|--------------------------------------------------------------------------
*/

function ContactPage() {
  const [
    formData,
    setFormData,
  ] =
    useState({
      name: "",
      email: "",
      company: "",
      subject:
        "demo",
      message: "",
    });

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

  /*
  |--------------------------------------------------------------------------
  | CHANGE
  |--------------------------------------------------------------------------
  */

  function handleChange(
    event,
  ) {
    const {
      name,
      value,
    } =
      event.target;

    setFormData(
      (
        currentData,
      ) => ({
        ...currentData,

        [name]:
          value,
      }),
    );

    if (error) {
      setError("");
    }

    if (success) {
      setSuccess("");
    }
  }

  /*
  |--------------------------------------------------------------------------
  | SUBMIT
  |--------------------------------------------------------------------------
  */

  function handleSubmit(
    event,
  ) {
    event.preventDefault();

    setError("");
    setSuccess("");

    const name =
      String(
        formData.name ||
          "",
      ).trim();

    const email =
      String(
        formData.email ||
          "",
      )
        .trim()
        .toLowerCase();

    const message =
      String(
        formData.message ||
          "",
      ).trim();

    if (!name) {
      setError(
        "Veuillez saisir votre nom.",
      );

      return;
    }

    if (
      !email ||
      !email.includes(
        "@",
      )
    ) {
      setError(
        "Veuillez saisir une adresse e-mail valide.",
      );

      return;
    }

    if (
      message.length <
      10
    ) {
      setError(
        "Votre message doit contenir au moins 10 caractères.",
      );

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | SHOW CAPTCHA
    |--------------------------------------------------------------------------
    */

    setCaptchaVisible(
      true,
    );
  }

  /*
  |--------------------------------------------------------------------------
  | CAPTCHA VERIFIED
  |--------------------------------------------------------------------------
  */

  async function handleCaptchaVerified(
    recaptchaToken,
  ) {
    setCaptchaVisible(
      false,
    );

    setLoading(
      true,
    );

    setError("");
    setSuccess("");

    try {
      const response =
        await fetch(
          `${API_BASE_URL}/api/contact`,
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",

              Accept:
                "application/json",
            },

            body:
              JSON.stringify({
                name:
                  formData.name,

                email:
                  formData.email,

                company:
                  formData.company,

                subject:
                  formData.subject,

                message:
                  formData.message,

                recaptchaToken,
              }),
          },
        );

      let data =
        null;

      try {
        data =
          await response.json();
      } catch {
        data =
          null;
      }

      if (
        !response.ok
      ) {
        throw new Error(
          data?.message ||
            "Impossible d'envoyer votre message.",
        );
      }

      setSuccess(
        data?.message ||
          "Merci, votre message a bien été envoyé.",
      );

      /*
      |--------------------------------------------------------------------------
      | RESET FORM
      |--------------------------------------------------------------------------
      */

      setFormData({
        name: "",
        email: "",
        company: "",
        subject:
          "demo",
        message: "",
      });
    } catch (
      submitError
    ) {
      console.error(
        "CONTACT SUBMIT ERROR:",
        submitError,
      );

      setError(
        submitError?.message ||
          "Impossible d'envoyer votre message. Veuillez réessayer.",
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
    <main className="contact-page">
      {/*
      |--------------------------------------------------------------------------
      | HERO
      |--------------------------------------------------------------------------
      */}

      <section className="contact-hero">
        <div className="contact-hero-decoration contact-hero-decoration-one" />

        <div className="contact-hero-decoration contact-hero-decoration-two" />

        <div className="contact-container contact-hero-content">
          

          <h1>
            Construisons ensemble
            votre projet digital
          </h1>

        

          <div className="contact-hero-points">
        
          </div>
        </div>
      </section>

      {/*
      |--------------------------------------------------------------------------
      | MAIN
      |--------------------------------------------------------------------------
      */}

      <section className="contact-main-section">
        <div className="contact-container contact-layout">
          {/*
          |--------------------------------------------------------------------------
          | SIDEBAR
          |--------------------------------------------------------------------------
          */}

          <aside className="contact-sidebar">
            <div className="contact-sidebar-header">
              

              <h2>
                Parlons de votre besoin
              </h2>

              <p>
                Vous avez une question,
                un projet ERP ou un besoin
                lié à la facturation
                électronique ? Contactez
                directement notre équipe.
              </p>
            </div>

            <div className="contact-details">
              {/*
              |--------------------------------------------------------------------------
              | EMAIL
              |--------------------------------------------------------------------------
              */}

              <a
                className="contact-detail-card"
                href="mailto:contact@tenorafrique.com"
              >
                <span
                  className="contact-detail-icon"
                  aria-hidden="true"
                >
                  @
                </span>

                <span className="contact-detail-content">
                  <small>
                    E-mail
                  </small>

                  <strong>
                    contact@tenorafrique.com
                  </strong>
                </span>

                <span
                  className="contact-detail-arrow"
                  aria-hidden="true"
                >
                  →
                </span>
              </a>

              {/*
              |--------------------------------------------------------------------------
              | PHONE
              |--------------------------------------------------------------------------
              */}

              <a
                className="contact-detail-card"
                href="tel:+21629965538"
              >
                <span
                  className="contact-detail-icon"
                  aria-hidden="true"
                >
                  ☎
                </span>

                <span className="contact-detail-content">
                  <small>
                    Téléphone
                  </small>

                  <strong>
                    (+216) 29 965 538
                  </strong>
                </span>

                <span
                  className="contact-detail-arrow"
                  aria-hidden="true"
                >
                  →
                </span>
              </a>

              {/*
              |--------------------------------------------------------------------------
              | LOCATION
              |--------------------------------------------------------------------------
              */}

              <a
                className="contact-detail-card"
                href="https://www.google.com/maps/search/?api=1&query=Residence+ARCHE+Les+Jardins+de+Carthage+Tunisie"
                target="_blank"
                rel="noreferrer"
              >
                <span
                  className="contact-detail-icon"
                  aria-hidden="true"
                >
                  ◉
                </span>

                <span className="contact-detail-content">
                  <small>
                    Siège
                  </small>

                  <strong>
                    App C1-1 Résidence ARCHE
                    <br />
                    Les Jardins de Carthage
                    <br />
                    Tunisie
                  </strong>
                </span>

                <span
                  className="contact-detail-arrow"
                  aria-hidden="true"
                >
                  →
                </span>
              </a>

              {/*
              |--------------------------------------------------------------------------
              | WEBSITE
              |--------------------------------------------------------------------------
              */}

             
            </div>

            {/*
            |--------------------------------------------------------------------------
            | TRUST
            |--------------------------------------------------------------------------
            */}

            <div className="contact-trust-card">
              <span
                className="contact-trust-icon"
                aria-hidden="true"
              >
                ✓
              </span>

              <div>
                <strong>
                  Vos informations restent confidentielles
                </strong>

                <p>
                  Elles sont utilisées
                  uniquement dans le cadre
                  du traitement de votre
                  demande.
                </p>
              </div>
            </div>
          </aside>

          {/*
          |--------------------------------------------------------------------------
          | FORM
          |--------------------------------------------------------------------------
          */}

          <div className="contact-form-card">
            <div className="contact-form-heading">
              <div>
                
                <h2>
                  Envoyez-nous un message
                </h2>
              </div>

              <span className="contact-form-status">
                Équipe disponible
              </span>
            </div>

            {/*
            |--------------------------------------------------------------------------
            | ERROR
            |--------------------------------------------------------------------------
            */}

            {error && (
              <div
                className="contact-alert contact-alert--error"
                role="alert"
              >
                <span aria-hidden="true">
                  !
                </span>

                <div>
                  <strong>
                    Envoi impossible
                  </strong>

                  <p>
                    {error}
                  </p>
                </div>
              </div>
            )}

            {/*
            |--------------------------------------------------------------------------
            | SUCCESS
            |--------------------------------------------------------------------------
            */}

            {success && (
              <div
                className="contact-success-message"
                role="status"
              >
                <span aria-hidden="true">
                  ✓
                </span>

                <div>
                  <strong>
                    Message envoyé
                  </strong>

                  <p>
                    {success}
                  </p>
                </div>
              </div>
            )}

            <form
              className="contact-form"
              onSubmit={
                handleSubmit
              }
            >
              <div className="contact-form-row">
                <div className="contact-form-group">
                  <label htmlFor="contact-name">
                    Nom complet
                  </label>

                  <input
                    id="contact-name"
                    name="name"
                    type="text"
                    value={
                      formData.name
                    }
                    onChange={
                      handleChange
                    }
                    placeholder="Votre nom"
                    autoComplete="name"
                    maxLength={150}
                    required
                  />
                </div>

                <div className="contact-form-group">
                  <label htmlFor="contact-email">
                    Adresse e-mail
                  </label>

                  <input
                    id="contact-email"
                    name="email"
                    type="email"
                    value={
                      formData.email
                    }
                    onChange={
                      handleChange
                    }
                    placeholder="nom@entreprise.tn"
                    autoComplete="email"
                    maxLength={255}
                    required
                  />
                </div>
              </div>

              <div className="contact-form-row">
                <div className="contact-form-group">
                  <label htmlFor="contact-company">
                    Entreprise
                  </label>

                  <input
                    id="contact-company"
                    name="company"
                    type="text"
                    value={
                      formData.company
                    }
                    onChange={
                      handleChange
                    }
                    placeholder="Nom de votre entreprise"
                    autoComplete="organization"
                    maxLength={150}
                  />
                </div>

                <div className="contact-form-group">
                  <label htmlFor="contact-subject">
                    Sujet
                  </label>

                  <select
                    id="contact-subject"
                    name="subject"
                    value={
                      formData.subject
                    }
                    onChange={
                      handleChange
                    }
                  >
                    {CONTACT_SUBJECTS.map(
                      (
                        subject,
                      ) => (
                        <option
                          key={
                            subject.value
                          }
                          value={
                            subject.value
                          }
                        >
                          {
                            subject.label
                          }
                        </option>
                      ),
                    )}
                  </select>
                </div>
              </div>

              <div className="contact-form-group">
                <label htmlFor="contact-message">
                  Message
                </label>

                <textarea
                  id="contact-message"
                  name="message"
                  rows="7"
                  value={
                    formData.message
                  }
                  onChange={
                    handleChange
                  }
                  placeholder="Décrivez votre projet, votre besoin ou les difficultés rencontrées..."
                  minLength={10}
                  maxLength={3000}
                  required
                />

                <span className="contact-character-count">
                  {
                    formData
                      .message
                      .length
                  }
                  /3000 caractères
                </span>
              </div>

              {/*
              |--------------------------------------------------------------------------
              | RECAPTCHA
              |--------------------------------------------------------------------------
              */}

              <div className="contact-recaptcha-wrapper">
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
              </div>

              <div className="contact-form-footer">
                <p>
                  En envoyant ce formulaire,
                  vous acceptez d’être
                  contacté au sujet de votre
                  demande.
                </p>

                <button
                  type="submit"
                  className="contact-submit-button"
                  disabled={
                    loading ||
                    captchaVisible
                  }
                >
                  <span>
                    {loading
                      ? "Envoi en cours..."
                      : captchaVisible
                        ? "Vérification..."
                        : "Envoyer le message"}
                  </span>

                  {!loading &&
                    !captchaVisible && (
                      <span
                        aria-hidden="true"
                      >
                        →
                      </span>
                    )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}

export default ContactPage;