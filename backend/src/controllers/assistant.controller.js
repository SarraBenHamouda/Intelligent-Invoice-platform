const {
  sql,
  getDatabase,
} = require("../config/database");

const {
  rewriteWithOllama,
  getOllamaHealth,
} = require("../services/ollamaAssistant.service");

/*
|--------------------------------------------------------------------------
| ASSISTANT FACTURES - HYBRIDE SQL + OLLAMA
|--------------------------------------------------------------------------
|
| Règle principale :
|
| 1. Les données métier viennent TOUJOURS de SQL Server et des règles locales.
| 2. Ollama ne décide JAMAIS du statut, de l'étape, de l'erreur ou du retry.
| 3. Ollama sert uniquement à reformuler une réponse déjà calculée.
| 4. Si Ollama est indisponible, la réponse déterministe est renvoyée.
|
|--------------------------------------------------------------------------
*/

const STATUS_EXPLANATIONS = Object.freeze({
  UPLOADED:
    "La facture a été reçue par la plateforme. Le traitement va commencer.",

  PROCESSING:
    "La facture est actuellement en cours de traitement par le workflow.",

  PENDING_REVIEW:
    "L'extraction est terminée et la facture attend une vérification humaine. Vérifiez les données puis cliquez sur « Valider et continuer vers la signature ».",

  VALIDATED:
    "La facture a passé l'étape de validation et peut poursuivre le traitement.",

  SIGNING:
    "La signature électronique de la facture est en cours.",

  SIGNED:
    "La facture a été signée. Elle attend maintenant la suite du traitement ou la transmission.",

  SUBMITTED:
    "La facture a été transmise au scénario TTN et attend son résultat.",

  ACCEPTED:
    "La facture a terminé le traitement avec succès.",

  REJECTED:
    "La facture a été rejetée pendant le traitement. Consultez la raison du rejet pour savoir quelle correction effectuer.",

  PENDING_RETRY:
    "Le traitement est temporairement interrompu et une nouvelle tentative peut être nécessaire.",

  ERROR:
    "Le traitement de la facture a rencontré une erreur. Consultez la raison affichée et relancez la facture si la relance est autorisée.",
});

const STAGE_EXPLANATIONS = Object.freeze({
  IMPORT:
    "La plateforme reçoit la facture ou les identifiants ERP.",

  EXTRACTION:
    "La plateforme extrait les informations de la facture.",

  VALIDATION:
    "Les données extraites sont contrôlées et, si nécessaire, vérifiées par l'utilisateur.",

  TEIF:
    "La plateforme génère le document TEIF.",

  SIGNATURE:
    "La facture est préparée puis signée électroniquement.",

  TTN:
    "La facture est dans l'étape de transmission et de résultat TTN du scénario.",
});

const KNOWN_STATUSES =
  Object.keys(
    STATUS_EXPLANATIONS,
  );

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function normalizeText(
  value,
) {
  return String(
    value || "",
  ).trim();
}

function normalizeCode(
  value,
) {
  return normalizeText(
    value,
  ).toUpperCase();
}

function getAuthenticatedUser(
  req,
) {
  const userId =
    req.user?.id ||
    req.user?.user_id ||
    req.user?.sub;

  const organizationId =
    req.user?.organization_id ||
    req.user?.organizationId;

  const role =
    normalizeCode(
      req.user?.role,
    );

  if (!userId) {
    throw new Error(
      "Identifiant de l'utilisateur connecté introuvable.",
    );
  }

  if (!organizationId) {
    throw new Error(
      "Organisation de l'utilisateur connecté introuvable.",
    );
  }

  return {
    userId,
    organizationId,
    role,
  };
}

/*
|--------------------------------------------------------------------------
| EXTRACTION NUMERO FACTURE
|--------------------------------------------------------------------------
*/

function extractInvoiceNumber(
  message,
) {
  const text =
    normalizeText(
      message,
    );

  if (!text) {
    return null;
  }

  /*
  |--------------------------------------------------------------------------
  | IMPORTANT
  |--------------------------------------------------------------------------
  |
  | Un numéro de facture doit contenir AU MOINS UN CHIFFRE.
  |
  | Cela évite de prendre des mots comme :
  |
  | "est"
  | "ERP"
  | "en"
  | "une"
  |
  | comme numéro de facture.
  |
  | Exemple :
  |
  | "Que dois-je faire si une facture est en ERROR ?"
  |
  | => aucun numéro de facture
  | => question générale sur ERROR
  |
  |--------------------------------------------------------------------------
  */

  const explicitMatch =
    text.match(
      /(?:facture|invoice|num[eé]ro|n[°ºo])\s*(?:de\s+)?(?:facture\s*)?(?:[:#-]\s*)?([A-Za-z0-9][A-Za-z0-9._/-]{2,})/i,
    );

  if (
    explicitMatch?.[1]
  ) {
    const candidate =
      explicitMatch[1].trim();

    const normalizedCandidate =
      normalizeCode(
        candidate,
      );

    if (
      /\d/.test(
        candidate,
      ) &&
      !KNOWN_STATUSES.includes(
        normalizedCandidate,
      )
    ) {
      return candidate;
    }
  }

  /*
  |--------------------------------------------------------------------------
  | NUMÉRO PRINCIPALEMENT NUMÉRIQUE
  |--------------------------------------------------------------------------
  */

  const numericMatch =
    text.match(
      /\b\d{5,}\b/,
    );

  if (
    numericMatch?.[0]
  ) {
    return numericMatch[0];
  }

  /*
  |--------------------------------------------------------------------------
  | NUMÉRO ALPHANUMÉRIQUE
  |--------------------------------------------------------------------------
  |
  | Exemples :
  |
  | FA260002
  | INV-2026-001
  | AC_250001
  |
  |--------------------------------------------------------------------------
  */

  const tokens =
    text.match(
      /\b[A-Za-z0-9][A-Za-z0-9._/-]{3,}\b/g,
    ) || [];

  const ignoredWords =
    new Set([
      "ERROR",
      "REJECTED",
      "PENDING_RETRY",
      "PENDING_REVIEW",
      "PROCESSING",
      "UPLOADED",
      "VALIDATED",
      "SIGNING",
      "SIGNED",
      "SUBMITTED",
      "ACCEPTED",
      "IMPORT",
      "EXTRACTION",
      "VALIDATION",
      "TEIF",
      "SIGNATURE",
      "TTN",
      "ERP",
      "PDF",
      "IMAGE",
    ]);

  const candidate =
    tokens.find(
      (token) => {
        const normalizedToken =
          normalizeCode(
            token,
          );

        return (
          /\d/.test(
            token,
          ) &&
          !ignoredWords.has(
            normalizedToken,
          ) &&
          !KNOWN_STATUSES.includes(
            normalizedToken,
          )
        );
      },
    );

  return candidate ||
    null;
}

function extractKnownStatus(
  message,
) {
  const upper =
    normalizeCode(
      message,
    );

  return (
    KNOWN_STATUSES.find(
      (status) =>
        upper.includes(
          status,
        ),
    ) ||
    null
  );
}

/*
|--------------------------------------------------------------------------
| INTENT
|--------------------------------------------------------------------------
*/

function detectIntent(
  message,
  invoiceNumber,
  knownStatus,
) {
  const lower =
    normalizeText(
      message,
    ).toLowerCase();

  if (
    knownStatus &&
    (
      lower.includes("signifie") ||
      lower.includes("veut dire") ||
      lower.includes("meaning") ||
      lower.includes("what does") ||
      lower.includes("c'est quoi") ||
      lower.includes("explique")
    )
  ) {
    return "STATUS_EXPLANATION";
  }

  if (
    lower.includes("comment") &&
    (
      lower.includes("relanc") ||
      lower.includes("retry")
    )
  ) {
    return "RETRY_HELP";
  }

  if (
    lower.includes("retry") ||
    lower.includes("relanc")
  )
     {
    return invoiceNumber
      ? "INVOICE_RETRY"
      : "RETRY_HELP";
  }

  if (
    lower.includes("pourquoi") ||
    lower.includes("why") ||
    lower.includes("raison") ||
    lower.includes("erreur") ||
    lower.includes("error") ||
    lower.includes("rejet") ||
    lower.includes("reject") ||
    lower.includes("échou") ||
    lower.includes("fail")
  ) {
    return invoiceNumber
      ? "INVOICE_ERROR"
      : "ERROR_HELP";
  }

  if (
    lower.includes("signature") ||
    lower.includes("continuer") ||
    lower.includes("continue")
  ) {
    return invoiceNumber
      ? "INVOICE_CONTINUE"
      : "SIGNATURE_HELP";
  }

  if (
    lower.includes("statut") ||
    lower.includes("status") ||
    lower.includes("état")
  ) {
    return invoiceNumber
      ? "INVOICE_STATUS"
      : "STATUS_HELP";
  }

  if (
    invoiceNumber
  ) {
    return "INVOICE_STATUS";
  }

  return "HELP";
}

/*
|--------------------------------------------------------------------------
| SQL
|--------------------------------------------------------------------------
*/

async function findInvoice({
  invoiceNumber,
  organizationId,
  userId,
  role,
}) {
  const pool =
    getDatabase();

  const request =
    pool
      .request()

      .input(
        "organization_id",
        sql.UniqueIdentifier,
        organizationId,
      )

      .input(
        "invoice_number",
        sql.NVarChar(100),
        invoiceNumber,
      )

      .input(
        "user_id",
        sql.UniqueIdentifier,
        userId,
      );

  const clientRestriction =
    role === "ADMIN"
      ? ""
      : `
        AND (
          client_id = @user_id
          OR created_by = @user_id
        )
      `;

  const result =
    await request.query(`
      SELECT TOP 1
        id,
        organization_id,
        client_id,
        created_by,

        invoice_number,
        supplier_identifier,
        customer_identifier,

        source_type,
        source,

        status,
        current_stage,
        can_retry,

        rejection_reason,
        last_error_code,
        last_error_message,

        ttn_reference,
        ttn_transaction_id,
        transaction_id,

        verification_token,

        created_at,
        updated_at

      FROM dbo.invoices

      WHERE
        organization_id =
          @organization_id

        AND UPPER(
          LTRIM(
            RTRIM(
              invoice_number
            )
          )
        ) =
        UPPER(
          LTRIM(
            RTRIM(
              @invoice_number
            )
          )
        )

        ${clientRestriction}

      ORDER BY
        updated_at DESC,
        created_at DESC;
    `);

  return (
    result.recordset?.[0] ||
    null
  );
}

/*
|--------------------------------------------------------------------------
| INVOICE HELPERS
|--------------------------------------------------------------------------
*/

function getInvoiceSource(
  invoice,
) {
  return normalizeCode(
    invoice?.source ||
    invoice?.source_type,
  ) || "INCONNUE";
}

function buildInvoiceSummary(
  invoice,
) {
  if (!invoice) {
    return null;
  }

  return {
    id:
      invoice.id,

    invoice_number:
      invoice.invoice_number,

    source:
      getInvoiceSource(
        invoice,
      ),

    status:
      normalizeCode(
        invoice.status,
      ),

    current_stage:
      normalizeCode(
        invoice.current_stage,
      ),

    can_retry:
      Boolean(
        invoice.can_retry,
      ),

    error_code:
      invoice.last_error_code ||
      null,

    error_message:
      invoice.last_error_message ||
      invoice.rejection_reason ||
      null,

    ttn_reference:
      invoice.ttn_reference ||
      null,

    transaction_id:
      invoice.ttn_transaction_id ||
      invoice.transaction_id ||
      null,

    verification_available:
      Boolean(
        invoice.verification_token,
      ),

    updated_at:
      invoice.updated_at,
  };
}

/*
|--------------------------------------------------------------------------
| REPONSES DETERMINISTES
|--------------------------------------------------------------------------
*/

function buildStatusAnswer(
  invoice,
) {
  const number =
    invoice.invoice_number ||
    "demandée";

  const status =
    normalizeCode(
      invoice.status,
    );

  const stage =
    normalizeCode(
      invoice.current_stage,
    );

  const statusText =
    STATUS_EXPLANATIONS[
      status
    ] ||
    "Le statut de cette facture n'est pas reconnu par l'assistant.";

  const stageText =
    STAGE_EXPLANATIONS[
      stage
    ] ||
    null;

  let answer =
    `La facture ${number} est actuellement au statut ${status || "INCONNU"}.`;

  if (stage) {
    answer +=
      ` Étape actuelle : ${stage}.`;
  }

  answer +=
    ` ${statusText}`;

  if (stageText) {
    answer +=
      ` ${stageText}`;
  }

  if (
    status ===
    "ACCEPTED"
  ) {
    if (
      invoice.ttn_reference
    ) {
      answer +=
        ` Référence TTN : ${invoice.ttn_reference}.`;
    }

    if (
      invoice.verification_token
    ) {
      answer +=
        " Le QR code de vérification est disponible sur la fiche de la facture.";
    }
  }

  return answer;
}

function buildErrorAnswer(
  invoice,
) {
  const number =
    invoice.invoice_number ||
    "demandée";

  const status =
    normalizeCode(
      invoice.status,
    );

  const stage =
    normalizeCode(
      invoice.current_stage,
    );

  const errorCode =
    normalizeText(
      invoice.last_error_code,
    );

  const errorMessage =
    normalizeText(
      invoice.last_error_message ||
      invoice.rejection_reason,
    );

  if (
    ![
      "ERROR",
      "REJECTED",
      "PENDING_RETRY",
    ].includes(
      status,
    )
  ) {
    return (
      `La facture ${number} n'est pas actuellement en erreur ou rejetée. ` +
      `Son statut est ${status || "INCONNU"} et son étape est ${stage || "INCONNUE"}.`
    );
  }

  let answer =
    `La facture ${number} a rencontré un problème à l'étape ${stage || "INCONNUE"}.`;

  if (errorCode) {
    answer +=
      ` Code : ${errorCode}.`;
  }

  if (errorMessage) {
    answer +=
      ` Raison : ${errorMessage}`;
  } else {
    answer +=
      " Aucune raison détaillée supplémentaire n'est enregistrée.";
  }

  if (
    Boolean(
      invoice.can_retry,
    )
  ) {
    if (
      getInvoiceSource(
        invoice,
      ) ===
      "ERP"
    ) {
      answer +=
        " La relance est autorisée. Ouvrez la facture, corrigez si nécessaire le numéro de facture ERP ou le code client, puis cliquez sur « Corriger et relancer ».";
    } else {
      answer +=
        " La relance est autorisée depuis la fiche de la facture.";
    }
  } else {
    answer +=
      " La relance n'est pas actuellement autorisée pour cette facture.";
  }

  return answer;
}

function buildRetryAnswer(
  invoice,
) {
  const number =
    invoice.invoice_number ||
    "demandée";

  const status =
    normalizeCode(
      invoice.status,
    );

  const stage =
    normalizeCode(
      invoice.current_stage,
    );

  const source =
    getInvoiceSource(
      invoice,
    );

  if (
    status ===
    "ACCEPTED"
  ) {
    return (
      `La facture ${number} est déjà ACCEPTED. ` +
      "Elle ne doit pas être relancée."
    );
  }

  if (
    !Boolean(
      invoice.can_retry,
    )
  ) {
    return (
      `La facture ${number} ne peut pas être relancée actuellement. ` +
      `Statut : ${status || "INCONNU"}. Étape : ${stage || "INCONNUE"}.`
    );
  }

  if (
    source ===
    "ERP"
  ) {
    return (
      `La facture ${number} peut être relancée. ` +
            "Comme elle provient de l'ERP, ouvrez sa fiche, vérifiez uniquement le numéro de facture ERP et le code client, puis cliquez sur « Corriger et relancer »."
    );
  }

  return (
    `La facture ${number} peut être relancée depuis sa fiche. ` +
    "Utilisez le bouton de relance disponible sur la page de détail."
  );
}

function buildContinueAnswer(
  invoice,
) {
  const number =
    invoice.invoice_number ||
    "demandée";

  const status =
    normalizeCode(
      invoice.status,
    );

  const stage =
    normalizeCode(
      invoice.current_stage,
    );

  if (
    status ===
      "PENDING_REVIEW" &&
    stage ===
      "VALIDATION"
  ) {
    return (
      `Oui. La facture ${number} attend votre vérification. ` +
      "Contrôlez les données extraites puis cliquez sur « Valider et continuer vers la signature »."
    );
  }

  if (
    status ===
    "ACCEPTED"
  ) {
    return (
      `La facture ${number} a déjà terminé le traitement avec le statut ACCEPTED. ` +
      "Aucune nouvelle validation vers la signature n'est nécessaire."
    );
  }

  if (
    [
      "ERROR",
      "REJECTED",
      "PENDING_RETRY",
    ].includes(
      status,
    )
  ) {
    return (
      `Non, pas immédiatement. La facture ${number} est au statut ${status} à l'étape ${stage || "INCONNUE"}. ` +
      "Il faut d'abord résoudre l'erreur ou effectuer la relance autorisée."
    );
  }

  return (
    `La facture ${number} est au statut ${status || "INCONNU"} et à l'étape ${stage || "INCONNUE"}. ` +
    "Elle ne présente pas actuellement l'action de validation humaine vers la signature."
  );
}

function buildGeneralHelpAnswer() {
  return (
    "Je peux vous aider à suivre vos factures. " +
    "Essayez par exemple : « Quel est le statut de la facture 10000005 ? », " +
    "« Pourquoi la facture 10000005 a échoué ? », " +
    "« Que signifie PENDING_REVIEW ? » ou " +
    "« Comment relancer une facture ERP ? »."
  );
}

/*
|--------------------------------------------------------------------------
| OLLAMA WRAPPER
|--------------------------------------------------------------------------
*/

async function maybeRewriteWithOllama({
  userMessage,
  deterministicAnswer,
  intent,
  invoice,
}) {
  const result =
    await rewriteWithOllama({
      userMessage,
      deterministicAnswer,
      intent,
      invoice:
        invoice
          ? buildInvoiceSummary(
              invoice,
            )
          : null,
    });

  return {
    answer:
      result.answer ||
      deterministicAnswer,

    ollama_used:
      Boolean(
        result.used,
      ),

    ollama_model:
      result.model ||
      null,

    ollama_fallback:
      Boolean(
        result.fallback,
      ),
  };
}

/*
|--------------------------------------------------------------------------
| POST /api/assistant/ask
|--------------------------------------------------------------------------
*/

async function askAssistant(
  req,
  res,
) {
  try {
    const {
      userId,
      organizationId,
      role,
    } =
      getAuthenticatedUser(
        req,
      );

    const message =
      normalizeText(
        req.body?.message,
      );

    if (!message) {
      return res
        .status(400)
        .json({
          success:
            false,

          errorCode:
            "ASSISTANT_MESSAGE_REQUIRED",

          message:
            "Écrivez une question pour l'assistant.",
        });
    }

    if (
      message.length >
      500
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          errorCode:
            "ASSISTANT_MESSAGE_TOO_LONG",

          message:
            "La question est trop longue. Utilisez au maximum 500 caractères.",
        });
    }

    const invoiceNumber =
      extractInvoiceNumber(
        message,
      );

    const knownStatus =
      extractKnownStatus(
        message,
      );

    const intent =
      detectIntent(
        message,
        invoiceNumber,
        knownStatus,
      );

    /*
    |--------------------------------------------------------------------------
    | EXPLICATION STATUT
    |--------------------------------------------------------------------------
    */

    if (
      intent ===
      "STATUS_EXPLANATION"
    ) {
      const deterministicAnswer =
        `${knownStatus} : ${
          STATUS_EXPLANATIONS[
            knownStatus
          ] ||
          "Ce statut n'est pas reconnu."
        }`;

      const ai =
        await maybeRewriteWithOllama({
          userMessage:
            message,

          deterministicAnswer,

          intent,

          invoice:
            null,
        });

      return res
        .status(200)
        .json({
          success:
            true,

          intent,

          answer:
            ai.answer,

          ollama_used:
            ai.ollama_used,

          ollama_model:
            ai.ollama_model,

          ollama_fallback:
            ai.ollama_fallback,

          suggestions: [
            "Quel est le statut de la facture 10000005 ?",
            "Comment relancer une facture ERP ?",
          ],
        });
    }

    /*
    |--------------------------------------------------------------------------
    | AIDE GENERALE RETRY
    |--------------------------------------------------------------------------
    */

    if (
      intent ===
      "RETRY_HELP"
    ) {
      const deterministicAnswer =
        "Pour une facture ERP en erreur à l'étape IMPORT ou EXTRACTION, ouvrez sa fiche. Corrigez uniquement le numéro de facture ERP et le code client, puis cliquez sur « Corriger et relancer ». Pour une facture PDF ou image relançable, utilisez le bouton de relance disponible sur sa fiche.";

      const ai =
        await maybeRewriteWithOllama({
          userMessage:
            message,

          deterministicAnswer,

          intent,

          invoice:
            null,
        });

      return res
        .status(200)
        .json({
          success:
            true,

          intent,

          answer:
            ai.answer,

          ollama_used:
            ai.ollama_used,

          ollama_model:
            ai.ollama_model,

          ollama_fallback:
            ai.ollama_fallback,

          suggestions: [
            "Que signifie PENDING_REVIEW ?",
            "Quel est le statut de la facture 10000005 ?",
          ],
        });
    }

    /*
    |--------------------------------------------------------------------------
    | AIDE GENERALE SIGNATURE
    |--------------------------------------------------------------------------
    */

    if (
      intent ===
      "SIGNATURE_HELP"
    ) {
      const deterministicAnswer =
        "Quand une facture est en PENDING_REVIEW à l'étape VALIDATION, vérifiez les données extraites puis cliquez sur « Valider et continuer vers la signature ». La plateforme poursuit ensuite vers la revalidation, le TEIF, la signature et le scénario TTN.";

      const ai =
        await maybeRewriteWithOllama({
          userMessage:
            message,

          deterministicAnswer,

          intent,

          invoice:
            null,
        });

      return res
        .status(200)
        .json({
          success:
            true,

          intent,

          answer:
            ai.answer,

          ollama_used:
            ai.ollama_used,

          ollama_model:
            ai.ollama_model,

          ollama_fallback:
            ai.ollama_fallback,

          suggestions: [
            "Que signifie PENDING_REVIEW ?",
            "Quel est le statut de la facture 10000005 ?",
          ],
        });
    }

    /*
    |--------------------------------------------------------------------------
    | HELP
    |--------------------------------------------------------------------------
    */

    if (
      intent === "STATUS_HELP" ||
      intent === "ERROR_HELP" ||
      intent === "HELP"
    ) {
      let deterministicAnswer;

      if (
        intent ===
        "ERROR_HELP"
      ) {
        deterministicAnswer =
          "Si une facture est en ERROR, ouvrez sa fiche pour consulter l'étape du workflow et la raison enregistrée. Si la relance est autorisée, utilisez l'action proposée sur la fiche. Pour une facture ERP en erreur pendant IMPORT ou EXTRACTION, corrigez uniquement le numéro de facture ERP et le code client puis cliquez sur « Corriger et relancer ».";
      } else {
        deterministicAnswer =
          buildGeneralHelpAnswer();
      }

      const ai =
        await maybeRewriteWithOllama({
          userMessage:
            message,

          deterministicAnswer,

          intent,

          invoice:
            null,
        });

      return res
        .status(200)
        .json({
          success:
            true,

          intent,

          answer:
            ai.answer,

          ollama_used:
            ai.ollama_used,

          ollama_model:
            ai.ollama_model,

          ollama_fallback:
            ai.ollama_fallback,

          suggestions: [
            "Quel est le statut de la facture 10000005 ?",
            "Pourquoi la facture 10000005 a échoué ?",
            "Que signifie PENDING_REVIEW ?",
            "Comment relancer une facture ERP ?",
          ],
        });
    }

    /*
    |--------------------------------------------------------------------------
    | NUMERO REQUIS
    |--------------------------------------------------------------------------
    */

    if (!invoiceNumber) {
      const deterministicAnswer =
        "Indiquez le numéro de facture dans votre question. Exemple : « Quel est le statut de la facture 10000005 ? »";

      const ai =
        await maybeRewriteWithOllama({
          userMessage:
            message,

          deterministicAnswer,

          intent:
            "INVOICE_NUMBER_REQUIRED",

          invoice:
            null,
        });

      return res
        .status(200)
        .json({
          success:
            true,

          intent:
            "INVOICE_NUMBER_REQUIRED",

          answer:
            ai.answer,

          ollama_used:
            ai.ollama_used,

          ollama_model:
            ai.ollama_model,

          ollama_fallback:
            ai.ollama_fallback,

          suggestions: [
            "Que signifie PENDING_REVIEW ?",
            "Comment relancer une facture ERP ?",
          ],
        });
    }

    /*
    |--------------------------------------------------------------------------
    | CHARGER FACTURE
    |--------------------------------------------------------------------------
    */

    const invoice =
      await findInvoice({
        invoiceNumber,
        organizationId,
        userId,
        role,
      });

    if (!invoice) {
      const deterministicAnswer =
        `Je ne trouve aucune facture ${invoiceNumber} accessible dans votre espace. Vérifiez le numéro puis réessayez.`;

      const ai =
        await maybeRewriteWithOllama({
          userMessage:
            message,

          deterministicAnswer,

          intent:
            "INVOICE_NOT_FOUND",

          invoice:
            null,
        });

      return res
        .status(200)
        .json({
          success:
            true,

          intent:
            "INVOICE_NOT_FOUND",

          answer:
            ai.answer,

          invoice_number:
            invoiceNumber,

          ollama_used:
            ai.ollama_used,

          ollama_model:
            ai.ollama_model,

          ollama_fallback:
            ai.ollama_fallback,

          suggestions: [
            "Que signifie PENDING_REVIEW ?",
            "Comment relancer une facture ERP ?",
          ],
        });
    }

    /*
    |--------------------------------------------------------------------------
    | REPONSE METIER
    |--------------------------------------------------------------------------
    */

    let deterministicAnswer;

    switch (intent) {
      case "INVOICE_ERROR":
        deterministicAnswer =
          buildErrorAnswer(
            invoice,
          );
        break;

      case "INVOICE_RETRY":
        deterministicAnswer =
          buildRetryAnswer(
            invoice,
          );
        break;

      case "INVOICE_CONTINUE":
        deterministicAnswer =
          buildContinueAnswer(
            invoice,
          );
        break;

      case "INVOICE_STATUS":
      default:
        deterministicAnswer =
          buildStatusAnswer(
            invoice,
          );
        break;
    }

    /*
    |--------------------------------------------------------------------------
    | REFORMULATION OLLAMA
    |--------------------------------------------------------------------------
    */

    const ai =
      await maybeRewriteWithOllama({
        userMessage:
          message,

        deterministicAnswer,

        intent,

        invoice,
      });

    return res
      .status(200)
      .json({
        success:
          true,

        intent,

        answer:
          ai.answer,

        deterministic_answer:
          deterministicAnswer,

        ollama_used:
          ai.ollama_used,

        ollama_model:
          ai.ollama_model,

        ollama_fallback:
          ai.ollama_fallback,

        invoice:
          buildInvoiceSummary(
            invoice,
          ),

        action_url:
          `/client/invoices/${invoice.id}`,

        suggestions: [
          `Pourquoi la facture ${invoice.invoice_number} a échoué ?`,
          `La facture ${invoice.invoice_number} peut-elle continuer vers la signature ?`,
          "Que signifie PENDING_REVIEW ?",
        ],
      });
  } catch (error) {
    console.error(
      "askAssistant error:",
      error,
    );

    if (
      error.code === "EPARAM" ||
      error.name === "RequestError"
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          errorCode:
            "ASSISTANT_INVALID_PARAMETER",

          message:
            "Une donnée utilisée par l'assistant est invalide.",

          error:
            error.message,
        });
    }

    return res
      .status(500)
      .json({
        success:
          false,

        errorCode:
          "ASSISTANT_FAILED",

        message:
          "L'assistant n'a pas pu répondre pour le moment.",

        error:
          error.message,
      });
  }
}

/*
|--------------------------------------------------------------------------
| GET /api/assistant/health
|--------------------------------------------------------------------------
*/

async function assistantHealth(
  req,
  res,
) {
  try {
    getAuthenticatedUser(
      req,
    );

    const ollama =
      await getOllamaHealth();

    return res
      .status(200)
      .json({
        success:
          true,

        assistant:
          "UP",

        mode:
          ollama.available
            ? "HYBRID_SQL_OLLAMA"
            : "SQL_FALLBACK",

        ollama,
      });
  } catch (error) {
    return res
      .status(500)
      .json({
        success:
          false,

        assistant:
          "ERROR",

        message:
          error.message,
      });
  }
}

module.exports = {
  askAssistant,
  assistantHealth,
};