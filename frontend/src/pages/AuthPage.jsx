import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Link,
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import {
  GoogleLogin,
} from "@react-oauth/google";

import countries from "i18n-iso-countries";
import frLocale from "i18n-iso-countries/langs/fr.json";

import Logo from "../components/navigation/Logo/Logo";
import ThemeToggle from "../components/navigation/ThemeToggle/ThemeToggle";

import {
  login as loginUser,
  register as registerUser,
  loginWithGoogle,
  startGitHubLogin,
} from "../services/authService";

import "./public/styles/AuthPage.css";

countries.registerLocale(frLocale);

const INITIAL_LOGIN_FORM = {
  email: "",
  password: "",
};

const INITIAL_REGISTER_FORM = {
  organizationName: "",
  countryCode: "TN",
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  confirmPassword: "",
};

function AuthPage() {
  const navigate = useNavigate();

  const [
    searchParams,
    setSearchParams,
  ] = useSearchParams();

  const [activeTab, setActiveTab] =
    useState("login");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");

  const [
    showLoginPassword,
    setShowLoginPassword,
  ] = useState(false);

  const [
    showRegisterPassword,
    setShowRegisterPassword,
  ] = useState(false);

  const [
    acceptTerms,
    setAcceptTerms,
  ] = useState(false);

  const [
    loginForm,
    setLoginForm,
  ] = useState(INITIAL_LOGIN_FORM);

  const [
    registerForm,
    setRegisterForm,
  ] = useState(INITIAL_REGISTER_FORM);

  const countryOptions = useMemo(() => {
    const names = countries.getNames(
      "fr",
      {
        select: "official",
      },
    );

    return Object.entries(names)
      .map(([code, name]) => ({
        code,
        name,
      }))
      .sort((countryA, countryB) =>
        countryA.name.localeCompare(
          countryB.name,
          "fr",
        ),
      );
  }, []);

  const passwordChecks = useMemo(() => {
    const password =
      registerForm.password;

    return {
      minimumLength:
        password.length >= 8,

      hasUppercase:
        /[A-ZÀ-ÖØ-Ý]/.test(password),

      hasLowercase:
        /[a-zà-öø-ÿ]/.test(password),

      hasNumber:
        /\d/.test(password),

      hasSpecialCharacter:
        /[^A-Za-zÀ-ÖØ-öø-ÿ0-9]/.test(
          password,
        ),
    };
  }, [registerForm.password]);

  const passwordScore = useMemo(() => {
    return Object.values(
      passwordChecks,
    ).filter(Boolean).length;
  }, [passwordChecks]);

  useEffect(() => {
    const requestedMode =
      searchParams.get("mode");

    const githubStatus =
      searchParams.get("github");

    const githubError =
      searchParams.get("error");

    if (
      requestedMode === "register"
    ) {
      setActiveTab("register");
    } else {
      setActiveTab("login");
    }

    if (
      githubStatus === "success"
    ) {
      setSuccessMessage(
        "Connexion GitHub réussie.",
      );
    }

    if (githubError) {
      setError(
        decodeURIComponent(
          githubError,
        ),
      );
    }
  }, [searchParams]);

  function redirectByRole(user) {
    if (user?.role === "ADMIN") {
      navigate("/admin", {
        replace: true,
      });

      return;
    }

    navigate("/client", {
      replace: true,
    });
  }

  function changeTab(tab) {
    setActiveTab(tab);
    setError("");
    setSuccessMessage("");

    setSearchParams({
      mode: tab,
    });
  }

  function handleLoginChange(event) {
    const {
      name,
      value,
    } = event.target;

    setLoginForm(
      (previousForm) => ({
        ...previousForm,
        [name]: value,
      }),
    );

    setError("");
  }

  function handleRegisterChange(
    event,
  ) {
    const {
      name,
      value,
    } = event.target;

    setRegisterForm(
      (previousForm) => ({
        ...previousForm,
        [name]: value,
      }),
    );

    setError("");
  }

  async function handleLogin(event) {
    event.preventDefault();

    setError("");
    setSuccessMessage("");
    setLoading(true);

    try {
      const result =
        await loginUser(
          loginForm.email
            .trim()
            .toLowerCase(),
          loginForm.password,
        );

      redirectByRole(result.user);
    } catch (loginError) {
      setError(
        loginError.message ||
          "La connexion a échoué.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(
    event,
  ) {
    event.preventDefault();

    setError("");
    setSuccessMessage("");

    if (
      !registerForm
        .organizationName
        .trim() ||
      !registerForm
        .firstName
        .trim() ||
      !registerForm
        .lastName
        .trim() ||
      !registerForm
        .email
        .trim() ||
      !registerForm.countryCode
    ) {
      setError(
        "Veuillez remplir tous les champs obligatoires.",
      );

      return;
    }

    if (
      registerForm.password !==
      registerForm.confirmPassword
    ) {
      setError(
        "Les deux mots de passe ne correspondent pas.",
      );

      return;
    }

    if (!passwordChecks.minimumLength) {
      setError(
        "Le mot de passe doit contenir au moins 8 caractères.",
      );

      return;
    }

    if (
      !passwordChecks.hasUppercase ||
      !passwordChecks.hasLowercase ||
      !passwordChecks.hasNumber
    ) {
      setError(
        "Le mot de passe doit contenir une majuscule, une minuscule et un chiffre.",
      );

      return;
    }

    if (!acceptTerms) {
      setError(
        "Vous devez accepter les conditions d’utilisation.",
      );

      return;
    }

    setLoading(true);

    try {
      const result =
        await registerUser({
          organizationName:
            registerForm
              .organizationName
              .trim(),

          countryCode:
            registerForm.countryCode,

          firstName:
            registerForm
              .firstName
              .trim(),

          lastName:
            registerForm
              .lastName
              .trim(),

          email:
            registerForm
              .email
              .trim()
              .toLowerCase(),

          password:
            registerForm.password,
        });

      setSuccessMessage(
        "Compte créé avec succès.",
      );

      redirectByRole(result.user);
    } catch (registerError) {
      setError(
        registerError.message ||
          "La création du compte a échoué.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSuccess(
    credentialResponse,
  ) {
    setError("");
    setSuccessMessage("");

    if (
      !credentialResponse.credential
    ) {
      setError(
        "Google n’a pas retourné de jeton.",
      );

      return;
    }

    setLoading(true);

    try {
      const result =
        await loginWithGoogle(
          credentialResponse.credential,
        );

      redirectByRole(result.user);
    } catch (googleError) {
      setError(
        googleError.message ||
          "La connexion Google a échoué.",
      );
    } finally {
      setLoading(false);
    }
  }

  function handleGoogleError() {
    setError(
      "La connexion Google a échoué.",
    );
  }

  function handleGitHubLogin() {
    setError("");
    setSuccessMessage("");

    startGitHubLogin({
      mode: activeTab,
    });
  }

  function renderMessages() {
    return (
      <>
        {error && (
          <div
            className="auth-message auth-message--error"
            role="alert"
          >
            <span aria-hidden="true">
              !
            </span>

            <p>{error}</p>
          </div>
        )}

        {successMessage && (
          <div
            className="auth-message auth-message--success"
            role="status"
          >
            <span aria-hidden="true">
              ✓
            </span>

            <p>
              {successMessage}
            </p>
          </div>
        )}
      </>
    );
  }

  function renderSocialButtons() {
    return (
      <>
        <div className="auth-separator">
          <span>
            ou continuer avec
          </span>
        </div>

        <div className="auth-social-buttons">
          <div className="google-button-wrapper">
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
              width="350"
              locale="fr"
              useOneTap={false}
            />
          </div>

          <button
            type="button"
            className="github-login-button"
            onClick={
              handleGitHubLogin
            }
            disabled={loading}
          >
            <svg
              viewBox="0 0 24 24"
              className="github-login-icon"
              aria-hidden="true"
            >
              <path
                fill="currentColor"
                d="M12 .7a11.5 11.5 0 0 0-3.64 22.4c.58.11.79-.25.79-.56v-2.23c-3.23.7-3.91-1.37-3.91-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.58-.29-5.29-1.29-5.29-5.74 0-1.27.45-2.3 1.19-3.11-.12-.29-.52-1.47.11-3.07 0 0 .97-.31 3.16 1.19a10.9 10.9 0 0 1 5.76 0c2.2-1.5 3.16-1.19 3.16-1.19.63 1.6.23 2.78.11 3.07.74.81 1.19 1.84 1.19 3.11 0 4.46-2.72 5.44-5.31 5.73.42.36.79 1.07.79 2.16v3.2c0 .31.21.68.8.56A11.5 11.5 0 0 0 12 .7Z"
              />
            </svg>

            <span>
              Continuer avec GitHub
            </span>
          </button>
        </div>
      </>
    );
  }

  return (
    <main className="auth-page">
      <div className="auth-theme-position">
        <ThemeToggle />
      </div>

      <button
        type="button"
        className="auth-back-button"
        onClick={() =>
          navigate("/")
        }
      >
        <span aria-hidden="true">
          ←
        </span>

        Retour à l’accueil
      </button>

      <section className="auth-visual">
        <div
          className="auth-visual-grid"
          aria-hidden="true"
        />

        <div className="auth-visual-glow auth-visual-glow--one" />
        <div className="auth-visual-glow auth-visual-glow--two" />

        <div className="auth-visual-content">
          <Logo className="auth-brand-logo" />

          <span className="auth-visual-label">
            Tenor Afrique
          </span>

          <h1>
            Une plateforme unique pour
            vos factures électroniques
          </h1>

          <p>
            Importez, contrôlez, signez
            et transmettez vos factures
            tout en conservant une
            traçabilité complète.
          </p>

          <div className="auth-features">
            <div className="auth-feature">
              <span>✓</span>

              <div>
                <strong>
                  Extraction intelligente
                </strong>

                <small>
                  PDF, OCR et données ERP
                </small>
              </div>
            </div>

            <div className="auth-feature">
              <span>✓</span>

              <div>
                <strong>
                  Signature électronique
                </strong>

                <small>
                  TEIF et XAdES-EPES
                </small>
              </div>
            </div>

            <div className="auth-feature">
              <span>✓</span>

              <div>
                <strong>
                  Suivi des statuts TTN
                </strong>

                <small>
                  Acceptée, rejetée ou en attente
                </small>
              </div>
            </div>
          </div>

          <div className="auth-visual-proof">
            <div>
              <strong>6</strong>
              <span>
                étapes automatisées
              </span>
            </div>

            <div>
              <strong>4</strong>
              <span>
                statuts suivis
              </span>
            </div>

            <div>
              <strong>1</strong>
              <span>
                espace centralisé
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="auth-form-section">
        <div className="auth-container">
          <div className="auth-mobile-title">
            <Logo className="auth-mobile-logo" />

            <p>
              Portail de gestion des
              factures électroniques
            </p>
          </div>

          <div
            className="auth-tabs"
            role="tablist"
            aria-label="Authentification"
          >
            <button
              type="button"
              role="tab"
              aria-selected={
                activeTab === "login"
              }
              className={
                activeTab === "login"
                  ? "auth-tab active"
                  : "auth-tab"
              }
              onClick={() =>
                changeTab("login")
              }
            >
              Se connecter
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={
                activeTab === "register"
              }
              className={
                activeTab === "register"
                  ? "auth-tab active"
                  : "auth-tab"
              }
              onClick={() =>
                changeTab("register")
              }
            >
              Créer un compte
            </button>
          </div>

          {activeTab === "login" ? (
            <div className="auth-panel">
              <div className="auth-heading">
                <span>
                  Espace sécurisé
                </span>

                <h2>
                  Bon retour parmi nous
                </h2>

                <p>
                  Connectez-vous pour accéder
                  à votre tableau de bord.
                </p>
              </div>

              <form
                className="auth-form"
                onSubmit={handleLogin}
              >
                <div className="auth-form-group">
                  <label htmlFor="login-email">
                    Adresse e-mail
                  </label>

                  <input
                    id="login-email"
                    name="email"
                    type="email"
                    value={loginForm.email}
                    onChange={
                      handleLoginChange
                    }
                    placeholder="nom@entreprise.tn"
                    autoComplete="email"
                    required
                  />
                </div>

                <div className="auth-form-group">
                  <div className="auth-label-row">
                    <label htmlFor="login-password">
                      Mot de passe
                    </label>

                    <Link
                      to="/forgot-password"
                      className="auth-forgot-link"
                    >
                      Mot de passe oublié ?
                    </Link>
                  </div>

                  <div className="password-input-wrapper">
                    <input
                      id="login-password"
                      name="password"
                      type={
                        showLoginPassword
                          ? "text"
                          : "password"
                      }
                      value={
                        loginForm.password
                      }
                      onChange={
                        handleLoginChange
                      }
                      placeholder="Votre mot de passe"
                      autoComplete="current-password"
                      required
                    />

                    <button
                      type="button"
                      className="password-toggle-button"
                      onClick={() =>
                        setShowLoginPassword(
                          (currentValue) =>
                            !currentValue,
                        )
                      }
                    >
                      {showLoginPassword
                        ? "Masquer"
                        : "Afficher"}
                    </button>
                  </div>
                </div>

                {renderMessages()}

                <button
                  className="auth-primary-button"
                  type="submit"
                  disabled={loading}
                >
                  <span>
                    {loading
                      ? "Connexion..."
                      : "Se connecter"}
                  </span>

                  {!loading && (
                    <span aria-hidden="true">
                      →
                    </span>
                  )}
                </button>
              </form>

              {renderSocialButtons()}

              <p className="auth-switch-text">
                Vous n’avez pas encore
                de compte ?{" "}

                <button
                  type="button"
                  className="auth-link-button"
                  onClick={() =>
                    changeTab("register")
                  }
                >
                  Créer un compte
                </button>
              </p>
            </div>
          ) : (
            <div className="auth-panel auth-panel--register">
              <div className="auth-heading">
                <span>
                  Nouvel espace
                </span>

                <h2>
                  Créer votre compte
                </h2>

                <p>
                  Inscrivez votre organisation
                  pour commencer à gérer vos
                  factures électroniques.
                </p>
              </div>

              <form
                className="auth-form"
                onSubmit={
                  handleRegister
                }
              >
                <div className="auth-form-row">
                  <div className="auth-form-group">
                    <label htmlFor="firstName">
                      Prénom
                    </label>

                    <input
                      id="firstName"
                      name="firstName"
                      type="text"
                      value={
                        registerForm.firstName
                      }
                      onChange={
                        handleRegisterChange
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
                      name="lastName"
                      type="text"
                      value={
                        registerForm.lastName
                      }
                      onChange={
                        handleRegisterChange
                      }
                      placeholder="Hamouda"
                      autoComplete="family-name"
                      required
                    />
                  </div>
                </div>

                <div className="auth-form-group">
                  <label htmlFor="organizationName">
                    Nom de l’organisation
                  </label>

                  <input
                    id="organizationName"
                    name="organizationName"
                    type="text"
                    value={
                      registerForm
                        .organizationName
                    }
                    onChange={
                      handleRegisterChange
                    }
                    placeholder="Entreprise SARL"
                    autoComplete="organization"
                    required
                  />
                </div>

                <div className="auth-form-row">
                  <div className="auth-form-group">
                    <label htmlFor="countryCode">
                      Pays
                    </label>

                    <select
                      id="countryCode"
                      name="countryCode"
                      value={
                        registerForm
                          .countryCode
                      }
                      onChange={
                        handleRegisterChange
                      }
                      autoComplete="country"
                      required
                    >
                      <option value="">
                        Sélectionnez un pays
                      </option>

                      {countryOptions.map(
                        (country) => (
                          <option
                            key={country.code}
                            value={country.code}
                          >
                            {country.name}
                          </option>
                        ),
                      )}
                    </select>
                  </div>

                  <div className="auth-form-group">
                    <label htmlFor="register-email">
                      Adresse e-mail
                    </label>

                    <input
                      id="register-email"
                      name="email"
                      type="email"
                      value={
                        registerForm.email
                      }
                      onChange={
                        handleRegisterChange
                      }
                      placeholder="nom@entreprise.tn"
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                <div className="auth-form-row">
                  <div className="auth-form-group">
                    <label htmlFor="register-password">
                      Mot de passe
                    </label>

                    <div className="password-input-wrapper">
                      <input
                        id="register-password"
                        name="password"
                        type={
                          showRegisterPassword
                            ? "text"
                            : "password"
                        }
                        value={
                          registerForm.password
                        }
                        onChange={
                          handleRegisterChange
                        }
                        placeholder="8 caractères minimum"
                        autoComplete="new-password"
                        minLength={8}
                        required
                      />

                      <button
                        type="button"
                        className="password-toggle-button"
                        onClick={() =>
                          setShowRegisterPassword(
                            (currentValue) =>
                              !currentValue,
                          )
                        }
                      >
                        {showRegisterPassword
                          ? "Masquer"
                          : "Afficher"}
                      </button>
                    </div>
                  </div>

                  <div className="auth-form-group">
                    <label htmlFor="confirmPassword">
                      Confirmation
                    </label>

                    <div className="password-input-wrapper">
                      <input
                        id="confirmPassword"
                        name="confirmPassword"
                        type={
                          showRegisterPassword
                            ? "text"
                            : "password"
                        }
                        value={
                          registerForm
                            .confirmPassword
                        }
                        onChange={
                          handleRegisterChange
                        }
                        placeholder="Confirmez"
                        autoComplete="new-password"
                        minLength={8}
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="password-security">
                  <div className="password-strength-header">
                    <span>
                      Sécurité du mot de passe
                    </span>

                    <strong>
                      {passwordScore <= 1 &&
                        "Faible"}

                      {passwordScore === 2 &&
                        "Moyenne"}

                      {passwordScore === 3 &&
                        "Correcte"}

                      {passwordScore === 4 &&
                        "Bonne"}

                      {passwordScore === 5 &&
                        "Excellente"}
                    </strong>
                  </div>

                  <div className="password-strength-track">
                    <span
                      className={`password-strength-value password-strength-value--${passwordScore}`}
                    />
                  </div>

                  <div className="password-requirements">
                    <span
                      className={
                        passwordChecks.minimumLength
                          ? "is-valid"
                          : ""
                      }
                    >
                      ✓ 8 caractères
                    </span>

                    <span
                      className={
                        passwordChecks.hasUppercase
                          ? "is-valid"
                          : ""
                      }
                    >
                      ✓ Une majuscule
                    </span>

                    <span
                      className={
                        passwordChecks.hasLowercase
                          ? "is-valid"
                          : ""
                      }
                    >
                      ✓ Une minuscule
                    </span>

                    <span
                      className={
                        passwordChecks.hasNumber
                          ? "is-valid"
                          : ""
                      }
                    >
                      ✓ Un chiffre
                    </span>

                    <span
                      className={
                        passwordChecks
                          .hasSpecialCharacter
                          ? "is-valid"
                          : ""
                      }
                    >
                      ✓ Un caractère spécial
                    </span>
                  </div>
                </div>

                <label className="auth-terms">
                  <input
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={(event) =>
                      setAcceptTerms(
                        event.target.checked,
                      )
                    }
                    required
                  />

                  <span>
                    J’accepte les{" "}

                    <Link to="/terms">
                      conditions d’utilisation
                    </Link>

                    {" "}et la{" "}

                    <Link to="/privacy">
                      politique de confidentialité
                    </Link>
                    .
                  </span>
                </label>

                {renderMessages()}

                <button
                  className="auth-primary-button"
                  type="submit"
                  disabled={loading}
                >
                  <span>
                    {loading
                      ? "Création..."
                      : "Créer mon compte"}
                  </span>

                  {!loading && (
                    <span aria-hidden="true">
                      →
                    </span>
                  )}
                </button>
              </form>

              {renderSocialButtons()}

              <p className="auth-switch-text">
                Vous avez déjà un
                compte ?{" "}

                <button
                  type="button"
                  className="auth-link-button"
                  onClick={() =>
                    changeTab("login")
                  }
                >
                  Se connecter
                </button>
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export default AuthPage;