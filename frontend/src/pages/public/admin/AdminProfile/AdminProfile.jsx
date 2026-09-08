import {
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Link,
} from "react-router-dom";

import AdminShell from "../AdminShell/AdminShell";

import {
  getAccessToken,
  getStoredUser,
} from "../../../../services/authService";

import "./AdminProfilePage.css";

/*
|--------------------------------------------------------------------------
| CONFIGURATION
|--------------------------------------------------------------------------
*/

const API_BASE_URL =
  String(
    import.meta.env.VITE_API_URL ||
      "http://localhost:3000",
  ).replace(/\/+$/, "");

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function formatDate(value) {
  if (!value) {
    return "Non disponible";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "Non disponible";
  }

  return new Intl.DateTimeFormat(
    "fr-FR",
    {
      day:
        "2-digit",

      month:
        "long",

      year:
        "numeric",
    },
  ).format(date);
}

function normalizeProvider(value) {
  const provider =
    String(value || "")
      .trim()
      .toLowerCase();

  if (
    provider ===
    "google"
  ) {
    return {
      label:
        "Google",

      icon:
        "🌐",
    };
  }

  if (
    provider ===
    "github"
  ) {
    return {
      label:
        "GitHub",

      icon:
        "💻",
    };
  }

  return {
    label:
      "Compte local",

    icon:
      "🔑",
  };
}

function resolveAvatarUrl(
  avatarUrl,
) {
  if (!avatarUrl) {
    return null;
  }

  const value =
    String(
      avatarUrl,
    ).trim();

  if (
    value.startsWith(
      "http://",
    ) ||
    value.startsWith(
      "https://",
    ) ||
    value.startsWith(
      "data:",
    ) ||
    value.startsWith(
      "blob:",
    )
  ) {
    return value;
  }

  if (
    value.startsWith(
      "/",
    )
  ) {
    return `${API_BASE_URL}${value}`;
  }

  return `${API_BASE_URL}/${value}`;
}

/*
|--------------------------------------------------------------------------
| UPDATE STORED USER
|--------------------------------------------------------------------------
*/

function updateStoredUser(
  newUser,
) {
  if (!newUser) {
    return;
  }

  const currentUser =
    getStoredUser() ||
    {};

  const mergedUser = {
    ...currentUser,
    ...newUser,
  };

  localStorage.setItem(
    "auth_user",
    JSON.stringify(
      mergedUser,
    ),
  );

  /*
  |--------------------------------------------------------------------------
  | IMPORTANT
  |--------------------------------------------------------------------------
  |
  | AdminShell écoute cet événement.
  |
  | Cela permet de changer immédiatement la photo dans la sidebar
  | sans devoir déconnecter / reconnecter.
  |
  |--------------------------------------------------------------------------
  */

  window.dispatchEvent(
    new CustomEvent(
      "admin-profile-updated",
      {
        detail:
          mergedUser,
      },
    ),
  );

  return mergedUser;
}

/*
|--------------------------------------------------------------------------
| PAGE
|--------------------------------------------------------------------------
*/

function AdminProfilePage() {
  const fileInputRef =
    useRef(null);

  const initialUser =
    getStoredUser();

  const [
    user,
    setUser,
  ] =
    useState(
      initialUser,
    );

  const [
    avatarPreview,
    setAvatarPreview,
  ] =
    useState(
      null,
    );

  const [
    selectedFile,
    setSelectedFile,
  ] =
    useState(
      null,
    );

  const [
    uploadingAvatar,
    setUploadingAvatar,
  ] =
    useState(
      false,
    );

  const [
    deletingAvatar,
    setDeletingAvatar,
  ] =
    useState(
      false,
    );

  const [
    avatarMessage,
    setAvatarMessage,
  ] =
    useState(
      "",
    );

  const [
    avatarError,
    setAvatarError,
  ] =
    useState(
      "",
    );

  /*
  |--------------------------------------------------------------------------
  | USER NAME
  |--------------------------------------------------------------------------
  */

  const fullName =
    useMemo(
      () => {
        const storedName =
          String(
            user?.fullName ||
              "",
          ).trim();

        if (
          storedName
        ) {
          return storedName;
        }

        const computedName =
          [
            user?.firstName,
            user?.lastName,
          ]
            .filter(Boolean)
            .join(" ")
            .trim();

        return (
          computedName ||
          user?.email ||
          "Administrateur"
        );
      },
      [
        user,
      ],
    );

  /*
  |--------------------------------------------------------------------------
  | INITIALS
  |--------------------------------------------------------------------------
  */

  const initials =
    useMemo(
      () => {
        const first =
          String(
            user?.firstName ||
              "",
          )
            .trim()
            .charAt(0);

        const last =
          String(
            user?.lastName ||
              "",
          )
            .trim()
            .charAt(0);

        const resolved =
          `${first}${last}`
            .trim()
            .toUpperCase();

        if (
          resolved
        ) {
          return resolved;
        }

        return String(
          user?.email ||
            "AD",
        )
          .slice(
            0,
            2,
          )
          .toUpperCase();
      },
      [
        user,
      ],
    );

  const provider =
    normalizeProvider(
      user?.authProvider,
    );

  const savedAvatar =
    resolveAvatarUrl(
      user?.avatarUrl ||
        user?.avatar_url,
    );

  const displayedAvatar =
    avatarPreview ||
    savedAvatar;

  /*
  |--------------------------------------------------------------------------
  | ACCOUNT DETAILS
  |--------------------------------------------------------------------------
  */

  const accountDetails = [
    {
      label:
        "Prénom",

      value:
        user?.firstName ||
        "—",

      icon:
        "👤",
    },

    {
      label:
        "Nom",

      value:
        user?.lastName ||
        "—",

      icon:
        "🪪",
    },

    {
      label:
        "Adresse e-mail",

      value:
        user?.email ||
        "—",

      icon:
        "✉️",

      wide:
        true,
    },

    {
      label:
        "Rôle",

      value:
        String(
          user?.role ||
            "ADMIN",
        ).toUpperCase(),

      icon:
        "👑",
    },

    {
      label:
        "Compte créé le",

      value:
        formatDate(
          user?.createdAt,
        ),

      icon:
        "📅",
    },
  ];

  /*
  |--------------------------------------------------------------------------
  | RESPONSIBILITIES
  |--------------------------------------------------------------------------
  */

  const responsibilities = [
    {
      icon:
        "🧾",

      title:
        "Superviser les factures",

      description:
        "Suivre leur progression depuis l’import jusqu’à la validation, la signature et la soumission finale.",

      to:
        "/admin/invoices",
    },

    {
      icon:
        "🏢",

      title:
        "Suivre les clients",

      description:
        "Identifier les organisations actives et comprendre leur activité sur la plateforme.",

      to:
        "/admin/clients",
    },

    {
      icon:
        "👥",

      title:
        "Contrôler les utilisateurs",

      description:
        "Consulter les comptes associés à la plateforme et leur état d’accès.",

      to:
        "/admin/users",
    },

    {
      icon:
        "⚠️",

      title:
        "Surveiller les anomalies",

      description:
        "Repérer rapidement les factures bloquées, rejetées ou nécessitant une intervention.",

      to:
        "/admin/errors",
    },

    {
      icon:
        "⚙️",

      title:
        "Superviser le système",

      description:
        "Consulter les informations techniques et l’état général des services de la plateforme.",

      to:
        "/admin/system",
    },
  ];

  /*
  |--------------------------------------------------------------------------
  | SELECT AVATAR
  |--------------------------------------------------------------------------
  */

  function handleChooseAvatar() {
    setAvatarError(
      "",
    );

    setAvatarMessage(
      "",
    );

    fileInputRef.current?.click();
  }

  function handleAvatarSelected(
    event,
  ) {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    setAvatarError(
      "",
    );

    setAvatarMessage(
      "",
    );

    /*
    |--------------------------------------------------------------------------
    | TYPE
    |--------------------------------------------------------------------------
    */

    const allowedTypes =
      new Set([
        "image/jpeg",
        "image/png",
        "image/webp",
      ]);

    if (
      !allowedTypes.has(
        file.type,
      )
    ) {
      setAvatarError(
        "Formats acceptés : JPG, PNG ou WEBP.",
      );

      event.target.value =
        "";

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | SIZE
    |--------------------------------------------------------------------------
    */

    const maxSize =
      5 *
      1024 *
      1024;

    if (
      file.size >
      maxSize
    ) {
      setAvatarError(
        "La photo ne doit pas dépasser 5 Mo.",
      );

      event.target.value =
        "";

      return;
    }

    if (
      avatarPreview
    ) {
      URL.revokeObjectURL(
        avatarPreview,
      );
    }

    const preview =
      URL.createObjectURL(
        file,
      );

    setSelectedFile(
      file,
    );

    setAvatarPreview(
      preview,
    );
  }

  /*
  |--------------------------------------------------------------------------
  | CANCEL PREVIEW
  |--------------------------------------------------------------------------
  */

  function handleCancelAvatar() {
    if (
      avatarPreview
    ) {
      URL.revokeObjectURL(
        avatarPreview,
      );
    }

    setSelectedFile(
      null,
    );

    setAvatarPreview(
      null,
    );

    setAvatarError(
      "",
    );

    setAvatarMessage(
      "",
    );

    if (
      fileInputRef.current
    ) {
      fileInputRef.current.value =
        "";
    }
  }

  /*
  |--------------------------------------------------------------------------
  | UPLOAD AVATAR
  |--------------------------------------------------------------------------
  */

  async function handleUploadAvatar() {
    if (
      !selectedFile
    ) {
      return;
    }

    const token =
      getAccessToken();

    if (!token) {
      setAvatarError(
        "Session administrateur introuvable.",
      );

      return;
    }

    setUploadingAvatar(
      true,
    );

    setAvatarError(
      "",
    );

    setAvatarMessage(
      "",
    );

    try {
      const formData =
        new FormData();

      formData.append(
        "avatar",
        selectedFile,
      );

      /*
      |--------------------------------------------------------------------------
      | IMPORTANT
      |--------------------------------------------------------------------------
      |
      | Ne pas mettre Content-Type manuellement.
      |
      | Le navigateur ajoute automatiquement :
      | multipart/form-data + boundary.
      |
      |--------------------------------------------------------------------------
      */

      const response =
        await fetch(
          `${API_BASE_URL}/api/profile/avatar`,
          {
            method:
              "POST",

            headers: {
              Authorization:
                `Bearer ${token}`,

              Accept:
                "application/json",
            },

            body:
              formData,
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
            "Impossible de modifier la photo de profil.",
        );
      }

      /*
      |--------------------------------------------------------------------------
      | SUPPORT DIFFERENT BACKEND RESPONSE SHAPES
      |--------------------------------------------------------------------------
      */

      const returnedUser =
        data?.user ||
        data?.profile ||
        {};

      const avatarUrl =
        returnedUser.avatarUrl ||
        returnedUser.avatar_url ||
        data?.avatarUrl ||
        data?.avatar_url ||
        null;

      const mergedUser =
        updateStoredUser({
          ...returnedUser,

          ...(avatarUrl
            ? {
                avatarUrl,
                avatar_url:
                  avatarUrl,
              }
            : {}),
        });

      if (
        mergedUser
      ) {
        setUser(
          mergedUser,
        );
      }

      setSelectedFile(
        null,
      );

      if (
        avatarPreview
      ) {
        URL.revokeObjectURL(
          avatarPreview,
        );
      }

      setAvatarPreview(
        null,
      );

      if (
        fileInputRef.current
      ) {
        fileInputRef.current.value =
          "";
      }

      setAvatarMessage(
        "Photo de profil mise à jour.",
      );
    } catch (
      error
    ) {
      console.error(
        "Avatar upload error:",
        error,
      );

      setAvatarError(
        error?.message ||
          "Impossible de modifier la photo.",
      );
    } finally {
      setUploadingAvatar(
        false,
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | DELETE AVATAR
  |--------------------------------------------------------------------------
  */

  async function handleDeleteAvatar() {
    if (
      !savedAvatar &&
      !avatarPreview
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        "Supprimer votre photo de profil ?",
      );

    if (
      !confirmed
    ) {
      return;
    }

    const token =
      getAccessToken();

    if (!token) {
      setAvatarError(
        "Session administrateur introuvable.",
      );

      return;
    }

    setDeletingAvatar(
      true,
    );

    setAvatarError(
      "",
    );

    setAvatarMessage(
      "",
    );

    try {
      /*
      |--------------------------------------------------------------------------
      | PREVIEW ONLY
      |--------------------------------------------------------------------------
      */

      if (
        avatarPreview &&
        !savedAvatar
      ) {
        handleCancelAvatar();

        return;
      }

      const response =
        await fetch(
          `${API_BASE_URL}/api/profile/avatar`,
          {
            method:
              "DELETE",

            headers: {
              Authorization:
                `Bearer ${token}`,

              Accept:
                "application/json",
            },
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
            "Impossible de supprimer la photo.",
        );
      }

      if (
        avatarPreview
      ) {
        URL.revokeObjectURL(
          avatarPreview,
        );
      }

      const mergedUser =
        updateStoredUser({
          avatarUrl:
            null,

          avatar_url:
            null,
        });

      if (
        mergedUser
      ) {
        setUser(
          mergedUser,
        );
      }

      setAvatarPreview(
        null,
      );

      setSelectedFile(
        null,
      );

      if (
        fileInputRef.current
      ) {
        fileInputRef.current.value =
          "";
      }

      setAvatarMessage(
        "Photo de profil supprimée.",
      );
    } catch (
      error
    ) {
      console.error(
        "Avatar delete error:",
        error,
      );

      setAvatarError(
        error?.message ||
          "Impossible de supprimer la photo.",
      );
    } finally {
      setDeletingAvatar(
        false,
      );
    }
  }

  return (
    <AdminShell
      eyebrow="Identité administrateur"
      title="Mon profil"
    >
      <section className="admin-profile-page">
        {/*
        |--------------------------------------------------------------------------
        | HERO
        |--------------------------------------------------------------------------
        */}

        <article className="admin-profile-hero">
          <div
            className="admin-profile-hero__visual"
            aria-hidden="true"
          >
            <span className="admin-profile-hero__grid" />

            <span className="admin-profile-hero__orb admin-profile-hero__orb--one" />

            <span className="admin-profile-hero__orb admin-profile-hero__orb--two" />

            <span className="admin-profile-hero__orb admin-profile-hero__orb--three" />
          </div>

          <div className="admin-profile-hero__content">
            {/*
            |--------------------------------------------------------------------------
            | AVATAR
            |--------------------------------------------------------------------------
            */}

            <div className="admin-profile-avatar-zone">
              <div className="admin-profile-hero__avatar">
                {displayedAvatar ? (
                  <img
                    src={
                      displayedAvatar
                    }
                    alt={
                      fullName
                    }
                  />
                ) : (
                  <span>
                    {
                      initials
                    }
                  </span>
                )}

                <span
                  className="admin-profile-hero__online"
                  title="Compte actif"
                />
              </div>

              <button
                type="button"
                className="admin-profile-avatar-edit"
                onClick={
                  handleChooseAvatar
                }
                title="Modifier la photo"
              >
                📷
              </button>

              <input
                ref={
                  fileInputRef
                }
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="admin-profile-avatar-input"
                onChange={
                  handleAvatarSelected
                }
              />
            </div>

            {/*
            |--------------------------------------------------------------------------
            | IDENTITY
            |--------------------------------------------------------------------------
            */}

            <div className="admin-profile-hero__identity">
              <div className="admin-profile-hero__badges">
                <span className="admin-profile-badge admin-profile-badge--admin">
                  👑 Administrateur
                </span>

                <span className="admin-profile-badge admin-profile-badge--active">
                  ● Compte actif
                </span>
              </div>

              <h2>
                {
                  fullName
                }
              </h2>

              <p>
                {user?.email ||
                  "Adresse e-mail indisponible"}
              </p>

              <div className="admin-profile-hero__meta">
                <span>
                  {
                    provider.icon
                  }{" "}
                  {
                    provider.label
                  }
                </span>

                <span>
                  🛡️ Accès administrateur
                </span>

                <span>
                  🏢 InvoiceFlow
                </span>
              </div>

              {/*
              |--------------------------------------------------------------------------
              | AVATAR CONTROLS
              |--------------------------------------------------------------------------
              */}

              <div className="admin-profile-avatar-actions">
                <button
                  type="button"
                  className="admin-profile-avatar-button admin-profile-avatar-button--primary"
                  onClick={
                    handleChooseAvatar
                  }
                  disabled={
                    uploadingAvatar ||
                    deletingAvatar
                  }
                >
                  📷 Choisir une photo
                </button>

                {selectedFile && (
                  <>
                    <button
                      type="button"
                      className="admin-profile-avatar-button admin-profile-avatar-button--save"
                      onClick={
                        handleUploadAvatar
                      }
                      disabled={
                        uploadingAvatar
                      }
                    >
                      {uploadingAvatar
                        ? "Enregistrement..."
                        : "✓ Enregistrer"}
                    </button>

                    <button
                      type="button"
                      className="admin-profile-avatar-button"
                      onClick={
                        handleCancelAvatar
                      }
                      disabled={
                        uploadingAvatar
                      }
                    >
                      Annuler
                    </button>
                  </>
                )}

                {(savedAvatar ||
                  avatarPreview) && (
                  <button
                    type="button"
                    className="admin-profile-avatar-button admin-profile-avatar-button--danger"
                    onClick={
                      handleDeleteAvatar
                    }
                    disabled={
                      deletingAvatar ||
                      uploadingAvatar
                    }
                  >
                    {deletingAvatar
                      ? "Suppression..."
                      : "🗑 Supprimer"}
                  </button>
                )}
              </div>

              {selectedFile && (
                <div className="admin-profile-avatar-file">
                  <span>
                    Nouvelle photo
                  </span>

                  <strong>
                    {
                      selectedFile.name
                    }
                  </strong>
                </div>
              )}

              {avatarMessage && (
                <div className="admin-profile-avatar-message admin-profile-avatar-message--success">
                  ✓ {
                    avatarMessage
                  }
                </div>
              )}

              {avatarError && (
                <div className="admin-profile-avatar-message admin-profile-avatar-message--error">
                  ⚠ {
                    avatarError
                  }
                </div>
              )}
            </div>

            <div className="admin-profile-hero__status">
              <span className="admin-profile-hero__status-label">
                Niveau d'accès
              </span>

              <strong>
                ADMIN
              </strong>

              <small>
                Supervision globale
              </small>
            </div>
          </div>
        </article>

        {/*
        |--------------------------------------------------------------------------
        | MISSION
        |--------------------------------------------------------------------------
        */}

        <article className="admin-profile-mission">
          <div className="admin-profile-mission__icon">
            🎯
          </div>

          <div className="admin-profile-mission__content">
            <span>
              Votre mission
            </span>

            <h3>
              Garder le contrôle sur le cycle de vie des factures.
            </h3>

            <p>
              Votre rôle administrateur consiste à suivre l’activité globale,
              détecter les anomalies et superviser les étapes critiques du
              traitement des factures.
            </p>
          </div>

          <Link
            to="/admin/dashboard"
            className="admin-profile-mission__link"
          >
            Tableau de bord
            <span>
              →
            </span>
          </Link>
        </article>

        {/*
        |--------------------------------------------------------------------------
        | GRID
        |--------------------------------------------------------------------------
        */}

        <div className="admin-profile-grid">
          <article className="admin-profile-card">
            <header className="admin-profile-card__header">
              <div className="admin-profile-card__header-icon">
                🪪
              </div>

              <div>
                <span>
                  Compte
                </span>

                <h3>
                  Informations personnelles
                </h3>
              </div>
            </header>

            <div className="admin-profile-information">
              {accountDetails.map(
                (
                  item,
                ) => (
                  <div
                    key={
                      item.label
                    }
                    className={`admin-profile-information__item${
                      item.wide
                        ? " admin-profile-information__item--wide"
                        : ""
                    }`}
                  >
                    <span className="admin-profile-information__icon">
                      {
                        item.icon
                      }
                    </span>

                    <div>
                      <small>
                        {
                          item.label
                        }
                      </small>

                      <strong>
                        {
                          item.value
                        }
                      </strong>
                    </div>
                  </div>
                ),
              )}
            </div>
          </article>

          <article className="admin-profile-card">
            <header className="admin-profile-card__header">
              <div className="admin-profile-card__header-icon">
                🔐
              </div>

              <div>
                <span>
                  Protection
                </span>

                <h3>
                  Sécurité du compte
                </h3>
              </div>
            </header>

            <div className="admin-profile-security">
              <div className="admin-profile-security__item">
                <span className="admin-profile-security__icon">
                  {
                    provider.icon
                  }
                </span>

                <div>
                  <small>
                    Connexion
                  </small>

                  <strong>
                    {
                      provider.label
                    }
                  </strong>
                </div>

                <span className="admin-profile-security__state">
                  Actif
                </span>
              </div>

              <div className="admin-profile-security__item">
                <span className="admin-profile-security__icon">
                  🎫
                </span>

                <div>
                  <small>
                    Session
                  </small>

                  <strong>
                    Authentifiée
                  </strong>
                </div>

                <span className="admin-profile-security__state">
                  Protégée
                </span>
              </div>

              <div className="admin-profile-security__item">
                <span className="admin-profile-security__icon">
                  👑
                </span>

                <div>
                  <small>
                    Autorisation
                  </small>

                  <strong>
                    Administrateur
                  </strong>
                </div>

                <span className="admin-profile-security__state">
                  ADMIN
                </span>
              </div>
            </div>
          </article>
        </div>

        {/*
        |--------------------------------------------------------------------------
        | RESPONSIBILITIES
        |--------------------------------------------------------------------------
        */}

        <article className="admin-profile-responsibilities">
          <header className="admin-profile-section-header">
            <div>
              <span>
                Centre de contrôle
              </span>

              <h3>
                Vos responsabilités
              </h3>

              <p>
                Accédez directement aux principales zones de supervision.
              </p>
            </div>
          </header>

          <div className="admin-profile-responsibilities__grid">
            {responsibilities.map(
              (
                item,
                index,
              ) => (
                <Link
                  key={
                    item.title
                  }
                  to={
                    item.to
                  }
                  className="admin-profile-responsibility"
                >
                  <div className="admin-profile-responsibility__top">
                    <span className="admin-profile-responsibility__number">
                      {String(
                        index +
                          1,
                      ).padStart(
                        2,
                        "0",
                      )}
                    </span>

                    <span className="admin-profile-responsibility__icon">
                      {
                        item.icon
                      }
                    </span>
                  </div>

                  <strong>
                    {
                      item.title
                    }
                  </strong>

                  <p>
                    {
                      item.description
                    }
                  </p>

                  <span className="admin-profile-responsibility__link">
                    Ouvrir
                    <span>
                      →
                    </span>
                  </span>
                </Link>
              ),
            )}
          </div>
        </article>
      </section>
    </AdminShell>
  );
}

export default AdminProfilePage;