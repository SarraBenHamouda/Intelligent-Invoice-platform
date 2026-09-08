const crypto =
  require("node:crypto");

const axios =
  require("axios");

const jwt =
  require("jsonwebtoken");

const {
  findUserByEmail,
  findUserByProvider,
  linkProviderToUser,
  updateOAuthAvatar,
  createOAuthUser,
} =
  require(
    "../repositories/user.repository",
  );

/*
|--------------------------------------------------------------------------
| GITHUB CONFIGURATION
|--------------------------------------------------------------------------
*/

const GITHUB_AUTHORIZE_URL =
  "https://github.com/login/oauth/authorize";

const GITHUB_TOKEN_URL =
  "https://github.com/login/oauth/access_token";

const GITHUB_API_URL =
  "https://api.github.com";

const GITHUB_STATE_TTL =
  10 * 60 * 1000;

/*
|--------------------------------------------------------------------------
| TEMPORARY OAUTH STATES
|--------------------------------------------------------------------------
|
| En développement cette Map est suffisante.
|
| Pour une architecture multi-instance en production,
| il faudrait plutôt Redis / database.
|
|--------------------------------------------------------------------------
*/

const githubStates =
  new Map();

/*
|--------------------------------------------------------------------------
| REQUIRED ENV
|--------------------------------------------------------------------------
*/

function getRequiredEnvironmentVariable(
  name,
) {
  const value =
    process.env[name];

  if (!value) {
    throw new Error(
      `Variable d'environnement manquante : ${name}`,
    );
  }

  return value;
}

/*
|--------------------------------------------------------------------------
| NORMALIZE MODE
|--------------------------------------------------------------------------
*/

function normalizeMode(
  mode,
) {
  return mode ===
    "register"
    ? "register"
    : "login";
}

/*
|--------------------------------------------------------------------------
| FORMAT USER
|--------------------------------------------------------------------------
*/

function formatUser(
  user,
) {
  return {
    id:
      user.id,

    organizationId:
      user.organization_id ||
      null,

    firstName:
      user.first_name ||
      "",

    lastName:
      user.last_name ||
      "",

    fullName: [
      user.first_name,
      user.last_name,
    ]
      .filter(Boolean)
      .join(" "),

    email:
      user.email,

    phone:
      user.phone ||
      "",

    city:
      user.city ||
      "",

    countryCode:
      user.country_code ||
      null,

    role:
      user.role,

    isActive:
      Boolean(
        user.is_active,
      ),

    authProvider:
      user.auth_provider ||
      null,

    avatarUrl:
      user.avatar_url ||
      null,

    createdAt:
      user.created_at ||
      null,

    updatedAt:
      user.updated_at ||
      null,
  };
}

/*
|--------------------------------------------------------------------------
| ACCESS TOKEN
|--------------------------------------------------------------------------
*/

function createAccessToken(
  user,
) {
  const jwtSecret =
    getRequiredEnvironmentVariable(
      "JWT_SECRET",
    );

  return jwt.sign(
    {
      sub:
        String(
          user.id,
        ),

      email:
        user.email,

      role:
        user.role,

      organizationId:
        user.organization_id ||
        null,

      tokenType:
        "access",
    },

    jwtSecret,

    {
      expiresIn:
        process.env
          .JWT_EXPIRES_IN ||
        "8h",

      issuer:
        "intelligent-invoice-platform",

      audience:
        "invoice-portal-web",
    },
  );
}

/*
|--------------------------------------------------------------------------
| CLEAN EXPIRED STATES
|--------------------------------------------------------------------------
*/

function cleanupExpiredGitHubStates() {
  const currentTime =
    Date.now();

  for (
    const [
      state,
      stateData,
    ] of githubStates
  ) {
    if (
      currentTime -
        stateData.createdAt >
      GITHUB_STATE_TTL
    ) {
      githubStates.delete(
        state,
      );
    }
  }
}

/*
|--------------------------------------------------------------------------
| CREATE GITHUB AUTHORIZATION URL
|--------------------------------------------------------------------------
*/

function createGitHubAuthorizationUrl({
  mode = "login",
} = {}) {
  cleanupExpiredGitHubStates();

  const normalizedMode =
    normalizeMode(
      mode,
    );

  const state =
    crypto
      .randomBytes(
        32,
      )
      .toString(
        "hex",
      );

  githubStates.set(
    state,
    {
      mode:
        normalizedMode,

      createdAt:
        Date.now(),
    },
  );

  const clientId =
    getRequiredEnvironmentVariable(
      "GITHUB_CLIENT_ID",
    );

  const callbackUrl =
    getRequiredEnvironmentVariable(
      "GITHUB_CALLBACK_URL",
    );

  const authorizationUrl =
    new URL(
      GITHUB_AUTHORIZE_URL,
    );

  authorizationUrl.searchParams.set(
    "client_id",
    clientId,
  );

  authorizationUrl.searchParams.set(
    "redirect_uri",
    callbackUrl,
  );

  authorizationUrl.searchParams.set(
    "scope",
    "read:user user:email",
  );

  authorizationUrl.searchParams.set(
    "state",
    state,
  );

  return authorizationUrl.toString();
}

/*
|--------------------------------------------------------------------------
| CONSUME GITHUB STATE
|--------------------------------------------------------------------------
*/

function consumeGitHubState(
  state,
) {
  const storedState =
    githubStates.get(
      state,
    );

  if (!storedState) {
    throw new Error(
      "La session GitHub est invalide ou a expiré.",
    );
  }

  githubStates.delete(
    state,
  );

  const expired =
    Date.now() -
      storedState.createdAt >
    GITHUB_STATE_TTL;

  if (expired) {
    throw new Error(
      "La session GitHub a expiré.",
    );
  }

  return {
    ...storedState,

    mode:
      normalizeMode(
        storedState.mode,
      ),
  };
}

/*
|--------------------------------------------------------------------------
| EXCHANGE GITHUB CODE
|--------------------------------------------------------------------------
*/

async function exchangeGitHubCode(
  code,
) {
  const clientId =
    getRequiredEnvironmentVariable(
      "GITHUB_CLIENT_ID",
    );

  const clientSecret =
    getRequiredEnvironmentVariable(
      "GITHUB_CLIENT_SECRET",
    );

  const callbackUrl =
    getRequiredEnvironmentVariable(
      "GITHUB_CALLBACK_URL",
    );

  const response =
    await axios.post(
      GITHUB_TOKEN_URL,

      {
        client_id:
          clientId,

        client_secret:
          clientSecret,

        code,

        redirect_uri:
          callbackUrl,
      },

      {
        headers: {
          Accept:
            "application/json",
        },

        timeout:
          15000,
      },
    );

  if (
    !response.data
      ?.access_token
  ) {
    throw new Error(
      response.data
        ?.error_description ||
      "GitHub n’a pas retourné de jeton.",
    );
  }

  return response.data
    .access_token;
}

/*
|--------------------------------------------------------------------------
| FETCH GITHUB PROFILE
|--------------------------------------------------------------------------
*/

async function fetchGitHubProfile(
  accessToken,
) {
  const headers = {
    Authorization:
      `Bearer ${accessToken}`,

    Accept:
      "application/vnd.github+json",

    "X-GitHub-Api-Version":
      "2022-11-28",

    "User-Agent":
      "intelligent-invoice-platform",
  };

  const [
    profileResponse,
    emailsResponse,
  ] =
    await Promise.all([
      axios.get(
        `${GITHUB_API_URL}/user`,

        {
          headers,
          timeout:
            15000,
        },
      ),

      axios.get(
        `${GITHUB_API_URL}/user/emails`,

        {
          headers,
          timeout:
            15000,
        },
      ),
    ]);

  const profile =
    profileResponse.data;

  const emails =
    Array.isArray(
      emailsResponse.data,
    )
      ? emailsResponse.data
      : [];

  /*
  |--------------------------------------------------------------------------
  | VERIFIED EMAIL
  |--------------------------------------------------------------------------
  */

  const verifiedEmail =
    emails.find(
      (
        email,
      ) =>
        email.primary &&
        email.verified,
    ) ||
    emails.find(
      (
        email,
      ) =>
        email.verified,
    );

  const resolvedEmail =
    verifiedEmail?.email ||
    profile.email;

  if (!resolvedEmail) {
    throw new Error(
      "Aucune adresse e-mail GitHub vérifiée n’a été trouvée.",
    );
  }

  /*
  |--------------------------------------------------------------------------
  | NAME
  |--------------------------------------------------------------------------
  */

  const nameParts =
    String(
      profile.name ||
      profile.login ||
      "GitHub User",
    )
      .trim()
      .split(
        /\s+/,
      );

  return {
    provider:
      "github",

    providerId:
      String(
        profile.id,
      ),

    email:
      String(
        resolvedEmail,
      )
        .trim()
        .toLowerCase(),

    firstName:
      nameParts[0] ||
      profile.login ||
      "GitHub",

    lastName:
      nameParts
        .slice(
          1,
        )
        .join(
          " ",
        ) ||
      "User",

    username:
      profile.login,

    avatarUrl:
      profile.avatar_url ||
      null,
  };
}

/*
|--------------------------------------------------------------------------
| REFRESH AVATAR
|--------------------------------------------------------------------------
*/

async function refreshGitHubAvatar(
  user,
  githubProfile,
) {
  if (
    githubProfile.avatarUrl ===
    user.avatar_url
  ) {
    return user;
  }

  await updateOAuthAvatar({
    userId:
      user.id,

    avatarUrl:
      githubProfile.avatarUrl,
  });

  return {
    ...user,

    avatar_url:
      githubProfile.avatarUrl,
  };
}

/*
|--------------------------------------------------------------------------
| LOGIN WITH GITHUB
|--------------------------------------------------------------------------
|
| IMPORTANT :
|
| En mode LOGIN nous ne créons JAMAIS un nouveau compte.
|
|--------------------------------------------------------------------------
*/

async function loginExistingGitHubUser(
  githubProfile,
) {
  /*
  |--------------------------------------------------------------------------
  | 1. FIND BY PROVIDER
  |--------------------------------------------------------------------------
  */

  let user =
    await findUserByProvider({
      provider:
        "github",

      providerId:
        githubProfile.providerId,
    });

  if (user) {
    if (
      !user.is_active
    ) {
      throw new Error(
        "Ce compte utilisateur est désactivé.",
      );
    }

    user =
      await refreshGitHubAvatar(
        user,
        githubProfile,
      );

    return {
      user,

      organization:
        null,

      isNewUser:
        false,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | 2. FIND BY VERIFIED EMAIL
  |--------------------------------------------------------------------------
  */

  user =
    await findUserByEmail(
      githubProfile.email,
    );

  /*
  |--------------------------------------------------------------------------
  | ACCOUNT DOES NOT EXIST
  |--------------------------------------------------------------------------
  */

  if (!user) {
    const error =
      new Error(
        "Aucun compte n’est associé à cette adresse GitHub. Créez d’abord votre compte.",
      );

    error.code =
      "GITHUB_ACCOUNT_NOT_REGISTERED";

    throw error;
  }

  /*
  |--------------------------------------------------------------------------
  | DISABLED
  |--------------------------------------------------------------------------
  */

  if (
    !user.is_active
  ) {
    throw new Error(
      "Ce compte utilisateur est désactivé.",
    );
  }

  /*
  |--------------------------------------------------------------------------
  | EMAIL EXISTS: LINK GITHUB
  |--------------------------------------------------------------------------
  |
  | L'adresse GitHub a été vérifiée par GitHub.
  |
  |--------------------------------------------------------------------------
  */

  await linkProviderToUser({
    userId:
      user.id,

    provider:
      "github",

    providerId:
      githubProfile.providerId,

    avatarUrl:
      githubProfile.avatarUrl,
  });

  const linkedUser = {
    ...user,

    auth_provider:
      "github",

    provider_id:
      githubProfile.providerId,

    avatar_url:
      githubProfile.avatarUrl,
  };

  return {
    user:
      linkedUser,

    organization:
      null,

    isNewUser:
      false,
  };
}

/*
|--------------------------------------------------------------------------
| REGISTER WITH GITHUB
|--------------------------------------------------------------------------
|
| IMPORTANT :
|
| En mode REGISTER :
|
| compte existant -> erreur
| compte absent    -> création
|
|--------------------------------------------------------------------------
*/

async function registerGitHubUser(
  githubProfile,
) {
  /*
  |--------------------------------------------------------------------------
  | EXISTING PROVIDER
  |--------------------------------------------------------------------------
  */

  const providerUser =
    await findUserByProvider({
      provider:
        "github",

      providerId:
        githubProfile.providerId,
    });

  if (providerUser) {
    const error =
      new Error(
        "Un compte existe déjà avec ce compte GitHub. Utilisez l’onglet Connexion.",
      );

    error.code =
      "GITHUB_ACCOUNT_ALREADY_EXISTS";

    throw error;
  }

  /*
  |--------------------------------------------------------------------------
  | EXISTING EMAIL
  |--------------------------------------------------------------------------
  */

  const emailUser =
    await findUserByEmail(
      githubProfile.email,
    );

  if (emailUser) {
    const error =
      new Error(
        "Un compte existe déjà avec cette adresse e-mail. Utilisez l’onglet Connexion.",
      );

    error.code =
      "EMAIL_ALREADY_USED";

    throw error;
  }

  /*
  |--------------------------------------------------------------------------
  | CREATE USER
  |--------------------------------------------------------------------------
  */

  const defaultCountryCode =
    String(
      process.env
        .DEFAULT_COUNTRY_CODE ||
      "TN",
    )
      .trim()
      .toUpperCase();

  const created =
    await createOAuthUser({
      email:
        githubProfile.email,

      firstName:
        githubProfile.firstName,

      lastName:
        githubProfile.lastName,

      provider:
        "github",

      providerId:
        githubProfile.providerId,

      avatarUrl:
        githubProfile.avatarUrl,

      organizationName:
        githubProfile.username
          ? `${githubProfile.username} Organization`
          : "GitHub Organization",

      countryCode:
        defaultCountryCode,
    });

  return {
    user:
      created.user,

    organization:
      created.organization,

    isNewUser:
      true,
  };
}

/*
|--------------------------------------------------------------------------
| FIND / CREATE GITHUB USER
|--------------------------------------------------------------------------
|
| Cette fonction applique maintenant véritablement le mode.
|
|--------------------------------------------------------------------------
*/

async function findOrCreateGitHubUser(
  githubProfile,
  mode = "login",
) {
  const normalizedMode =
    normalizeMode(
      mode,
    );

  if (
    normalizedMode ===
    "register"
  ) {
    return registerGitHubUser(
      githubProfile,
    );
  }

  return loginExistingGitHubUser(
    githubProfile,
  );
}

/*
|--------------------------------------------------------------------------
| AUTHENTICATE WITH GITHUB
|--------------------------------------------------------------------------
*/

async function authenticateWithGitHub({
  code,
  state,
}) {
  /*
  |--------------------------------------------------------------------------
  | STATE + MODE
  |--------------------------------------------------------------------------
  */

  const stateData =
    consumeGitHubState(
      state,
    );

  const mode =
    normalizeMode(
      stateData.mode,
    );

  /*
  |--------------------------------------------------------------------------
  | TOKEN
  |--------------------------------------------------------------------------
  */

  const githubAccessToken =
    await exchangeGitHubCode(
      code,
    );

  /*
  |--------------------------------------------------------------------------
  | PROFILE
  |--------------------------------------------------------------------------
  */

  const githubProfile =
    await fetchGitHubProfile(
      githubAccessToken,
    );

  /*
  |--------------------------------------------------------------------------
  | LOGIN / REGISTER
  |--------------------------------------------------------------------------
  */

  const result =
    await findOrCreateGitHubUser(
      githubProfile,
      mode,
    );

  /*
  |--------------------------------------------------------------------------
  | JWT
  |--------------------------------------------------------------------------
  */

  const accessToken =
    createAccessToken(
      result.user,
    );

  return {
    success:
      true,

    accessToken,

    expiresIn:
      process.env
        .JWT_EXPIRES_IN ||
      "8h",

    user:
      formatUser(
        result.user,
      ),

    isNewUser:
      result.isNewUser,

    mode,

    profileCompletionRequired:
      Boolean(
        result.isNewUser,
      ),

    organization:
      result.organization
        ? {
            id:
              result
                .organization
                .id,

            name:
              result
                .organization
                .name,

            taxIdentifier:
              result
                .organization
                .tax_identifier ||
              null,

            countryCode:
              result
                .organization
                .country_code,

            isActive:
              Boolean(
                result
                  .organization
                  .is_active,
              ),
          }
        : null,
  };
}

/*
|--------------------------------------------------------------------------
| EXPORT
|--------------------------------------------------------------------------
*/

module.exports = {
  formatUser,

  createAccessToken,

  createGitHubAuthorizationUrl,

  authenticateWithGitHub,

  /*
  |--------------------------------------------------------------------------
  | Facultatif mais pratique pour tests/unit tests.
  |--------------------------------------------------------------------------
  */

  findOrCreateGitHubUser,
};