const bcrypt = require('bcryptjs');

const {
  sql,
  getDatabase,
} = require('../config/database');

/**
 * Normalise une adresse e-mail.
 *
 * @param {string} email
 * @returns {string}
 */
function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

/**
 * Recherche un utilisateur par e-mail.
 *
 * @param {string} email
 * @returns {Promise<object|null>}
 */
async function findUserByEmail(email) {
  const database = getDatabase();

  const normalizedEmail =
    normalizeEmail(email);

  const result = await database
    .request()
    .input(
      'email',
      sql.NVarChar(255),
      normalizedEmail,
    )
    .query(`
      SELECT TOP (1)
        id,
        organization_id,
        first_name,
        last_name,
        email,
        password_hash,
        role,
        is_active,
        auth_provider,
        provider_id,
        avatar_url,
        created_at
      FROM dbo.users
      WHERE
        LOWER(LTRIM(RTRIM(email))) = @email
    `);

  return result.recordset[0] || null;
}

/**
 * Recherche un utilisateur par fournisseur OAuth.
 *
 * @param {object} params
 * @param {string} params.provider
 * @param {string} params.providerId
 * @returns {Promise<object|null>}
 */
async function findUserByProvider({
  provider,
  providerId,
}) {
  const database = getDatabase();

  const result = await database
    .request()
    .input(
      'provider',
      sql.NVarChar(30),
      provider,
    )
    .input(
      'providerId',
      sql.NVarChar(255),
      String(providerId),
    )
    .query(`
      SELECT TOP (1)
        id,
        organization_id,
        first_name,
        last_name,
        email,
        password_hash,
        role,
        is_active,
        auth_provider,
        provider_id,
        avatar_url,
        created_at
      FROM dbo.users
      WHERE
        auth_provider = @provider
        AND provider_id = @providerId
    `);

  return result.recordset[0] || null;
}

/**
 * Associe un compte OAuth à un utilisateur existant.
 *
 * @param {object} params
 */
async function linkProviderToUser({
  userId,
  provider,
  providerId,
  avatarUrl,
}) {
  const database = getDatabase();

  await database
    .request()
    .input(
      'userId',
      sql.UniqueIdentifier,
      userId,
    )
    .input(
      'provider',
      sql.NVarChar(30),
      provider,
    )
    .input(
      'providerId',
      sql.NVarChar(255),
      String(providerId),
    )
    .input(
      'avatarUrl',
      sql.NVarChar(1000),
      avatarUrl || null,
    )
    .query(`
      UPDATE dbo.users
      SET
        auth_provider = @provider,
        provider_id = @providerId,
        avatar_url = @avatarUrl
      WHERE id = @userId
    `);
}

/**
 * Met à jour l'avatar d'un utilisateur OAuth.
 *
 * @param {object} params
 */
async function updateOAuthAvatar({
  userId,
  avatarUrl,
}) {
  const database = getDatabase();

  await database
    .request()
    .input(
      'userId',
      sql.UniqueIdentifier,
      userId,
    )
    .input(
      'avatarUrl',
      sql.NVarChar(1000),
      avatarUrl || null,
    )
    .query(`
      UPDATE dbo.users
      SET avatar_url = @avatarUrl
      WHERE id = @userId
    `);
}

/**
 * Crée une organisation et un utilisateur OAuth.
 *
 * @param {object} params
 * @returns {Promise<{user: object, organization: object}>}
 */
async function createOAuthUser({
  email,
  firstName,
  lastName,
  provider,
  providerId,
  avatarUrl,
  organizationName,
  countryCode = 'TN',
}) {
  const database = getDatabase();

  const transaction =
    new sql.Transaction(database);

  try {
    await transaction.begin();

    const normalizedEmail =
      normalizeEmail(email);

    const normalizedCountryCode =
      String(countryCode || 'TN')
        .trim()
        .toUpperCase();

    const finalFirstName =
      String(firstName || provider)
        .trim() || provider;

    const finalLastName =
      String(lastName || 'User')
        .trim() || 'User';

    const finalOrganizationName =
      String(
        organizationName ||
          `${finalFirstName} Organization`,
      ).trim();

    const organizationResult =
      await transaction
        .request()
        .input(
          'name',
          sql.NVarChar(150),
          finalOrganizationName,
        )
        .input(
          'countryCode',
          sql.NVarChar(10),
          normalizedCountryCode,
        )
        .query(`
          INSERT INTO dbo.organizations (
            name,
            tax_identifier,
            country_code,
            is_active
          )
          OUTPUT
            INSERTED.id,
            INSERTED.name,
            INSERTED.tax_identifier,
            INSERTED.country_code,
            INSERTED.is_active,
            INSERTED.created_at
          VALUES (
            @name,
            NULL,
            @countryCode,
            1
          )
        `);

    const organization =
      organizationResult.recordset[0];

    /*
     * Le schéma actuel exige password_hash.
     * On génère donc un mot de passe aléatoire inaccessible.
     */
    const randomPasswordHash =
      await bcrypt.hash(
        [
          provider,
          providerId,
          Date.now(),
          Math.random(),
        ].join('-'),
        12,
      );

    const userResult =
      await transaction
        .request()
        .input(
          'organizationId',
          sql.UniqueIdentifier,
          organization.id,
        )
        .input(
          'firstName',
          sql.NVarChar(100),
          finalFirstName,
        )
        .input(
          'lastName',
          sql.NVarChar(100),
          finalLastName,
        )
        .input(
          'email',
          sql.NVarChar(255),
          normalizedEmail,
        )
        .input(
          'passwordHash',
          sql.NVarChar(255),
          randomPasswordHash,
        )
        .input(
          'role',
          sql.NVarChar(30),
          'CLIENT',
        )
        .input(
          'provider',
          sql.NVarChar(30),
          provider,
        )
        .input(
          'providerId',
          sql.NVarChar(255),
          String(providerId),
        )
        .input(
          'avatarUrl',
          sql.NVarChar(1000),
          avatarUrl || null,
        )
        .query(`
          INSERT INTO dbo.users (
            organization_id,
            first_name,
            last_name,
            email,
            password_hash,
            role,
            is_active,
            auth_provider,
            provider_id,
            avatar_url
          )
          OUTPUT
            INSERTED.id,
            INSERTED.organization_id,
            INSERTED.first_name,
            INSERTED.last_name,
            INSERTED.email,
            INSERTED.password_hash,
            INSERTED.role,
            INSERTED.is_active,
            INSERTED.auth_provider,
            INSERTED.provider_id,
            INSERTED.avatar_url,
            INSERTED.created_at
          VALUES (
            @organizationId,
            @firstName,
            @lastName,
            @email,
            @passwordHash,
            @role,
            1,
            @provider,
            @providerId,
            @avatarUrl
          )
        `);

    const user =
      userResult.recordset[0];

    await transaction.commit();

    return {
      user,
      organization,
    };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error(
        'OAuth transaction rollback error:',
        rollbackError,
      );
    }

    throw error;
  }
}

module.exports = {
  normalizeEmail,
  findUserByEmail,
  findUserByProvider,
  linkProviderToUser,
  updateOAuthAvatar,
  createOAuthUser,
};