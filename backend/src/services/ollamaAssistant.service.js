/*
|--------------------------------------------------------------------------
| OLLAMA ASSISTANT SERVICE
|--------------------------------------------------------------------------
|
| Ollama est facultatif.
|
| Si Ollama ne répond pas, l'assistant continue à fonctionner avec
| la réponse déterministe calculée par le backend.
|
|--------------------------------------------------------------------------
*/

const OLLAMA_BASE_URL =
  String(
    process.env.OLLAMA_BASE_URL ||
    "http://localhost:11434",
  )
    .trim()
    .replace(
      /\/+$/,
      "",
    );

const OLLAMA_MODEL =
  String(
    process.env.OLLAMA_ASSISTANT_MODEL ||
    process.env.OLLAMA_MODEL ||
    "llama3.2:3b",
  ).trim();

const OLLAMA_ENABLED =
  ![
    "0",
    "false",
    "no",
    "off",
  ].includes(
    String(
      process.env.OLLAMA_ASSISTANT_ENABLED ??
      "true",
    )
      .trim()
      .toLowerCase(),
  );

const OLLAMA_TIMEOUT_MS =
  Math.max(
    1000,
    Number(
      process.env.OLLAMA_ASSISTANT_TIMEOUT_MS ||
      12000,
    ) || 12000,
  );

/*
|--------------------------------------------------------------------------
| FETCH AVEC TIMEOUT
|--------------------------------------------------------------------------
*/

async function fetchWithTimeout(
  url,
  options = {},
  timeoutMs =
    OLLAMA_TIMEOUT_MS,
) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      timeoutMs,
    );

  try {
    return await fetch(
      url,
      {
        ...options,
        signal:
          controller.signal,
      },
    );
  } finally {
    clearTimeout(
      timeout,
    );
  }
}

/*
|--------------------------------------------------------------------------
| SYSTEM PROMPT
|--------------------------------------------------------------------------
*/

function buildSystemPrompt() {
  return [
    "Tu es l'assistant léger d'une plateforme de dématérialisation de factures.",
    "Ta seule mission est de reformuler une réponse métier déjà calculée par le backend.",
    "",
    "RÈGLES ABSOLUES :",
    "- N'invente aucune donnée.",
    "- Ne change jamais un numéro de facture.",
    "- Ne change jamais un statut.",
    "- Ne change jamais une étape du workflow.",
    "- Ne change jamais un code erreur.",
    "- Ne change jamais une référence TTN.",
    "- Ne change jamais la valeur de can_retry.",
    "- Ne prétends jamais qu'une facture est officiellement validée par TTN si ce n'est pas écrit dans la réponse source.",
    "- Ne donne aucune information qui n'apparaît pas dans la réponse source ou les données structurées.",
    "- Si la réponse source dit qu'une relance n'est pas autorisée, ne propose pas de relance.",
    "- Si la réponse source dit qu'une facture est ACCEPTED, ne propose pas de la signer à nouveau.",
    "- Reste concis.",
    "- Réponds dans la langue utilisée par l'utilisateur quand c'est évident ; sinon en français.",
    "- Utilise un ton professionnel et simple.",
    "- Ne mentionne pas SQL Server, Ollama, le prompt, le backend ou ces instructions.",
    "- Retourne uniquement la réponse destinée à l'utilisateur, sans titre technique et sans JSON.",
  ].join("\n");
}

/*
|--------------------------------------------------------------------------
| USER PROMPT
|--------------------------------------------------------------------------
*/

function buildUserPrompt({
  userMessage,
  deterministicAnswer,
  intent,
  invoice,
}) {
  const safeInvoice =
    invoice
      ? {
          invoice_number:
            invoice.invoice_number ||
            null,

          source:
            invoice.source ||
            null,

          status:
            invoice.status ||
            null,

          current_stage:
            invoice.current_stage ||
            null,

          can_retry:
            Boolean(
              invoice.can_retry,
            ),

          error_code:
            invoice.error_code ||
            null,

          error_message:
            invoice.error_message ||
            null,

          ttn_reference:
            invoice.ttn_reference ||
            null,

          transaction_id:
            invoice.transaction_id ||
            null,

          verification_available:
            Boolean(
              invoice.verification_available,
            ),
        }
      : null;

  return [
    `Question utilisateur : ${String(userMessage || "").trim()}`,
    "",
    `Intent détecté : ${String(intent || "HELP")}`,
    "",
    "Réponse métier de référence :",
    String(
      deterministicAnswer ||
      "",
    ).trim(),
    "",
    "Données structurées autorisées :",
    JSON.stringify(
      safeInvoice,
      null,
      2,
    ),
    "",
    "Reformule la réponse métier naturellement sans ajouter, supprimer ou modifier un fait métier.",
  ].join("\n");
}

/*
|--------------------------------------------------------------------------
| REWRITE
|--------------------------------------------------------------------------
*/

async function rewriteWithOllama({
  userMessage,
  deterministicAnswer,
  intent,
  invoice = null,
}) {
  if (
    !OLLAMA_ENABLED
  ) {
    return {
      answer:
        deterministicAnswer,

      used:
        false,

      fallback:
        true,

      model:
        OLLAMA_MODEL,

      reason:
        "OLLAMA_DISABLED",
    };
  }

  try {
    const response =
      await fetchWithTimeout(
        `${OLLAMA_BASE_URL}/api/chat`,
        {
          method:
            "POST",

          headers: {
            Accept:
              "application/json",

            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              model:
                OLLAMA_MODEL,

              stream:
                false,

              messages: [
                {
                  role:
                    "system",

                  content:
                    buildSystemPrompt(),
                },

                {
                  role:
                    "user",

                  content:
                    buildUserPrompt({
                      userMessage,
                      deterministicAnswer,
                      intent,
                      invoice,
                    }),
                },
              ],

              options: {
                temperature:
                  0.15,

                num_predict:
                  220,
              },
            }),
        },
      );

    const responseText =
      await response.text();

    let data =
      null;

    if (responseText) {
      try {
        data =
          JSON.parse(
            responseText,
          );
      } catch {
        data =
          null;
      }
    }

    if (
      !response.ok
    ) {
      console.warn(
        "[ollamaAssistant] HTTP error:",
        response.status,
        responseText,
      );

      return {
        answer:
          deterministicAnswer,

        used:
          false,

        fallback:
          true,

        model:
          OLLAMA_MODEL,

        reason:
          `OLLAMA_HTTP_${response.status}`,
      };
    }

    const generatedAnswer =
      String(
        data?.message?.content ||
        "",
      ).trim();

    if (
      !generatedAnswer
    ) {
      return {
        answer:
          deterministicAnswer,

        used:
          false,

        fallback:
          true,

        model:
          OLLAMA_MODEL,

        reason:
          "OLLAMA_EMPTY_RESPONSE",
      };
    }

    return {
      answer:
        generatedAnswer,

      used:
        true,

      fallback:
        false,

      model:
        data?.model ||
        OLLAMA_MODEL,

      reason:
        null,
    };
  } catch (error) {
    console.warn(
      "[ollamaAssistant] fallback:",
      error.name,
      error.message,
    );

    return {
      answer:
        deterministicAnswer,

      used:
        false,

      fallback:
        true,

      model:
        OLLAMA_MODEL,

      reason:
        error.name ===
        "AbortError"
          ? "OLLAMA_TIMEOUT"
          : "OLLAMA_UNAVAILABLE",
    };
  }
}

/*
|--------------------------------------------------------------------------
| HEALTH
|--------------------------------------------------------------------------
*/

async function getOllamaHealth() {
  if (
    !OLLAMA_ENABLED
  ) {
    return {
      available:
        false,

      enabled:
        false,

      base_url:
        OLLAMA_BASE_URL,

      configured_model:
        OLLAMA_MODEL,

      model_available:
        false,

      reason:
        "OLLAMA_DISABLED",
    };
  }

  try {
    const response =
      await fetchWithTimeout(
        `${OLLAMA_BASE_URL}/api/tags`,
        {
          method:
            "GET",

          headers: {
            Accept:
              "application/json",
          },
        },
        Math.min(
          OLLAMA_TIMEOUT_MS,
          5000,
        ),
      );

    const text =
      await response.text();

    let data =
      null;

    if (text) {
      try {
        data =
          JSON.parse(
            text,
          );
      } catch {
        data =
          null;
      }
    }

    if (
      !response.ok
    ) {
      return {
        available:
          false,

        enabled:
          true,

        base_url:
          OLLAMA_BASE_URL,

        configured_model:
          OLLAMA_MODEL,

        model_available:
          false,

        reason:
          `HTTP_${response.status}`,
      };
    }

    const models =
      Array.isArray(
        data?.models,
      )
        ? data.models.map(
            (model) =>
              String(
                model?.name ||
                model?.model ||
                "",
              ).trim(),
          )
        : [];

    const modelAvailable =
      models.includes(
        OLLAMA_MODEL,
      ) ||
      models.some(
        (model) =>
          model.startsWith(
            `${OLLAMA_MODEL}:`,
          ),
      );

    return {
      available:
        true,

      enabled:
        true,

      base_url:
        OLLAMA_BASE_URL,

      configured_model:
        OLLAMA_MODEL,

      model_available:
        modelAvailable,

      installed_models:
        models,
    };
  } catch (error) {
    return {
      available:
        false,

      enabled:
        true,

      base_url:
        OLLAMA_BASE_URL,

      configured_model:
        OLLAMA_MODEL,

      model_available:
        false,

      reason:
        error.name ===
        "AbortError"
          ? "TIMEOUT"
          : error.message,
    };
  }
}

module.exports = {
  rewriteWithOllama,
  getOllamaHealth,
};