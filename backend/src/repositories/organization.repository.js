const { sql } = require('../config/database');

async function createOrganization(
  {
    name,
    taxIdentifier,
    countryCode,
  },
  transaction
) {
  const result = await transaction
    .request()
    .input(
      'name',
      sql.NVarChar(150),
      name.trim()
    )
    .input(
      'taxIdentifier',
      sql.NVarChar(100),
      taxIdentifier?.trim() || null
    )
    .input(
      'countryCode',
      sql.NVarChar(10),
      countryCode.trim().toUpperCase()
    )
    .query(`
      INSERT INTO organizations (
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
        @taxIdentifier,
        @countryCode,
        1
      )
    `);

  return result.recordset[0];
}

module.exports = {
  createOrganization,
};