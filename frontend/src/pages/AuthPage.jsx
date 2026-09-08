import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import {
  GoogleLogin,
} from "@react-oauth/google";

import {
  login as loginUser,
  register as registerUser,
  loginWithGoogle,
  startGitHubLogin,
} from "../services/authService";

import logoDark from "../assets/logo-dark.png";
import logoLight from "../assets/logo-light.png";

import "./public/styles/AuthPage.css";

/*
|--------------------------------------------------------------------------
| RECAPTCHA V2
|--------------------------------------------------------------------------
*/

const RECAPTCHA_SCRIPT_ID =
  "google-recaptcha-v2-script";

let recaptchaScriptPromise =
  null;

/*
|--------------------------------------------------------------------------
| LOAD RECAPTCHA
|--------------------------------------------------------------------------
*/

function loadRecaptchaScript() {
  const siteKey =
    String(
      import.meta.env
        .VITE_RECAPTCHA_SITE_KEY ||
        "",
    ).trim();

  if (!siteKey) {
    return Promise.reject(
      new Error(
        "VITE_RECAPTCHA_SITE_KEY n'est pas configurée.",
      ),
    );
  }

  if (
    window.grecaptcha &&
    typeof window.grecaptcha.render ===
      "function"
  ) {
    return Promise.resolve(
      window.grecaptcha,
    );
  }

  if (recaptchaScriptPromise) {
    return recaptchaScriptPromise;
  }

  recaptchaScriptPromise =
    new Promise(
      (
        resolve,
        reject,
      ) => {
        const existingScript =
          document.getElementById(
            RECAPTCHA_SCRIPT_ID,
          );

        const waitForGoogle =
          () => {
            let attempts =
              0;

            const timer =
              window.setInterval(
                () => {
                  attempts += 1;

                  if (
                    window.grecaptcha &&
                    typeof window
                      .grecaptcha
                      .render ===
                      "function"
                  ) {
                    window.clearInterval(
                      timer,
                    );

                    resolve(
                      window.grecaptcha,
                    );

                    return;
                  }

                  if (
                    attempts >=
                    100
                  ) {
                    window.clearInterval(
                      timer,
                    );

                    recaptchaScriptPromise =
                      null;

                    reject(
                      new Error(
                        "Google reCAPTCHA n'a pas pu être chargé.",
                      ),
                    );
                  }
                },
                50,
              );
          };

        if (existingScript) {
          waitForGoogle();
          return;
        }

        const script =
          document.createElement(
            "script",
          );

        script.id =
          RECAPTCHA_SCRIPT_ID;

        script.src =
          "https://www.google.com/recaptcha/api.js?render=explicit&hl=fr";

        script.async =
          true;

        script.defer =
          true;

        script.onload =
          waitForGoogle;

        script.onerror =
          () => {
            recaptchaScriptPromise =
              null;

            reject(
              new Error(
                "Impossible de charger Google reCAPTCHA.",
              ),
            );
          };

        document.head.appendChild(
          script,
        );
      },
    );

  return recaptchaScriptPromise;
}

/*
|--------------------------------------------------------------------------
| RECAPTCHA COMPONENT
|--------------------------------------------------------------------------
*/

function RecaptchaChallenge({
  visible,
  onVerified,
  onExpired,
  onError,
}) {
  const containerRef =
    useRef(null);

  const widgetIdRef =
    useRef(null);

  const onVerifiedRef =
    useRef(onVerified);

  const onExpiredRef =
    useRef(onExpired);

  const onErrorRef =
    useRef(onError);

  useEffect(() => {
    onVerifiedRef.current =
      onVerified;
  }, [
    onVerified,
  ]);

  useEffect(() => {
    onExpiredRef.current =
      onExpired;
  }, [
    onExpired,
  ]);

  useEffect(() => {
    onErrorRef.current =
      onError;
  }, [
    onError,
  ]);

  useEffect(() => {
    if (!visible) {
      return undefined;
    }

    let cancelled =
      false;

    async function renderCaptcha() {
      try {
        const siteKey =
          String(
            import.meta.env
              .VITE_RECAPTCHA_SITE_KEY ||
              "",
          ).trim();

        if (!siteKey) {
          throw new Error(
            "La clé publique reCAPTCHA n'est pas configurée.",
          );
        }

        const grecaptcha =
          await loadRecaptchaScript();

        if (
          cancelled ||
          !containerRef.current
        ) {
          return;
        }

        if (
          widgetIdRef.current !==
          null
        ) {
          try {
            grecaptcha.reset(
              widgetIdRef.current,
            );
          } catch {
            widgetIdRef.current =
              null;
          }
        }

        if (
          containerRef.current
        ) {
          containerRef.current.innerHTML =
            "";
        }

        widgetIdRef.current =
          grecaptcha.render(
            containerRef.current,
            {
              sitekey:
                siteKey,

              theme:
                "light",

              size:
                "normal",

              callback:
                (token) => {
                  if (!token) {
                    onErrorRef.current?.(
                      new Error(
                        "Google reCAPTCHA n'a pas retourné de jeton.",
                      ),
                    );

                    return;
                  }

                  onVerifiedRef.current?.(
                    token,
                  );
                },

              "expired-callback":
                () => {
                  onExpiredRef.current?.();
                },

              "error-callback":
                () => {
                  onErrorRef.current?.(
                    new Error(
                      "La vérification reCAPTCHA a rencontré une erreur.",
                    ),
                  );
                },
            },
          );
      } catch (
        error
      ) {
        if (!cancelled) {
          onErrorRef.current?.(
            error,
          );
        }
      }
    }

    renderCaptcha();

    return () => {
      cancelled =
        true;
    };
  }, [
    visible,
  ]);

  if (!visible) {
    return null;
  }

  return (
    <div className="auth-recaptcha-area">
      <div className="auth-recaptcha-title">
        Vérification de sécurité
      </div>

      <p className="auth-recaptcha-description">
        Confirmez que vous n'êtes pas un robot pour continuer.
      </p>

      <div
        ref={
          containerRef
        }
        className="auth-recaptcha-widget"
      />
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| COUNTRIES
|--------------------------------------------------------------------------
*/

const COUNTRY_OPTIONS = [
  {
    code: "TN",
    label: "Tunisie",
  },
  {
    code: "FR",
    label: "France",
  },
  {
    code: "CA",
    label: "Canada",
  },
  {
    code: "ES",
    label: "Espagne",
  },
  {
    code: "IT",
    label: "Italie",
  },
  {
    code: "DE",
    label: "Allemagne",
  },
  {
    code: "BE",
    label: "Belgique",
  },
  {
    code: "CH",
    label: "Suisse",
  },
];

/*
|--------------------------------------------------------------------------
| AUTH PAGE
|--------------------------------------------------------------------------
*/

function AuthPage() {
  const navigate =
    useNavigate();

  const [
    searchParams,
  ] =
    useSearchParams();

  /*
  |--------------------------------------------------------------------------
  | MODE
  |--------------------------------------------------------------------------
  */

  const [
    mode,
    setMode,
  ] =
    useState(
      "login",
    );

  /*
  |--------------------------------------------------------------------------
  | REGISTER DATA
  |--------------------------------------------------------------------------
  */

  const [
    firstName,
    setFirstName,
  ] =
    useState("");

  const [
    lastName,
    setLastName,
  ] =
    useState("");

  const [
    email,
    setEmail,
  ] =
    useState("");

  const [
    phone,
    setPhone,
  ] =
    useState("");

  const [
    city,
    setCity,
  ] =
    useState("");

  const [
    countryCode,
    setCountryCode,
  ] =
    useState(
      "TN",
    );

  const [
    organizationName,
    setOrganizationName,
  ] =
    useState("");

  const [
    taxIdentifier,
    setTaxIdentifier,
  ] =
    useState("");

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

  /*
  |--------------------------------------------------------------------------
  | UI
  |--------------------------------------------------------------------------
  */

  const [
    showPassword,
    setShowPassword,
  ] =
    useState(
      false,
    );

  const [
    showConfirmPassword,
    setShowConfirmPassword,
  ] =
    useState(
      false,
    );

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] =
    useState("");

  const [
    loading,
    setLoading,
  ] =
    useState(
      false,
    );

  const [
    socialLoading,
    setSocialLoading,
  ] =
    useState(
      false,
    );

  /*
  |--------------------------------------------------------------------------
  | RECAPTCHA STATE
  |--------------------------------------------------------------------------
  */

  const [
    captchaVisible,
    setCaptchaVisible,
  ] =
    useState(
      false,
    );

  const [
    pendingAuthType,
    setPendingAuthType,
  ] =
    useState(
      null,
    );

  const [
    pendingGoogleCredential,
    setPendingGoogleCredential,
  ] =
    useState(
      null,
    );

  /*
  |--------------------------------------------------------------------------
  | URL MODE
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const rawMode =
      searchParams.get(
        "mode",
      );

    setMode(
      rawMode ===
        "register"
        ? "register"
        : "login",
    );

    setError(
      searchParams.get(
        "error",
      ) ||
        "",
    );

    setSuccessMessage(
      searchParams.get(
        "success",
      ) ||
        "",
    );
  }, [
    searchParams,
  ]);

  /*
  |--------------------------------------------------------------------------
  | RESET AUTH CHALLENGE WHEN MODE CHANGES
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    setPassword("");
    setConfirmPassword("");

    setShowPassword(
      false,
    );

    setShowConfirmPassword(
      false,
    );

    setCaptchaVisible(
      false,
    );

    setPendingAuthType(
      null,
    );

    setPendingGoogleCredential(
      null,
    );
  }, [
    mode,
  ]);

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
  | REDIRECT
  |--------------------------------------------------------------------------
  */

  function redirectToLanding(
    role,
  ) {
    const normalizedRole =
      String(
        role || "",
      )
        .trim()
        .toUpperCase();

    if (
      normalizedRole ===
      "ADMIN"
    ) {
      navigate(
        "/admin/dashboard",
        {
          replace:
            true,
        },
      );

      return;
    }

    if (
      normalizedRole ===
      "CLIENT"
    ) {
      navigate(
        "/client/invoices",
        {
          replace:
            true,
        },
      );

      return;
    }

    setError(
      "Le rôle associé à ce compte est invalide.",
    );
  }

  /*
  |--------------------------------------------------------------------------
  | REGISTER VALIDATION
  |--------------------------------------------------------------------------
  */

  function validateRegisterForm() {
    if (
      !firstName.trim()
    ) {
      throw new Error(
        "Le prénom est obligatoire.",
      );
    }

    if (
      !lastName.trim()
    ) {
      throw new Error(
        "Le nom est obligatoire.",
      );
    }

    if (
      !email.trim()
    ) {
      throw new Error(
        "L'adresse e-mail est obligatoire.",
      );
    }

    if (
      !organizationName.trim()
    ) {
      throw new Error(
        "Le nom de l’entreprise est obligatoire.",
      );
    }

    if (
      !countryCode
    ) {
      throw new Error(
        "Le pays est obligatoire.",
      );
    }

    if (
      password.length <
      8
    ) {
      throw new Error(
        "Le mot de passe doit contenir au moins 8 caractères.",
      );
    }

    if (
      password !==
      confirmPassword
    ) {
      throw new Error(
        "Les mots de passe ne correspondent pas.",
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | SHOW CAPTCHA
  |--------------------------------------------------------------------------
  */

  function requestCaptcha(
    authType,
  ) {
    setError("");
    setSuccessMessage("");

    setPendingAuthType(
      authType,
    );

    setCaptchaVisible(
      true,
    );
  }

  /*
  |--------------------------------------------------------------------------
  | CLASSIC AUTH CLICK
  |--------------------------------------------------------------------------
  */

  async function handleSubmit(
    event,
  ) {
    event.preventDefault();

    setError("");

    try {
      if (
        mode ===
        "register"
      ) {
        validateRegisterForm();
      }

      if (
        !email.trim()
      ) {
        throw new Error(
          "L'adresse e-mail est obligatoire.",
        );
      }

      if (!password) {
        throw new Error(
          "Le mot de passe est obligatoire.",
        );
      }

      requestCaptcha(
        "classic",
      );
    } catch (
      submitError
    ) {
      setError(
        submitError?.message ||
          "Impossible de poursuivre.",
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | EXECUTE CLASSIC AUTH
  |--------------------------------------------------------------------------
  */

  async function executeClassicAuth(
    recaptchaToken,
  ) {
    setLoading(
      true,
    );

    try {
      if (
        mode ===
        "register"
      ) {
        const result =
          await registerUser({
            firstName:
              firstName.trim(),

            lastName:
              lastName.trim(),

            email:
              email
                .trim()
                .toLowerCase(),

            phone:
              phone.trim(),

            city:
              city.trim(),

            countryCode,

            organizationName:
              organizationName.trim(),

            taxIdentifier:
              taxIdentifier.trim(),

            password,

            recaptchaToken,
          });

        setSuccessMessage(
          "Merci de nous avoir rejoints ! Votre compte a été créé avec succès.",
        );

        window.setTimeout(
          () => {
            redirectToLanding(
              result?.user?.role,
            );
          },
          1200,
        );

        return;
      }

      const result =
        await loginUser({
          email:
            email
              .trim()
              .toLowerCase(),

          password,

          recaptchaToken,
        });

      redirectToLanding(
        result?.user?.role,
      );
    } catch (
      authError
    ) {
      setCaptchaVisible(
        false,
      );

      setPendingAuthType(
        null,
      );

      setError(
        authError?.message ||
          "Impossible de poursuivre.",
      );
    } finally {
      setLoading(
        false,
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | GOOGLE
  |--------------------------------------------------------------------------
  */

  function handleGoogleSuccess(
    response,
  ) {
    const credential =
      response?.credential;

    if (!credential) {
      setError(
        "Le jeton Google est manquant.",
      );

      return;
    }

    setError("");

    setPendingGoogleCredential(
      credential,
    );

    requestCaptcha(
      "google",
    );
  }

  function handleGoogleError() {
    setError(
      mode ===
        "register"
        ? "L’inscription avec Google a échoué."
        : "La connexion Google a échoué.",
    );
  }

  async function executeGoogleAuth(
    recaptchaToken,
  ) {
    if (
      !pendingGoogleCredential
    ) {
      setError(
        "Le jeton Google est manquant.",
      );

      return;
    }

    setSocialLoading(
      true,
    );

    try {
      const result =
        await loginWithGoogle(
          pendingGoogleCredential,
          mode,
          recaptchaToken,
        );

      if (
        mode ===
        "register"
      ) {
        setSuccessMessage(
          "Merci de nous avoir rejoints ! Votre compte Google a été créé avec succès.",
        );

        window.setTimeout(
          () => {
            redirectToLanding(
              result?.user?.role,
            );
          },
          1200,
        );

        return;
      }

      redirectToLanding(
        result?.user?.role,
      );
    } catch (
      googleError
    ) {
      setCaptchaVisible(
        false,
      );

      setPendingAuthType(
        null,
      );

      setPendingGoogleCredential(
        null,
      );

      setError(
        googleError?.message ||
          "L’authentification Google a échoué.",
      );
    } finally {
      setSocialLoading(
        false,
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | GITHUB
  |--------------------------------------------------------------------------
  */

  function handleGitHubLogin() {
    setError("");

    requestCaptcha(
      "github",
    );
  }

  function executeGitHubAuth(
    recaptchaToken,
  ) {
    setSocialLoading(
      true,
    );

    try {
      startGitHubLogin(
        mode,
        recaptchaToken,
      );
    } catch (
      githubError
    ) {
      setSocialLoading(
        false,
      );

      setCaptchaVisible(
        false,
      );

      setPendingAuthType(
        null,
      );

      setError(
        githubError?.message ||
          "Impossible de démarrer l’authentification GitHub.",
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | RECAPTCHA VERIFIED
  |--------------------------------------------------------------------------
  */

  function handleCaptchaVerified(
    token,
  ) {
    if (!token) {
      setError(
        "Google reCAPTCHA n'a pas retourné de jeton.",
      );

      return;
    }

    setCaptchaVisible(
      false,
    );

    if (
      pendingAuthType ===
      "classic"
    ) {
      executeClassicAuth(
        token,
      );

      return;
    }

    if (
      pendingAuthType ===
      "google"
    ) {
      executeGoogleAuth(
        token,
      );

      return;
    }

    if (
      pendingAuthType ===
      "github"
    ) {
      executeGitHubAuth(
        token,
      );

      return;
    }

    setError(
      "Type d'authentification invalide.",
    );
  }

  function handleCaptchaExpired() {
    setError(
      "La vérification reCAPTCHA a expiré. Veuillez recommencer.",
    );

    setCaptchaVisible(
      false,
    );

    setPendingAuthType(
      null,
    );
  }

  function handleCaptchaError(
    captchaError,
  ) {
    setError(
      captchaError?.message ||
        "Impossible de charger Google reCAPTCHA.",
    );

    setCaptchaVisible(
      false,
    );

    setPendingAuthType(
      null,
    );
  }

  /*
  |--------------------------------------------------------------------------
  | FORGOT PASSWORD
  |--------------------------------------------------------------------------
  */

  function handleForgotPassword() {
    navigate(
      "/forgot-password",
    );
  }

  /*
  |--------------------------------------------------------------------------
  | CHANGE MODE
  |--------------------------------------------------------------------------
  */

  function handleModeChange(
    nextMode,
  ) {
    const normalizedMode =
      nextMode ===
        "register"
        ? "register"
        : "login";

    const search =
      new URLSearchParams();

    search.set(
      "mode",
      normalizedMode,
    );

    navigate(
      `/auth?${search.toString()}`,
      {
        replace:
          true,
      },
    );
  }

  /*
  |--------------------------------------------------------------------------
  | RENDER
  |--------------------------------------------------------------------------
  */

  return (
    <div className="auth-page">
      <div className="auth-visual">
        <div className="auth-visual-grid" />

        <div className="auth-visual-glow auth-visual-glow--one" />

        <div className="auth-visual-glow auth-visual-glow--two" />

        <div className="auth-visual-content">
          {/*
          |--------------------------------------------------------------------------
          | TENOR LOGO
          |--------------------------------------------------------------------------
          */}

          <button
            type="button"
            className="auth-brand-logo"
            onClick={() =>
              navigate("/")
            }
            aria-label="Retour à l'accueil"
            title="Retour à l'accueil"
          >
            <img
              src={
                logoDark
              }
              alt="Tenor Afrique"
              className="auth-brand-logo__image auth-brand-logo__image--dark"
            />

            <img
              src={
                logoLight
              }
              alt="Tenor Afrique"
              className="auth-brand-logo__image auth-brand-logo__image--light"
            />
          </button>


          <h1>
            Gérez vos factures
            en toute simplicité.
          </h1>

        

          <div className="auth-features">
            
              

              
              
            

          

          </div>
        </div>
      </div>

      <section className="auth-form-section">
        <div className="auth-container">
          <div className="auth-panel">
            <div className="auth-heading">
              

              <h2>
                {mode ===
                  "register"
                  ? "Commencez dès maintenant"
                  : "Connectez-vous"}
              </h2>

              <p>
                {mode ===
                  "register"
                  ? "Créez votre espace pour gérer vos factures et votre organisation."
                  : "Connectez-vous pour retrouver vos factures, validations et votre tableau de bord."}
              </p>
            </div>

            {error && (
              <div className="auth-message auth-message--error">
                <span>
                  !
                </span>

                <p>
                  {error}
                </p>
              </div>
            )}

            {successMessage && (
              <div className="auth-message auth-message--success">
                <span>
                  ✓
                </span>

                <p>
                  {successMessage}
                </p>
              </div>
            )}

            <form
              className="auth-form"
              onSubmit={
                handleSubmit
              }
            >
              {mode ===
                "register" && (
                  <>
                    <div className="auth-form-row">
                      <div className="auth-form-group">
                        <label htmlFor="firstName">
                          Prénom
                        </label>

                        <input
                          id="firstName"
                          type="text"
                          value={
                            firstName
                          }
                          onChange={(
                            event,
                          ) =>
                            setFirstName(
                              event.target.value,
                            )
                          }
                          placeholder="Sara"
                          autoComplete="given-name"
                          required
                        />
                      </div>

                      <div className="auth-form-group">
                        <label htmlFor="lastName">
                          Nom
                        </label>

                        <input
                          id="lastName"
                          type="text"
                          value={
                            lastName
                          }
                          onChange={(
                            event,
                          ) =>
                            setLastName(
                              event.target.value,
                            )
                          }
                          placeholder="Ben Hamouda"
                          autoComplete="family-name"
                          required
                        />
                      </div>
                    </div>
                  </>
                )}

              <div className="auth-form-group">
                <label htmlFor="email">
                  Adresse e-mail
                </label>

                <input
                  id="email"
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

              {mode ===
                "register" && (
                  <>
                    <div className="auth-form-row">
                      <div className="auth-form-group">
                        <label htmlFor="phone">
                          Téléphone
                        </label>

                        <input
                          id="phone"
                          type="tel"
                          value={
                            phone
                          }
                          onChange={(
                            event,
                          ) =>
                            setPhone(
                              event.target.value,
                            )
                          }
                          placeholder="+216 20 000 000"
                          autoComplete="tel"
                        />
                      </div>

                      <div className="auth-form-group">
                        <label htmlFor="countryCode">
                          Pays
                        </label>

                        <select
                          id="countryCode"
                          value={
                            countryCode
                          }
                          onChange={(
                            event,
                          ) =>
                            setCountryCode(
                              event.target.value,
                            )
                          }
                          required
                        >
                          {COUNTRY_OPTIONS.map(
                            (
                              country,
                            ) => (
                              <option
                                key={
                                  country.code
                                }
                                value={
                                  country.code
                                }
                              >
                                {
                                  country.label
                                }
                              </option>
                            ),
                          )}
                        </select>
                      </div>
                    </div>

                    <div className="auth-form-group">
                      <label htmlFor="city">
                        Ville
                      </label>

                      <input
                        id="city"
                        type="text"
                        value={
                          city
                        }
                        onChange={(
                          event,
                        ) =>
                          setCity(
                            event.target.value,
                          )
                        }
                        placeholder="Tunis"
                        autoComplete="address-level2"
                      />
                    </div>

                    <div className="auth-form-group">
                      <label htmlFor="organizationName">
                        Nom de l'entreprise
                      </label>

                      <input
                        id="organizationName"
                        type="text"
                        value={
                          organizationName
                        }
                        onChange={(
                          event,
                        ) =>
                          setOrganizationName(
                            event.target.value,
                          )
                        }
                        placeholder="Nom de votre entreprise"
                        autoComplete="organization"
                        required
                      />
                    </div>

                   
                  </>
                )}

              <div className="auth-form-group">
                <div className="auth-label-row">
                  <label htmlFor="password">
                    Mot de passe
                  </label>

                  {mode ===
                    "login" && (
                      <button
                        type="button"
                        className="auth-forgot-link"
                        onClick={
                          handleForgotPassword
                        }
                      >
                        Mot de passe oublié ?
                      </button>
                    )}
                </div>

                <div className="password-input-wrapper">
                  <input
                    id="password"
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
                    placeholder="Votre mot de passe"
                    autoComplete={
                      mode ===
                        "register"
                        ? "new-password"
                        : "current-password"
                    }
                    required
                  />

                  <button
                    type="button"
                    className="password-toggle-button"
                    onClick={() =>
                      setShowPassword(
                        (
                          current,
                        ) =>
                          !current,
                      )
                    }
                  >
                    {showPassword
                      ? "Masquer"
                      : "Afficher"}
                  </button>
                </div>
              </div>

              {mode ===
                "register" && (
                  <>
                    <div className="password-security">
                      <div className="password-strength-header">
                        <span>
                          Sécurité du mot de passe
                        </span>

                        <strong>
                          {
                            passwordStrengthLabel
                          }
                        </strong>
                      </div>

                      <div className="password-strength-track">
                        <span
                          className={`password-strength-value password-strength-value--${passwordStrength}`}
                        />
                      </div>

                      <div className="password-requirements">
                        <span
                          className={
                            password.length >=
                            8
                              ? "is-valid"
                              : ""
                          }
                        >
                          8 caractères
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
                          Majuscule
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
                          Minuscule
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
                          Chiffre
                        </span>
                      </div>
                    </div>

                    <div className="auth-form-group">
                      <label htmlFor="confirmPassword">
                        Confirmer le mot de passe
                      </label>

                      <div className="password-input-wrapper">
                        <input
                          id="confirmPassword"
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
                          placeholder="Confirmez votre mot de passe"
                          autoComplete="new-password"
                          required
                        />

                        <button
                          type="button"
                          className="password-toggle-button"
                          onClick={() =>
                            setShowConfirmPassword(
                              (
                                current,
                              ) =>
                                !current,
                            )
                          }
                        >
                          {showConfirmPassword
                            ? "Masquer"
                            : "Afficher"}
                        </button>
                      </div>
                    </div>
                  </>
                )}

              <button
                type="submit"
                className="auth-primary-button"
                disabled={
                  loading ||
                  socialLoading ||
                  captchaVisible
                }
              >
                {loading
                  ? "Patientez..."
                  : mode ===
                      "register"
                    ? "Créer un compte"
                    : "Se connecter"}
              </button>
            </form>

            <RecaptchaChallenge
              visible={
                captchaVisible
              }
              onVerified={
                handleCaptchaVerified
              }
              onExpired={
                handleCaptchaExpired
              }
              onError={
                handleCaptchaError
              }
            />

            <div className="auth-separator">
              <span>
                ou continuer avec
              </span>
            </div>

            <div className="auth-social-buttons">
              <div className="google-custom-button">
                <div className="google-custom-button__visual">
                  <svg
                    className="google-custom-button__icon"
                    viewBox="0 0 48 48"
                    aria-hidden="true"
                  >
                    <path
                      fill="#FFC107"
                      d="M43.6 20.5H42V20H24v8h11.3C33.9 32.6 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C34.5 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"
                    />

                    <path
                      fill="#FF3D00"
                      d="M6.3 14.7l6.6 4.8C14.5 16 18.9 13 24 13c3.1 0 5.8 1.1 8 3l6-6C34.5 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
                    />

                    <path
                      fill="#4CAF50"
                      d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.3 35.5 26.8 36 24 36c-5.4 0-9.9-3.4-11.5-8.1l-6.5 5C9.5 39.6 16.2 44 24 44z"
                    />

                    <path
                      fill="#1976D2"
                      d="M43.6 20.5H42V20H24v8h11.3c-1 2.8-2.9 5.2-5.4 6.7l6.3 5.3C39.6 37.4 44 31.4 44 24c0-1.3-.1-2.7-.4-3.5z"
                    />
                  </svg>

                  <span>
                    {mode ===
                      "register"
                      ? "S’inscrire avec Google"
                      : "Continuer avec Google"}
                  </span>
                </div>

                <div className="google-custom-button__real">
                  <GoogleLogin
                    onSuccess={
                      handleGoogleSuccess
                    }
                    onError={
                      handleGoogleError
                    }
                    text="continue_with"
                    shape="rectangular"
                    size="large"
                    theme="outline"
                    locale="fr"
                    useOneTap={
                      false
                    }
                  />
                </div>
              </div>

              <button
                type="button"
                className="social-login-button social-login-button--github"
                onClick={
                  handleGitHubLogin
                }
                disabled={
                  loading ||
                  socialLoading ||
                  captchaVisible
                }
              >
                <svg
                  viewBox="0 0 24 24"
                  className="social-login-button__icon"
                  aria-hidden="true"
                >
                  <path
                    fill="currentColor"
                    d="M12 .7a11.5 11.5 0 0 0-3.64 22.4c.58.11.79-.25.79-.56v-2.23c-3.23.7-3.91-1.37-3.91-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.58-.29-5.29-1.29-5.29-5.74 0-1.27.45-2.3 1.19-3.11-.12-.29-.52-1.47.11-3.07 0 0 .97-.31 3.16 1.19a10.9 10.9 0 0 1 5.76 0c2.2-1.5 3.16-1.19 3.16-1.19.63 1.6.23 2.78.11 3.07.74.81 1.19 1.84 1.19 3.11 0 4.46-2.72 5.44-5.31 5.73.42.36.79 1.07.79 2.16v3.2c0 .31.21.68.8.56A11.5 11.5 0 0 0 12 .7Z"
                  />
                </svg>

                <span>
                  {mode ===
                    "register"
                    ? "S’inscrire avec GitHub"
                    : "Continuer avec GitHub"}
                </span>
              </button>
            </div>

            <p className="auth-switch-text">
              {mode ===
              "register" ? (
                <>
                  Vous avez déjà un compte ?{" "}

                  <button
                    type="button"
                    className="auth-link-button"
                    onClick={() =>
                      handleModeChange(
                        "login",
                      )
                    }
                  >
                    Se connecter
                  </button>
                </>
              ) : (
                <>
                  Vous n'avez pas encore de compte ?{" "}

                  <button
                    type="button"
                    className="auth-link-button"
                    onClick={() =>
                      handleModeChange(
                        "register",
                      )
                    }
                  >
                    Créer un compte
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

export default AuthPage;