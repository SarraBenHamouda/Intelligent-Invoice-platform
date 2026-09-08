import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Link,
} from "react-router-dom";

import AuthenticatedHeader from "../../../../components/navigation/AuthenticatedHeader/AuthenticatedHeader";
import AuthenticatedFooter from "../../../../components/navigation/AuthenticatedFooter/AuthenticatedFooter";

import AvatarCreator from "../AvatarCreator/AvatarCreator.jsx";

import {
  deleteAvatar,
  getProfile,
  updateProfile,
  uploadAvatar,
} from "../../../../services/profileService";

import {
  getClientDashboard,
} from "../../../../services/clientDashboardService";

import "./ProfilePage.css";

/*
|--------------------------------------------------------------------------
| COUNTRIES
|--------------------------------------------------------------------------
*/

const COUNTRY_OPTIONS = [
  { value: "", label: "Non renseigné" },
  { value: "TN", label: "Tunisie" },
  { value: "FR", label: "France" },
  { value: "ES", label: "Espagne" },
  { value: "IT", label: "Italie" },
  { value: "DE", label: "Allemagne" },
  { value: "BE", label: "Belgique" },
  { value: "CA", label: "Canada" },
  { value: "MA", label: "Maroc" },
  { value: "DZ", label: "Algérie" },
];

const DEFAULT_ACTIVITY = {
  total: 0,
  accepted: 0,
  processing: 0,
  attention: 0,
};

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function getCountryLabel(countryCode) {
  const country = COUNTRY_OPTIONS.find(
    (item) => item.value === countryCode,
  );

  return (
    country?.label ||
    countryCode ||
    "Non renseigné"
  );
}

function getInitials(firstName, lastName) {
  const first = String(firstName || "")
    .trim()
    .charAt(0)
    .toUpperCase();

  const last = String(lastName || "")
    .trim()
    .charAt(0)
    .toUpperCase();

  return `${first}${last}` || "U";
}

function getBackendOrigin() {
  if (
    typeof window !== "undefined" &&
    window.location?.hostname
  ) {
    return `http://${window.location.hostname}:3000`;
  }

  return "http://localhost:3000";
}

function getAvatarSource(profile) {
  if (!profile) {
    return null;
  }

  const avatar =
    profile.avatar_absolute_url ||
    profile.avatar_url ||
    null;

  if (!avatar) {
    return null;
  }

  if (
    avatar.startsWith("http://") ||
    avatar.startsWith("https://")
  ) {
    return avatar;
  }

  const normalizedAvatar =
    avatar.startsWith("/")
      ? avatar
      : `/${avatar}`;

  return `${getBackendOrigin()}${normalizedAvatar}`;
}

function getProfileCompleteness(profile) {
  if (!profile) {
    return 0;
  }

  const fields = [
    profile.first_name,
    profile.last_name,
    profile.email,
    profile.phone,
    profile.city,
    profile.country_code,
    profile.avatar_url,
  ];

  const completedFields =
    fields.filter(
      (value) =>
        String(value || "")
          .trim()
          .length > 0,
    ).length;

  return Math.round(
    (completedFields / fields.length) * 100,
  );
}

function normalizeStatus(status) {
  return String(status || "")
    .trim()
    .toUpperCase();
}

function getStatValue(stats, keywords) {
  if (!Array.isArray(stats)) {
    return null;
  }

  const item = stats.find((stat) => {
    const searchable = [
      stat?.key,
      stat?.label,
      stat?.title,
      stat?.name,
      stat?.status,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return keywords.some((keyword) =>
      searchable.includes(keyword),
    );
  });

  if (!item) {
    return null;
  }

  const value =
    item.value ??
    item.count ??
    item.total ??
    item.number ??
    null;

  const numericValue = Number(value);

  return Number.isFinite(numericValue)
    ? numericValue
    : null;
}

function calculateActivity(dashboardResponse) {
  const recentInvoices =
    Array.isArray(
      dashboardResponse?.recentInvoices,
    )
      ? dashboardResponse.recentInvoices
      : [];

  const stats =
    dashboardResponse?.stats || [];

  const totalFromStats =
    getStatValue(
      stats,
      ["total", "factures"],
    );

  const acceptedFromStats =
    getStatValue(
      stats,
      ["accept", "valid"],
    );

  const processingFromStats =
    getStatValue(
      stats,
      [
        "traitement",
        "processing",
        "cours",
      ],
    );

  const attentionFromStats =
    getStatValue(
      stats,
      [
        "rejet",
        "erreur",
        "vérifier",
        "attention",
      ],
    );

  const acceptedFromInvoices =
    recentInvoices.filter(
      (invoice) =>
        normalizeStatus(
          invoice?.status,
        ) === "ACCEPTED",
    ).length;

  const processingStatuses = [
    "UPLOADED",
    "PROCESSING",
    "PENDING_REVIEW",
    "VALIDATED",
    "SIGNING",
    "SIGNED",
    "SUBMITTED",
    "PENDING_RETRY",
  ];

  const attentionStatuses = [
    "REJECTED",
    "ERROR",
    "PENDING_REVIEW",
    "PENDING_RETRY",
  ];

  const processingFromInvoices =
    recentInvoices.filter(
      (invoice) =>
        processingStatuses.includes(
          normalizeStatus(
            invoice?.status,
          ),
        ),
    ).length;

  const attentionFromInvoices =
    recentInvoices.filter(
      (invoice) =>
        attentionStatuses.includes(
          normalizeStatus(
            invoice?.status,
          ),
        ),
    ).length;

  return {
    total:
      totalFromStats ??
      recentInvoices.length,

    accepted:
      acceptedFromStats ??
      acceptedFromInvoices,

    processing:
      processingFromStats ??
      processingFromInvoices,

    attention:
      attentionFromStats ??
      attentionFromInvoices,
  };
}

/*
|--------------------------------------------------------------------------
| NOTICE
|--------------------------------------------------------------------------
*/

function ProfileNotice({
  type,
  children,
  onClose,
}) {
  if (!children) {
    return null;
  }

  return (
    <div
      className={`profile-notice profile-notice--${type}`}
      role={
        type === "error"
          ? "alert"
          : "status"
      }
    >
      <span
        className="profile-notice__icon"
        aria-hidden="true"
      >
        {type === "success"
          ? "✓"
          : "!"}
      </span>

      <p>{children}</p>

      <button
        type="button"
        onClick={onClose}
        aria-label="Fermer le message"
      >
        ×
      </button>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| PROFILE PAGE
|--------------------------------------------------------------------------
*/

function ProfilePage() {
  const fileInputRef =
    useRef(null);

  const [
    profile,
    setProfile,
  ] = useState(null);

  const [
    form,
    setForm,
  ] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    city: "",
    country_code: "",
  });

  const [
    activity,
    setActivity,
  ] = useState(
    DEFAULT_ACTIVITY,
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    uploadingAvatar,
    setUploadingAvatar,
  ] = useState(false);

  const [
    deletingAvatar,
    setDeletingAvatar,
  ] = useState(false);

  const [
    avatarCreatorOpen,
    setAvatarCreatorOpen,
  ] = useState(false);

  const [
    savingGeneratedAvatar,
    setSavingGeneratedAvatar,
  ] = useState(false);

  const [
    deletePhotoConfirmOpen,
    setDeletePhotoConfirmOpen,
  ] = useState(false);

  const [
    notice,
    setNotice,
  ] = useState({
    type: "",
    message: "",
  });

  const [
    appearanceLabel,
    setAppearanceLabel,
  ] = useState("Clair");

  /*
  |--------------------------------------------------------------------------
  | PROFILE HYDRATION
  |--------------------------------------------------------------------------
  */

  function hydrateProfile(nextProfile) {
    setProfile(nextProfile);

    setForm({
      first_name:
        nextProfile?.first_name || "",

      last_name:
        nextProfile?.last_name || "",

      phone:
        nextProfile?.phone || "",

      city:
        nextProfile?.city || "",

      country_code:
        nextProfile?.country_code || "",
    });
  }

  /*
  |--------------------------------------------------------------------------
  | LOAD
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      try {
        setLoading(true);

        setNotice({
          type: "",
          message: "",
        });

        const [
          profileResponse,
          dashboardResponse,
        ] = await Promise.all([
          getProfile(),

          getClientDashboard()
            .catch(
              () => null,
            ),
        ]);

        if (cancelled) {
          return;
        }

        hydrateProfile(
          profileResponse.profile,
        );

        if (dashboardResponse) {
          setActivity(
            calculateActivity(
              dashboardResponse,
            ),
          );
        }
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        setNotice({
          type: "error",
          message:
            loadError?.message ||
            "Impossible de charger votre profil.",
        });
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadPage();

    return () => {
      cancelled = true;
    };
  }, []);

  /*
  |--------------------------------------------------------------------------
  | THEME
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (
      typeof document === "undefined"
    ) {
      return undefined;
    }

    const root =
      document.documentElement;

    function syncAppearance() {
      const theme =
        root.getAttribute(
          "data-theme",
        );

      setAppearanceLabel(
        theme === "dark"
          ? "Sombre"
          : "Clair",
      );
    }

    syncAppearance();

    const observer =
      new MutationObserver(
        syncAppearance,
      );

    observer.observe(
      root,
      {
        attributes: true,
        attributeFilter: [
          "data-theme",
        ],
      },
    );

    return () => {
      observer.disconnect();
    };
  }, []);

  /*
  |--------------------------------------------------------------------------
  | MODALS
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const modalOpen =
      avatarCreatorOpen ||
      deletePhotoConfirmOpen;

    if (!modalOpen) {
      return undefined;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    function handleEscape(event) {
      if (
        event.key !==
        "Escape"
      ) {
        return;
      }

      if (
        deletePhotoConfirmOpen &&
        !deletingAvatar
      ) {
        setDeletePhotoConfirmOpen(
          false,
        );

        return;
      }

      if (
        avatarCreatorOpen &&
        !savingGeneratedAvatar
      ) {
        setAvatarCreatorOpen(
          false,
        );
      }
    }

    window.addEventListener(
      "keydown",
      handleEscape,
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        "keydown",
        handleEscape,
      );
    };
  }, [
    avatarCreatorOpen,
    deletePhotoConfirmOpen,
    deletingAvatar,
    savingGeneratedAvatar,
  ]);

  /*
  |--------------------------------------------------------------------------
  | COMPUTED
  |--------------------------------------------------------------------------
  */

  const displayName =
    useMemo(
      () => {
        const composed = [
          profile?.first_name,
          profile?.last_name,
        ]
          .filter(Boolean)
          .join(" ")
          .trim();

        return (
          profile?.full_name ||
          composed ||
          "Utilisateur"
        );
      },
      [profile],
    );

  const initials =
    useMemo(
      () =>
        getInitials(
          profile?.first_name,
          profile?.last_name,
        ),
      [
        profile?.first_name,
        profile?.last_name,
      ],
    );

  const avatarSource =
    useMemo(
      () =>
        getAvatarSource(profile),
      [profile],
    );

  const profileCompleteness =
    useMemo(
      () =>
        getProfileCompleteness(
          profile,
        ),
      [profile],
    );

  const countryLabel =
    useMemo(
      () =>
        getCountryLabel(
          profile?.country_code,
        ),
      [profile?.country_code],
    );

  const locationLabel =
    useMemo(
      () => {
        const values = [
          profile?.city,

          profile?.country_code
            ? countryLabel
            : null,
        ].filter(Boolean);

        return (
          values.join(" · ") ||
          "Non renseignée"
        );
      },
      [
        profile?.city,
        profile?.country_code,
        countryLabel,
      ],
    );

  const hasAvatar =
    Boolean(
      profile?.avatar_url,
    );

  /*
  |--------------------------------------------------------------------------
  | FORM
  |--------------------------------------------------------------------------
  */

  function handleChange(event) {
    const {
      name,
      value,
    } = event.target;

    setForm(
      (current) => ({
        ...current,
        [name]: value,
      }),
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      setSaving(true);

      setNotice({
        type: "",
        message: "",
      });

      const response =
        await updateProfile({
          first_name:
            form.first_name,

          last_name:
            form.last_name,

          phone:
            form.phone,

          city:
            form.city,

          country_code:
            form.country_code,
        });

      hydrateProfile(
        response.profile,
      );

      setNotice({
        type: "success",
        message:
          response?.message ||
          "Vos informations ont été enregistrées.",
      });
    } catch (saveError) {
      setNotice({
        type: "error",
        message:
          saveError?.message ||
          "Impossible d'enregistrer les modifications.",
      });
    } finally {
      setSaving(false);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | PHOTO UPLOAD
  |--------------------------------------------------------------------------
  */

  function openPhotoPicker() {
    fileInputRef
      .current
      ?.click();
  }

  async function handleAvatarChange(event) {
    const file =
      event.target.files?.[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (
      !allowedTypes.includes(
        file.type,
      )
    ) {
      setNotice({
        type: "error",
        message:
          "Utilisez une image JPG, PNG ou WEBP.",
      });

      return;
    }

    if (
      file.size >
      5 * 1024 * 1024
    ) {
      setNotice({
        type: "error",
        message:
          "L'image ne doit pas dépasser 5 Mo.",
      });

      return;
    }

    try {
      setUploadingAvatar(true);

      setNotice({
        type: "",
        message: "",
      });

      const response =
        await uploadAvatar(file);

      hydrateProfile(
        response.profile,
      );

      setNotice({
        type: "success",
        message:
          "Votre photo de profil a été mise à jour.",
      });
    } catch (uploadError) {
      setNotice({
        type: "error",
        message:
          uploadError?.message ||
          "Impossible de modifier la photo.",
      });
    } finally {
      setUploadingAvatar(false);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | DELETE PHOTO
  |--------------------------------------------------------------------------
  */

  function requestDeleteAvatar() {
    setDeletePhotoConfirmOpen(
      true,
    );
  }

  function closeDeleteAvatarConfirm() {
    if (deletingAvatar) {
      return;
    }

    setDeletePhotoConfirmOpen(
      false,
    );
  }

  async function handleDeleteAvatar() {
    if (!profile?.avatar_url) {
      return;
    }

    try {
      setDeletingAvatar(true);

      setNotice({
        type: "",
        message: "",
      });

      const response =
        await deleteAvatar();

      hydrateProfile(
        response.profile,
      );

      setDeletePhotoConfirmOpen(
        false,
      );

      setNotice({
        type: "success",
        message:
          "Votre photo de profil a été supprimée.",
      });
    } catch (deleteError) {
      setNotice({
        type: "error",
        message:
          deleteError?.message ||
          "Impossible de supprimer la photo.",
      });
    } finally {
      setDeletingAvatar(false);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | AVATAR CREATOR
  |--------------------------------------------------------------------------
  */

  function openAvatarCreator() {
    setNotice({
      type: "",
      message: "",
    });

    setAvatarCreatorOpen(
      true,
    );
  }

  function closeAvatarCreator() {
    if (
      savingGeneratedAvatar
    ) {
      return;
    }

    setAvatarCreatorOpen(
      false,
    );
  }

  async function handleUseGeneratedAvatar(
    generatedFile,
  ) {
    if (!generatedFile) {
      return;
    }

    try {
      setSavingGeneratedAvatar(
        true,
      );

      const response =
        await uploadAvatar(
          generatedFile,
        );

      hydrateProfile(
        response.profile,
      );

      setAvatarCreatorOpen(
        false,
      );

      setNotice({
        type: "success",
        message:
          "Votre avatar personnalisé a été enregistré.",
      });
    } catch (avatarError) {
      setNotice({
        type: "error",
        message:
          avatarError?.message ||
          "Impossible d'enregistrer l'avatar.",
      });

      throw avatarError;
    } finally {
      setSavingGeneratedAvatar(
        false,
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | LOADING
  |--------------------------------------------------------------------------
  */

  if (loading) {
    return (
      <div className="profile-page-wrapper">
        <AuthenticatedHeader />

        <main className="profile-page">
          <div className="profile-shell">
            <section className="profile-loading">
              <span className="profile-spinner" />

              <strong>
                Chargement du profil
              </strong>

              <p>
                Préparation de votre espace personnel.
              </p>
            </section>
          </div>
        </main>

        <AuthenticatedFooter />
      </div>
    );
  }

  /*
  |--------------------------------------------------------------------------
  | PAGE
  |--------------------------------------------------------------------------
  */

  return (
    <div className="profile-page-wrapper">
      <AuthenticatedHeader />

      <main className="profile-page">
        <div className="profile-shell">
          <header className="profile-page-header">
           

            <h1>
              Mon profil
            </h1>
          </header>

          <ProfileNotice
            type={notice.type}
            onClose={() =>
              setNotice({
                type: "",
                message: "",
              })
            }
          >
            {notice.message}
          </ProfileNotice>

          <section className="profile-workspace">
            <aside className="profile-account-panel">
              <div className="profile-account-heading">
                <h2>
                  Mon espace personnel
                </h2>

                
              </div>

              <div className="profile-account-avatar-wrap">
                <div className="profile-account-avatar">
                  {avatarSource ? (
                    <img
                      src={avatarSource}
                      alt={displayName}
                    />
                  ) : (
                    <span>
                      {initials}
                    </span>
                  )}
                </div>

                <span className="profile-account-avatar-status">
                  ✓
                </span>
              </div>

              <div className="profile-account-identity">
                <strong>
                  {displayName}
                </strong>

                <div className="profile-account-badges">
                  <span className="profile-account-role">
                    Client
                  </span>

                  <span className="profile-account-status">
                    <i aria-hidden="true" />
                    Compte actif
                  </span>
                </div>

                <small>
                  {profile?.email ||
                    "E-mail non renseigné"}
                </small>

                <small>
                  {locationLabel}
                </small>
              </div>

              <div className="profile-account-actions">
                <button
                  type="button"
                  className="profile-button profile-button--primary"
                  onClick={openPhotoPicker}
                  disabled={uploadingAvatar}
                >
                  {uploadingAvatar
                    ? "Importation..."
                    : "Changer la photo"}
                </button>

                <button
                  type="button"
                  className="profile-button profile-button--secondary"
                  onClick={openAvatarCreator}
                >
                  Créer un avatar
                </button>

                {hasAvatar && (
                  <button
                    type="button"
                    className="profile-button profile-button--danger profile-button--text"
                    onClick={requestDeleteAvatar}
                    disabled={deletingAvatar}
                  >
                    Supprimer la photo
                  </button>
                )}

                <input
                  ref={fileInputRef}
                  className="profile-file-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleAvatarChange}
                />
              </div>

              <div className="profile-completeness">
                <div className="profile-completeness-top">
                  <span>
                    Profil à jour
                  </span>

                  <strong>
                    {profileCompleteness}%
                  </strong>
                </div>

                <div className="profile-completeness-bar">
                  <span
                    style={{
                      width:
                        `${profileCompleteness}%`,
                    }}
                  />
                </div>

                <p>
                  {profileCompleteness === 100
                    ? "Toutes les informations principales sont renseignées."
                    : "Complétez les informations manquantes pour garder votre profil à jour."}
                </p>
              </div>
            </aside>

            <form
              className="profile-information-panel"
              onSubmit={handleSubmit}
            >
              <header className="profile-panel-header">
                <div>

                  <h2>
                    Mes coordonnées
                  </h2>

                 
                </div>
              </header>

              <div className="profile-form-grid">
                <label className="profile-field">
                  <span>
                    Prénom
                  </span>

                  <input
                    type="text"
                    name="first_name"
                    value={form.first_name}
                    onChange={handleChange}
                    maxLength={100}
                    autoComplete="given-name"
                    required
                  />
                </label>

                <label className="profile-field">
                  <span>
                    Nom
                  </span>

                  <input
                    type="text"
                    name="last_name"
                    value={form.last_name}
                    onChange={handleChange}
                    maxLength={100}
                    autoComplete="family-name"
                    required
                  />
                </label>

                <label className="profile-field profile-field--full">
                  <span>
                    Adresse e-mail
                  </span>

                  <input
                    type="email"
                    value={profile?.email || ""}
                    disabled
                  />

                  <small>
                    Cette adresse sert à votre connexion
                    et ne peut pas être modifiée ici.
                  </small>
                </label>

                <label className="profile-field">
                  <span>
                    Téléphone
                  </span>

                  <input
                    type="tel"
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder="+216 ..."
                    maxLength={50}
                    autoComplete="tel"
                  />
                </label>

                <label className="profile-field">
                  <span>
                    Ville
                  </span>

                  <input
                    type="text"
                    name="city"
                    value={form.city}
                    onChange={handleChange}
                    placeholder="Tunis"
                    maxLength={120}
                    autoComplete="address-level2"
                  />
                </label>

                <label className="profile-field profile-field--full">
                  <span>
                    Pays
                  </span>

                  <select
                    name="country_code"
                    value={form.country_code}
                    onChange={handleChange}
                  >
                    {COUNTRY_OPTIONS.map(
                      (country) => (
                        <option
                          key={country.value}
                          value={country.value}
                        >
                          {country.label}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </div>

              <div className="profile-information-summary">
                <div>
                  <span>
                    Compte
                  </span>

                  <strong>
                    Client
                  </strong>
                </div>

                <div>
                  <span>
                    Statut
                  </span>

                  <strong className="profile-summary-status">
                    <i aria-hidden="true" />
                    Actif
                  </strong>
                </div>

                <div>
                  <span>
                    Localisation
                  </span>

                  <strong>
                    {locationLabel}
                  </strong>
                </div>
              </div>

              <footer className="profile-panel-actions">
                <button
                  type="submit"
                  className="profile-button profile-button--primary"
                  disabled={saving}
                >
                  {saving
                    ? "Enregistrement..."
                    : "Enregistrer les modifications"}
                </button>
              </footer>
            </form>
          </section>

          <div className="profile-lower-grid">
            <section className="profile-lower-card">
              <header className="profile-panel-header">
                <div>

                  <h2>
                    Mes préférences
                  </h2>
                </div>
              </header>

              <div className="profile-preference-list">
                <article className="profile-preference-item">
                  <div className="profile-preference-icon profile-preference-icon--appearance">
                    <span>☀</span>
                    <span>◐</span>
                  </div>

                  <div>
                    <strong>
                      Apparence
                    </strong>

                    <span>
                      Mode actuel : {appearanceLabel}
                    </span>

                    <small>
                      Le thème se change depuis le bouton
                      du bandeau supérieur.
                    </small>
                  </div>

                  <span className="profile-preference-badge">
                    {appearanceLabel}
                  </span>
                </article>

                <article className="profile-preference-item">
                  <div className="profile-preference-icon">
                    FR
                  </div>

                  <div>
                    <strong>
                      Langue
                    </strong>

                    <span>
                      Français
                    </span>

                    <small>
                      Toute l’interface de votre portail
                      est affichée en français.
                    </small>
                  </div>

                  <span className="profile-language-badge">
                    FR
                  </span>
                </article>
              </div>
            </section>

            <section className="profile-lower-card profile-invoices-card">
              <header className="profile-panel-header">
                <div>

                  <h2>
                    Mes factures
                  </h2>      
                </div>
              </header>

              <div className="profile-invoice-stats">
                <article>
                  <span>
                    Total
                  </span>

                  <strong>
                    {activity.total}
                  </strong>

                  <small>
                    Factures
                  </small>
                </article>

                <article className="is-success">
                  <span>
                    Acceptées
                  </span>

                  <strong>
                    {activity.accepted}
                  </strong>

                  <small>
                    Terminées
                  </small>
                </article>

                <article className="is-warning">
                  <span>
                    En cours
                  </span>

                  <strong>
                    {activity.processing}
                  </strong>

                  <small>
                    À suivre
                  </small>
                </article>

                <article className="is-danger">
                  <span>
                    À vérifier
                  </span>

                  <strong>
                    {activity.attention}
                  </strong>

                  <small>
                    Attention requise
                  </small>
                </article>
              </div>

              <Link
                to="/client/invoices"
                className="profile-invoices-link"
              >
                <span>
                  Voir mes factures
                </span>

                <span aria-hidden="true">
                  →
                </span>
              </Link>
            </section>
          </div>
        </div>
      </main>

      <AuthenticatedFooter />

      {deletePhotoConfirmOpen && (
        <div
          className="profile-delete-modal"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="profile-delete-photo-title"
          aria-describedby="profile-delete-photo-description"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeDeleteAvatarConfirm();
            }
          }}
        >
          <div className="profile-delete-modal__panel">
            <button
              type="button"
              className="profile-delete-modal__close"
              onClick={closeDeleteAvatarConfirm}
              disabled={deletingAvatar}
              aria-label="Fermer"
            >
              ×
            </button>

            <div className="profile-delete-modal__icon">
              !
            </div>

            <span className="profile-delete-modal__label">
              Confirmation
            </span>

            <h2 id="profile-delete-photo-title">
              Supprimer votre photo ?
            </h2>

            <p id="profile-delete-photo-description">
              Votre photo actuelle sera supprimée.
              Votre compte, vos coordonnées et vos factures
              resteront inchangés.
            </p>

            <div className="profile-delete-modal__actions">
              <button
                type="button"
                className="profile-delete-modal__cancel"
                onClick={closeDeleteAvatarConfirm}
                disabled={deletingAvatar}
              >
                Garder ma photo
              </button>

              <button
                type="button"
                className="profile-delete-modal__confirm"
                onClick={handleDeleteAvatar}
                disabled={deletingAvatar}
              >
                {deletingAvatar
                  ? "Suppression..."
                  : "Supprimer la photo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {avatarCreatorOpen && (
        <div
          className="profile-avatar-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Créer mon avatar"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeAvatarCreator();
            }
          }}
        >
          <div className="profile-avatar-modal__panel">
            <AvatarCreator
              displayName={displayName}
              onClose={closeAvatarCreator}
              onUseAvatar={handleUseGeneratedAvatar}
            />

            {savingGeneratedAvatar && (
              <div className="profile-avatar-modal__saving">
                <span className="profile-spinner" />

                <strong>
                  Enregistrement de votre avatar...
                </strong>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfilePage;