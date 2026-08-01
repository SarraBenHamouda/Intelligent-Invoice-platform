const crypto = require('node:crypto');

const axios = require('axios');
const jwt = require('jsonwebtoken');

const {
  findUserByEmail,
  findUserByProvider,
  linkProviderToUser,
  updateOAuthAvatar,
  createOAuthUser,
} = require('../repositories/user.repository');

const GITHUB_AUTHORIZE_URL =
  'https://github.com/login/oauth/authorize';

const GITHUB_TOKEN_URL =
  'https://github.com/login/oauth/access_token';

const GITHUB_API_URL =
  'https://api.github.com';

const GITHUB_STATE_TTL =
  10 * 60 * 1000;

const githubStates = new Map();

/**
 * Lit une variable d'environnement obligatoire.
 *
 * @param {string} name
 * @returns {string}
 */
function getRequiredEnvironmentVariable(
  name,
) {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `Variable d'environnement manquante : ${name}`,
    );
  }

  return value;
}

/**
 * Retourne une forme publique de l'utilisateur.
 *
 * @param {object} user
 */
function formatUser(user) {
  return {
    id: user.id,

    organizationId:
      user.organization_id || null,

    firstName:
      user.first_name || '',

    lastName:
      user.last_name || '',

    fullName: [
      user.first_name,
      user.last_name,
    ]
      .filter(Boolean)
      .join(' '),

    email: user.email,

    role: user.role,

    isActive:
      Boolean(user.is_active),

    authProvider:
      user.auth_provider || null,

    avatarUrl:
      user.avatar_url || null,

    createdAt:
      user.created_at || null,
  };
}

/**
 * Génère le JWT utilisé par l'application.
 *
 * @param {object} user
 * @returns {string}
 */
function createAccessToken(user) {
  const jwtSecret =
    getRequiredEnvironmentVariable(
      'JWT_SECRET',
    );

  return jwt.sign(
    {
      sub: String(user.id),

      email:
        user.email,

      role:
        user.role,

      organizationId:
        user.organization_id || null,

      tokenType:
        'access',
    },
    jwtSecret,
    {
      expiresIn:
        process.env.JWT_EXPIRES_IN ||
        '8h',

      issuer:
        'intelligent-invoice-platform',

      audience:
        'invoice-portal-web',
    },
  );
}

/**
 * Supprime les états OAuth expirés.
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
      githubStates.delete(state);
    }
  }
}

/**
 * Crée l'URL GitHub d'autorisation.
 *
 * @param {object} options
 * @returns {string}
 */
function createGitHubAuthorizationUrl({
  mode = 'login',
} = {}) {
  cleanupExpiredGitHubStates();

  const state = crypto
    .randomBytes(32)
    .toString('hex');

  githubStates.set(state, {
    mode:
      mode === 'register'
        ? 'register'
        : 'login',

    createdAt:
      Date.now(),
  });

  const clientId =
    getRequiredEnvironmentVariable(
      'GITHUB_CLIENT_ID',
    );

  const callbackUrl =
    getRequiredEnvironmentVariable(
      'GITHUB_CALLBACK_URL',
    );

  const authorizationUrl =
    new URL(
      GITHUB_AUTHORIZE_URL,
    );

  authorizationUrl.searchParams.set(
    'client_id',
    clientId,
  );

  authorizationUrl.searchParams.set(
    'redirect_uri',
    callbackUrl,
  );

  authorizationUrl.searchParams.set(
    'scope',
    'read:user user:email',
  );

  authorizationUrl.searchParams.set(
    'state',
    state,
  );

  return authorizationUrl.toString();
}

/**
 * Valide puis consomme l'état OAuth.
 *
 * @param {string} state
 */
function consumeGitHubState(state) {
  const storedState =
    githubStates.get(state);

  if (!storedState) {
    throw new Error(
      'La session GitHub est invalide ou a expiré.',
    );
  }

  githubStates.delete(state);

  const expired =
    Date.now() -
      storedState.createdAt >
    GITHUB_STATE_TTL;

  if (expired) {
    throw new Error(
      'La session GitHub a expiré.',
    );
  }

  return storedState;
}

/**
 * Échange le code temporaire contre un jeton GitHub.
 *
 * @param {string} code
 * @returns {Promise<string>}
 */
async function exchangeGitHubCode(code) {
  const clientId =
    getRequiredEnvironmentVariable(
      'GITHUB_CLIENT_ID',
    );

  const clientSecret =
    getRequiredEnvironmentVariable(
      'GITHUB_CLIENT_SECRET',
    );

  const callbackUrl =
    getRequiredEnvironmentVariable(
      'GITHUB_CALLBACK_URL',
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
            'application/json',
        },

        timeout:
          15000,
      },
    );

  if (
    !response.data?.access_token
  ) {
    throw new Error(
      response.data
        ?.error_description ||
        'GitHub n’a pas retourné de jeton.',
    );
  }

  return response.data.access_token;
}

/**
 * Récupère le profil et l'e-mail vérifié GitHub.
 *
 * @param {string} accessToken
 */
async function fetchGitHubProfile(
  accessToken,
) {
  const headers = {
    Authorization:
      `Bearer ${accessToken}`,

    Accept:
      'application/vnd.github+json',

    'X-GitHub-Api-Version':
      '2022-11-28',

    'User-Agent':
      'intelligent-invoice-platform',
  };

  const [
    profileResponse,
    emailsResponse,
  ] = await Promise.all([
    axios.get(
      `${GITHUB_API_URL}/user`,
      {
        headers,
        timeout: 15000,
      },
    ),

    axios.get(
      `${GITHUB_API_URL}/user/emails`,
      {
        headers,
        timeout: 15000,
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

  const verifiedEmail =
    emails.find(
      (email) =>
        email.primary &&
        email.verified,
    ) ||
    emails.find(
      (email) =>
        email.verified,
    );

  const resolvedEmail =
    verifiedEmail?.email ||
    profile.email;

  if (!resolvedEmail) {
    throw new Error(
      'Aucune adresse e-mail GitHub vérifiée n’a été trouvée.',
    );
  }

  const nameParts =
    String(
      profile.name ||
        profile.login ||
        'GitHub User',
    )
      .trim()
      .split(/\s+/);

  return {
    provider:
      'github',

    providerId:
      String(profile.id),

    email:
      String(resolvedEmail)
        .trim()
        .toLowerCase(),

    firstName:
      nameParts[0] ||
      profile.login ||
      'GitHub',

    lastName:
      nameParts
        .slice(1)
        .join(' ') ||
      'User',

    username:
      profile.login,

    avatarUrl:
      profile.avatar_url || null,
  };
}

/**
 * Recherche ou crée l'utilisateur GitHub.
 *
 * @param {object} githubProfile
 */
async function findOrCreateGitHubUser(
  githubProfile,
) {
  let user =
    await findUserByProvider({
      provider:
        'github',

      providerId:
        githubProfile.providerId,
    });

  if (user) {
    if (!user.is_active) {
      throw new Error(
        'Ce compte utilisateur est désactivé.',
      );
    }

    if (
      githubProfile.avatarUrl !==
      user.avatar_url
    ) {
      await updateOAuthAvatar({
        userId:
          user.id,

        avatarUrl:
          githubProfile.avatarUrl,
      });

      user = {
        ...user,
        avatar_url:
          githubProfile.avatarUrl,
      };
    }

    return {
      user,
      organization: null,
      isNewUser: false,
    };
  }

  user =
    await findUserByEmail(
      githubProfile.email,
    );

  if (user) {
    if (!user.is_active) {
      throw new Error(
        'Ce compte utilisateur est désactivé.',
      );
    }

    /*
     * Un utilisateur existant avec le même e-mail
     * est associé à son compte GitHub.
     */
    await linkProviderToUser({
      userId:
        user.id,

      provider:
        'github',

      providerId:
        githubProfile.providerId,

      avatarUrl:
        githubProfile.avatarUrl,
    });

    const linkedUser = {
      ...user,

      auth_provider:
        'github',

      provider_id:
        githubProfile.providerId,

      avatar_url:
        githubProfile.avatarUrl,
    };

    return {
      user: linkedUser,
      organization: null,
      isNewUser: false,
    };
  }

  const created =
    await createOAuthUser({
      email:
        githubProfile.email,

      firstName:
        githubProfile.firstName,

      lastName:
        githubProfile.lastName,

      provider:
        'github',

      providerId:
        githubProfile.providerId,

      avatarUrl:
        githubProfile.avatarUrl,

      organizationName:
        githubProfile.username
          ? `${githubProfile.username} Organization`
          : 'GitHub Organization',

      /*
       * GitHub ne fournit pas le pays ISO de manière fiable.
       * La valeur peut ensuite être complétée dans le profil.
       */
      countryCode:
        'TN',
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

/**
 * Termine l'authentification GitHub.
 *
 * @param {object} params
 */
async function authenticateWithGitHub({
  code,
  state,
}) {
  const stateData =
    consumeGitHubState(state);

  const githubAccessToken =
    await exchangeGitHubCode(code);

  const githubProfile =
    await fetchGitHubProfile(
      githubAccessToken,
    );

  const result =
    await findOrCreateGitHubUser(
      githubProfile,
    );

  const accessToken =
    createAccessToken(
      result.user,
    );

  return {
    success: true,

    accessToken,

    expiresIn:
      process.env.JWT_EXPIRES_IN ||
      '8h',

    user:
      formatUser(result.user),

    isNewUser:
      result.isNewUser,

    mode:
      stateData.mode,

    organization:
      result.organization
        ? {
            id:
              result.organization.id,

            name:
              result.organization.name,

            taxIdentifier:
              result.organization
                .tax_identifier || null,

            countryCode:
              result.organization
                .country_code,

            isActive:
              Boolean(
                result.organization
                  .is_active,
              ),
          }
        : null,
  };
}

module.exports = {
  formatUser,
  createAccessToken,
  createGitHubAuthorizationUrl,
  authenticateWithGitHub,
};