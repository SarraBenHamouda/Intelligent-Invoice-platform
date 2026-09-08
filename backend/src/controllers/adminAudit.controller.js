const {
  getDatabase,
} = require("../config/database");

/*
|--------------------------------------------------------------------------
| ADMIN AUTHORIZATION
|--------------------------------------------------------------------------
*/

function getAdminUser(req) {
  const userId =
    req.user?.id ||
    req.user?.user_id ||
    req.user?.sub ||
    null;

  const role =
    String(
      req.user?.role || "",
    )
      .trim()
      .toUpperCase();

  if (!userId) {
    const error =
      new Error(
        "Utilisateur non authentifié.",
      );

    error.statusCode =
      401;

    error.errorCode =
      "AUTHENTICATION_REQUIRED";

    throw error;
  }

  if (
    role !==
    "ADMIN"
  ) {
    const error =
      new Error(
        "Accès administrateur requis.",
      );

    error.statusCode =
      403;

    error.errorCode =
      "ADMIN_ACCESS_REQUIRED";

    throw error;
  }

  return {
    userId,
    role,
  };
}

/*
|--------------------------------------------------------------------------
| NO CACHE
|--------------------------------------------------------------------------
*/

function setNoCacheHeaders(
  res,
) {
  res.set({
    "Cache-Control":
      "no-store, no-cache, must-revalidate, proxy-revalidate",

    Pragma:
      "no-cache",

    Expires:
      "0",

    "Surrogate-Control":
      "no-store",
  });
}

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function normalize(
  value,
) {
  return String(
    value || "",
  )
    .trim()
    .toUpperCase();
}

function buildUserName({
  firstName,
  lastName,
  email,
}) {
  const fullName =
    [
      firstName,
      lastName,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

  return (
    fullName ||
    email ||
    "Utilisateur"
  );
}

/*
|--------------------------------------------------------------------------
| EVENT SEVERITY
|--------------------------------------------------------------------------
*/

function getEventSeverity(
  event,
) {
  const eventType =
    normalize(
      event?.event_type,
    );

  const invoiceStatus =
    normalize(
      event?.invoice_status,
    );

  if (
    eventType ===
      "INVOICE_ERROR" ||
    eventType ===
      "INVOICE_REJECTED" ||
    invoiceStatus ===
      "ERROR" ||
    invoiceStatus ===
      "REJECTED"
  ) {
    return "HIGH";
  }

  if (
    eventType ===
      "INVOICE_REVIEW_REQUIRED" ||
    eventType ===
      "INVOICE_RETRY_REQUIRED" ||
    invoiceStatus ===
      "PENDING_REVIEW" ||
    invoiceStatus ===
      "PENDING_RETRY"
  ) {
    return "MEDIUM";
  }

  return "INFO";
}

/*
|--------------------------------------------------------------------------
| EVENT CATEGORY
|--------------------------------------------------------------------------
*/

function getEventCategory(
  eventType,
) {
  const type =
    normalize(
      eventType,
    );

  if (
    type.startsWith(
      "USER_",
    )
  ) {
    return "USER";
  }

  if (
    type.startsWith(
      "INVOICE_",
    )
  ) {
    return "INVOICE";
  }

  if (
    type.startsWith(
      "ORGANIZATION_",
    )
  ) {
    return "ORGANIZATION";
  }

  return "SYSTEM";
}

/*
|--------------------------------------------------------------------------
| EVENT ICON
|--------------------------------------------------------------------------
*/

function getEventIcon(
  eventType,
) {
  const type =
    normalize(
      eventType,
    );

  const icons = {
    USER_CREATED:
      "👤",

    ORGANIZATION_CREATED:
      "🏢",

    INVOICE_CREATED:
      "📥",

    INVOICE_UPDATED:
      "🔄",

    INVOICE_ACCEPTED:
      "✅",

    INVOICE_REJECTED:
      "❌",

    INVOICE_ERROR:
      "🚨",

    INVOICE_REVIEW_REQUIRED:
      "⚠️",

    INVOICE_RETRY_REQUIRED:
      "🔁",

    INVOICE_SIGNED:
      "✍️",

    INVOICE_SUBMITTED:
      "📡",

    INVOICE_VALIDATED:
      "🧪",
  };

  return (
    icons[
      type
    ] ||
    "•"
  );
}

/*
|--------------------------------------------------------------------------
| EVENT TITLE
|--------------------------------------------------------------------------
*/

function getInvoiceEventType(
  status,
) {
  const normalizedStatus =
    normalize(
      status,
    );

  const mapping = {
    ACCEPTED:
      "INVOICE_ACCEPTED",

    REJECTED:
      "INVOICE_REJECTED",

    ERROR:
      "INVOICE_ERROR",

    PENDING_REVIEW:
      "INVOICE_REVIEW_REQUIRED",

    PENDING_RETRY:
      "INVOICE_RETRY_REQUIRED",

    SIGNED:
      "INVOICE_SIGNED",

    SUBMITTED:
      "INVOICE_SUBMITTED",

    VALIDATED:
      "INVOICE_VALIDATED",
  };

  return (
    mapping[
      normalizedStatus
    ] ||
    "INVOICE_UPDATED"
  );
}

function getEventTitle(
  event,
) {
  const type =
    normalize(
      event?.event_type,
    );

  const invoiceNumber =
    event?.invoice_number ||
    "sans numéro";

  const titles = {
    USER_CREATED:
      "Nouvel utilisateur",

    ORGANIZATION_CREATED:
      "Nouvelle organisation",

    INVOICE_CREATED:
      `Facture ${invoiceNumber} enregistrée`,

    INVOICE_UPDATED:
      `Facture ${invoiceNumber} mise à jour`,

    INVOICE_ACCEPTED:
      `Facture ${invoiceNumber} acceptée`,

    INVOICE_REJECTED:
      `Facture ${invoiceNumber} rejetée`,

    INVOICE_ERROR:
      `Erreur sur la facture ${invoiceNumber}`,

    INVOICE_REVIEW_REQUIRED:
      `Révision requise pour ${invoiceNumber}`,

    INVOICE_RETRY_REQUIRED:
      `Nouvelle tentative requise pour ${invoiceNumber}`,

    INVOICE_SIGNED:
      `Facture ${invoiceNumber} signée`,

    INVOICE_SUBMITTED:
      `Facture ${invoiceNumber} soumise`,

    INVOICE_VALIDATED:
      `Facture ${invoiceNumber} validée`,
  };

  return (
    titles[
      type
    ] ||
    "Événement système"
  );
}

/*
|--------------------------------------------------------------------------
| EVENT DESCRIPTION
|--------------------------------------------------------------------------
*/

function getEventDescription(
  event,
) {
  const type =
    normalize(
      event?.event_type,
    );

  if (
    type ===
    "USER_CREATED"
  ) {
    return `${event.actor_name || "Utilisateur"} a été ajouté à la plateforme.`;
  }

  if (
    type ===
    "ORGANIZATION_CREATED"
  ) {
    return `L’organisation ${event.organization_name || "sans nom"} a été créée.`;
  }

  if (
    type ===
    "INVOICE_CREATED"
  ) {
    return event.original_filename
      ? `Le fichier ${event.original_filename} a été enregistré dans la plateforme.`
      : "Une nouvelle facture a été enregistrée dans la plateforme.";
  }

  if (
    type ===
    "INVOICE_ACCEPTED"
  ) {
    return "Le traitement de la facture est terminé avec un statut accepté.";
  }

  if (
    type ===
    "INVOICE_REJECTED"
  ) {
    return (
      event.error_message ||
      event.rejection_reason ||
      "La facture a été rejetée pendant le traitement."
    );
  }

  if (
    type ===
    "INVOICE_ERROR"
  ) {
    return (
      event.error_message ||
      "Une erreur a interrompu le traitement de la facture."
    );
  }

  if (
    type ===
    "INVOICE_REVIEW_REQUIRED"
  ) {
    return (
      event.error_message ||
      "Une vérification humaine est nécessaire avant de poursuivre."
    );
  }

  if (
    type ===
    "INVOICE_RETRY_REQUIRED"
  ) {
    return (
      event.error_message ||
      "Une nouvelle tentative est nécessaire pour poursuivre le traitement."
    );
  }

  if (
    type ===
    "INVOICE_SIGNED"
  ) {
    return "La phase de signature de la facture a été terminée.";
  }

  if (
    type ===
    "INVOICE_SUBMITTED"
  ) {
    return "La facture a atteint la phase de soumission.";
  }

  if (
    type ===
    "INVOICE_VALIDATED"
  ) {
    return "Les contrôles de validation ont été terminés.";
  }

  return `La facture est actuellement au statut ${event.invoice_status || "inconnu"} et à l’étape ${event.current_stage || "inconnue"}.`;
}

/*
|--------------------------------------------------------------------------
| GET /api/admin/audit
|--------------------------------------------------------------------------
*/

async function getAdminAuditLogs(
  req,
  res,
) {
  try {
    setNoCacheHeaders(
      res,
    );

    getAdminUser(
      req,
    );

    const pool =
      getDatabase();

    /*
    |--------------------------------------------------------------------------
    | INVOICE ACTIVITY
    |--------------------------------------------------------------------------
    |
    | On utilise la dernière version de chaque facture métier.
    |
    |--------------------------------------------------------------------------
    */

    const invoiceResult =
      await pool
        .request()
        .query(`
          ;WITH RankedInvoices AS (
            SELECT
              i.id,
              i.organization_id,
              i.client_id,
              i.created_by,

              i.invoice_number,
              i.original_filename,

              i.status,
              i.current_stage,

              i.source_type,
              i.source,

              i.last_error_code,
              i.last_error_message,
              i.rejection_reason,

              i.ttn_reference,
              i.ttn_transaction_id,
              i.transaction_id,

              i.created_at,
              i.updated_at,

              ROW_NUMBER() OVER (
                PARTITION BY
                  i.organization_id,

                  CASE
                    WHEN
                      i.invoice_number IS NULL
                      OR LTRIM(
                        RTRIM(
                          i.invoice_number
                        )
                      ) = ''

                    THEN
                      CONVERT(
                        NVARCHAR(36),
                        i.id
                      )

                    ELSE
                      CONCAT(
                        UPPER(
                          LTRIM(
                            RTRIM(
                              i.invoice_number
                            )
                          )
                        ),

                        '|',

                        UPPER(
                          LTRIM(
                            RTRIM(
                              COALESCE(
                                i.supplier_identifier,
                                ''
                              )
                            )
                          )
                        )
                      )
                  END

                ORDER BY
                  i.updated_at DESC,
                  i.created_at DESC
              ) AS rn

            FROM dbo.invoices i
          )

          SELECT
            r.id,
            r.organization_id,
            r.client_id,
            r.created_by,

            r.invoice_number,
            r.original_filename,

            r.status,
            r.current_stage,

            r.source_type,
            r.source,

            r.last_error_code,
            r.last_error_message,
            r.rejection_reason,

            r.ttn_reference,
            r.ttn_transaction_id,
            r.transaction_id,

            r.created_at,
            r.updated_at,

            o.name
              AS organization_name,

            u.first_name
              AS client_first_name,

            u.last_name
              AS client_last_name,

            u.email
              AS client_email,

            creator.first_name
              AS creator_first_name,

            creator.last_name
              AS creator_last_name,

            creator.email
              AS creator_email

          FROM RankedInvoices r

          LEFT JOIN dbo.organizations o
            ON o.id =
              r.organization_id

          LEFT JOIN dbo.users u
            ON u.id =
              r.client_id

          LEFT JOIN dbo.users creator
            ON creator.id =
              r.created_by

          WHERE
            r.rn = 1;
        `);

    /*
    |--------------------------------------------------------------------------
    | USER ACTIVITY
    |--------------------------------------------------------------------------
    */

    const userResult =
      await pool
        .request()
        .query(`
          SELECT
            u.id,
            u.organization_id,

            u.first_name,
            u.last_name,
            u.email,

            u.role,
            u.is_active,
            u.auth_provider,

            u.created_at,

            o.name
              AS organization_name

          FROM dbo.users u

          LEFT JOIN dbo.organizations o
            ON o.id =
              u.organization_id

          ORDER BY
            u.created_at DESC;
        `);

    /*
    |--------------------------------------------------------------------------
    | ORGANIZATION ACTIVITY
    |--------------------------------------------------------------------------
    */

    const organizationResult =
      await pool
        .request()
        .query(`
          SELECT
            o.id,
            o.name,
            o.country_code,
            o.is_active,
            o.created_at

          FROM dbo.organizations o

          ORDER BY
            o.created_at DESC;
        `);

    /*
    |--------------------------------------------------------------------------
    | BUILD EVENTS
    |--------------------------------------------------------------------------
    */

    const events = [];

    /*
    |--------------------------------------------------------------------------
    | INVOICES
    |--------------------------------------------------------------------------
    */

    for (
      const invoice
      of invoiceResult.recordset
    ) {
      const clientName =
        buildUserName({
          firstName:
            invoice.client_first_name,

          lastName:
            invoice.client_last_name,

          email:
            invoice.client_email,
        });

      const creatorName =
        buildUserName({
          firstName:
            invoice.creator_first_name,

          lastName:
            invoice.creator_last_name,

          email:
            invoice.creator_email,
        });

      /*
      |--------------------------------------------------------------------------
      | CREATED EVENT
      |--------------------------------------------------------------------------
      */

      if (
        invoice.created_at
      ) {
        const createdEvent = {
          id:
            `invoice-created-${invoice.id}`,

          event_type:
            "INVOICE_CREATED",

          event_date:
            invoice.created_at,

          actor_type:
            invoice.created_by
              ? "USER"
              : "SYSTEM",

          actor_id:
            invoice.created_by ||
            null,

          actor_name:
            invoice.created_by
              ? creatorName
              : "Système",

          organization_id:
            invoice.organization_id ||
            null,

          organization_name:
            invoice.organization_name ||
            "Organisation inconnue",

          invoice_id:
            invoice.id,

          invoice_number:
            invoice.invoice_number ||
            null,

          original_filename:
            invoice.original_filename ||
            null,

          invoice_status:
            invoice.status ||
            null,

          current_stage:
            invoice.current_stage ||
            null,

          source:
            invoice.source_type ||
            invoice.source ||
            null,

          client_id:
            invoice.client_id ||
            null,

          client_name:
            clientName,

          client_email:
            invoice.client_email ||
            null,

          error_code:
            null,

          error_message:
            null,

          rejection_reason:
            null,

          ttn_reference:
            invoice.ttn_reference ||
            null,

          transaction_id:
            invoice.ttn_transaction_id ||
            invoice.transaction_id ||
            null,
        };

        createdEvent.category =
          getEventCategory(
            createdEvent.event_type,
          );

        createdEvent.severity =
          "INFO";

        createdEvent.icon =
          getEventIcon(
            createdEvent.event_type,
          );

        createdEvent.title =
          getEventTitle(
            createdEvent,
          );

        createdEvent.description =
          getEventDescription(
            createdEvent,
          );

        events.push(
          createdEvent,
        );
      }

      /*
      |--------------------------------------------------------------------------
      | CURRENT / UPDATED EVENT
      |--------------------------------------------------------------------------
      |
      | On évite de créer deux événements identiques si created_at == updated_at.
      |
      |--------------------------------------------------------------------------
      */

      if (
        invoice.updated_at
      ) {
        const createdTime =
          invoice.created_at
            ? new Date(
                invoice.created_at,
              ).getTime()
            : null;

        const updatedTime =
          new Date(
            invoice.updated_at,
          ).getTime();

        const differentActivity =
          createdTime === null ||
          Number.isNaN(
            createdTime,
          ) ||
          Number.isNaN(
            updatedTime,
          ) ||
          createdTime !==
            updatedTime;

        if (
          differentActivity
        ) {
          const eventType =
            getInvoiceEventType(
              invoice.status,
            );

          const updatedEvent = {
            id:
              `invoice-updated-${invoice.id}`,

            event_type:
              eventType,

            event_date:
              invoice.updated_at,

            actor_type:
              "SYSTEM",

            actor_id:
              null,

            actor_name:
              "Workflow",

            organization_id:
              invoice.organization_id ||
              null,

            organization_name:
              invoice.organization_name ||
              "Organisation inconnue",

            invoice_id:
              invoice.id,

            invoice_number:
              invoice.invoice_number ||
              null,

            original_filename:
              invoice.original_filename ||
              null,

            invoice_status:
              invoice.status ||
              null,

            current_stage:
              invoice.current_stage ||
              null,

            source:
              invoice.source_type ||
              invoice.source ||
              null,

            client_id:
              invoice.client_id ||
              null,

            client_name:
              clientName,

            client_email:
              invoice.client_email ||
              null,

            error_code:
              invoice.last_error_code ||
              null,

            error_message:
              invoice.last_error_message ||
              null,

            rejection_reason:
              invoice.rejection_reason ||
              null,

            ttn_reference:
              invoice.ttn_reference ||
              null,

            transaction_id:
              invoice.ttn_transaction_id ||
              invoice.transaction_id ||
              null,
          };

          updatedEvent.category =
            getEventCategory(
              updatedEvent.event_type,
            );

          updatedEvent.severity =
            getEventSeverity(
              updatedEvent,
            );

          updatedEvent.icon =
            getEventIcon(
              updatedEvent.event_type,
            );

          updatedEvent.title =
            getEventTitle(
              updatedEvent,
            );

          updatedEvent.description =
            getEventDescription(
              updatedEvent,
            );

          events.push(
            updatedEvent,
          );
        }
      }
    }

    /*
    |--------------------------------------------------------------------------
    | USERS
    |--------------------------------------------------------------------------
    */

    for (
      const user
      of userResult.recordset
    ) {
      if (
        !user.created_at
      ) {
        continue;
      }

      const actorName =
        buildUserName({
          firstName:
            user.first_name,

          lastName:
            user.last_name,

          email:
            user.email,
        });

      const userEvent = {
        id:
          `user-created-${user.id}`,

        event_type:
          "USER_CREATED",

        event_date:
          user.created_at,

        category:
          "USER",

        severity:
          "INFO",

        icon:
          "👤",

        actor_type:
          "USER",

        actor_id:
          user.id,

        actor_name:
          actorName,

        actor_email:
          user.email ||
          null,

        actor_role:
          user.role ||
          null,

        auth_provider:
          user.auth_provider ||
          null,

        is_active:
          Boolean(
            user.is_active,
          ),

        organization_id:
          user.organization_id ||
          null,

        organization_name:
          user.organization_name ||
          "Organisation inconnue",

        invoice_id:
          null,

        invoice_number:
          null,

        current_stage:
          null,

        invoice_status:
          null,

        source:
          null,

        error_code:
          null,

        error_message:
          null,

        title:
          "Nouvel utilisateur",

        description:
          `${actorName} a été ajouté à la plateforme avec le rôle ${user.role || "inconnu"}.`,
      };

      events.push(
        userEvent,
      );
    }

    /*
    |--------------------------------------------------------------------------
    | ORGANIZATIONS
    |--------------------------------------------------------------------------
    */

    for (
      const organization
      of organizationResult.recordset
    ) {
      if (
        !organization.created_at
      ) {
        continue;
      }

      events.push({
        id:
          `organization-created-${organization.id}`,

        event_type:
          "ORGANIZATION_CREATED",

        event_date:
          organization.created_at,

        category:
          "ORGANIZATION",

        severity:
          "INFO",

        icon:
          "🏢",

        actor_type:
          "SYSTEM",

        actor_id:
          null,

        actor_name:
          "Système",

        organization_id:
          organization.id,

        organization_name:
          organization.name ||
          "Organisation sans nom",

        organization_country:
          organization.country_code ||
          null,

        organization_is_active:
          Boolean(
            organization.is_active,
          ),

        invoice_id:
          null,

        invoice_number:
          null,

        current_stage:
          null,

        invoice_status:
          null,

        source:
          null,

        error_code:
          null,

        error_message:
          null,

        title:
          "Nouvelle organisation",

        description:
          `L’organisation ${organization.name || "sans nom"} a été enregistrée dans la plateforme.`,
      });
    }

    /*
    |--------------------------------------------------------------------------
    | SORT
    |--------------------------------------------------------------------------
    */

    events.sort(
      (
        first,
        second,
      ) => {
        const firstTime =
          new Date(
            first.event_date ||
              0,
          ).getTime();

        const secondTime =
          new Date(
            second.event_date ||
              0,
          ).getTime();

        return (
          secondTime -
          firstTime
        );
      },
    );

    /*
    |--------------------------------------------------------------------------
    | STATISTICS
    |--------------------------------------------------------------------------
    */

    const stats = {
      total:
        events.length,

      invoices:
        0,

      users:
        0,

      organizations:
        0,

      system:
        0,

      critical:
        0,

      warnings:
        0,

      info:
        0,

      today:
        0,
    };

    const now =
      new Date();

    const todayStart =
      new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      ).getTime();

    for (
      const event
      of events
    ) {
      const category =
        normalize(
          event.category,
        );

      const severity =
        normalize(
          event.severity,
        );

      if (
        category ===
        "INVOICE"
      ) {
        stats.invoices +=
          1;
      } else if (
        category ===
        "USER"
      ) {
        stats.users +=
          1;
      } else if (
        category ===
        "ORGANIZATION"
      ) {
        stats.organizations +=
          1;
      } else {
        stats.system +=
          1;
      }

      if (
        severity ===
        "HIGH"
      ) {
        stats.critical +=
          1;
      } else if (
        severity ===
        "MEDIUM"
      ) {
        stats.warnings +=
          1;
      } else {
        stats.info +=
          1;
      }

      const eventTime =
        new Date(
          event.event_date ||
            0,
        ).getTime();

      if (
        !Number.isNaN(
          eventTime,
        ) &&
        eventTime >=
          todayStart
      ) {
        stats.today +=
          1;
      }
    }

    /*
    |--------------------------------------------------------------------------
    | EVENT TYPE DISTRIBUTION
    |--------------------------------------------------------------------------
    */

    const eventTypeMap =
      new Map();

    for (
      const event
      of events
    ) {
      const key =
        normalize(
          event.event_type,
        ) ||
        "UNKNOWN";

      eventTypeMap.set(
        key,
        (
          eventTypeMap.get(
            key,
          ) ||
          0
        ) +
          1,
      );
    }

    const eventTypes =
      [...eventTypeMap.entries()]
        .map(
          ([
            event_type,
            total,
          ]) => ({
            event_type,
            total,
          }),
        )
        .sort(
          (
            first,
            second,
          ) =>
            second.total -
            first.total,
        );

    /*
    |--------------------------------------------------------------------------
    | ORGANIZATION DISTRIBUTION
    |--------------------------------------------------------------------------
    */

    const organizationMap =
      new Map();

    for (
      const event
      of events
    ) {
      const organizationName =
        String(
          event.organization_name ||
            "",
        ).trim();

      if (
        !organizationName
      ) {
        continue;
      }

      organizationMap.set(
        organizationName,
        (
          organizationMap.get(
            organizationName,
          ) ||
          0
        ) +
          1,
      );
    }

    const organizations =
      [...organizationMap.entries()]
        .map(
          ([
            organization_name,
            total,
          ]) => ({
            organization_name,
            total,
          }),
        )
        .sort(
          (
            first,
            second,
          ) =>
            second.total -
            first.total,
        );

    /*
    |--------------------------------------------------------------------------
    | RESPONSE
    |--------------------------------------------------------------------------
    */

    return res
      .status(200)
      .json({
        success:
          true,

        generated_at:
          new Date()
            .toISOString(),

        count:
          events.length,

        stats,

        event_types:
          eventTypes,

        organizations,

        events,
      });
  } catch (
    error
  ) {
    console.error(
      "getAdminAuditLogs error:",
      error,
    );

    const statusCode =
      error.statusCode ||
      500;

    return res
      .status(
        statusCode,
      )
      .json({
        success:
          false,

        errorCode:
          error.errorCode ||
          "ADMIN_AUDIT_FAILED",

        message:
          statusCode ===
          500
            ? "Impossible de charger le journal d’activité."
            : error.message,

        error:
          statusCode ===
          500
            ? error.message
            : undefined,
      });
  }
}

/*
|--------------------------------------------------------------------------
| EXPORT
|--------------------------------------------------------------------------
*/

module.exports = {
  getAdminAuditLogs,
};