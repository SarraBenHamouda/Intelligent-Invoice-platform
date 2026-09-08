/*
|--------------------------------------------------------------------------
| AVATAR AI SERVICE - CLOUDFLARE WORKERS AI
|--------------------------------------------------------------------------
|
| Provider :
| Cloudflare Workers AI
|
| Modèle par défaut :
| @cf/bytedance/stable-diffusion-xl-lightning
|
| Variables .env :
|
| CLOUDFLARE_ACCOUNT_ID=...
| CLOUDFLARE_API_TOKEN=...
| CLOUDFLARE_IMAGE_MODEL=@cf/bytedance/stable-diffusion-xl-lightning
|
|--------------------------------------------------------------------------
*/

const DEFAULT_MODEL =
  process.env.CLOUDFLARE_IMAGE_MODEL ||
  "@cf/bytedance/stable-diffusion-xl-lightning";

/*
|--------------------------------------------------------------------------
| ENV
|--------------------------------------------------------------------------
*/

function getRequiredEnv(name) {
  const value =
    process.env[name];

  if (
    !value ||
    !String(value).trim()
  ) {
    const error =
      new Error(
        `${name}_MISSING`,
      );

    error.code =
      `${name}_MISSING`;

    throw error;
  }

  return String(
    value,
  ).trim();
}

/*
|--------------------------------------------------------------------------
| CLEAN VALUE
|--------------------------------------------------------------------------
*/

function cleanValue(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return "";
  }

  return String(
    value,
  ).trim();
}

/*
|--------------------------------------------------------------------------
| PRESET
|--------------------------------------------------------------------------
*/

function presetToSentence(
  preset,
) {
  const value =
    cleanValue(
      preset,
    ).toLowerCase();

  switch (value) {
    case "professional":
      return (
        "Professional business avatar, clean and polished, " +
        "suitable for a company profile."
      );

    case "creative":
      return (
        "Creative modern avatar, stylish and expressive, " +
        "suitable for a designer or creator profile."
      );

    case "casual":
      return (
        "Casual friendly avatar, natural and approachable."
      );

    case "elegant":
      return (
        "Elegant premium avatar, sophisticated clothing, " +
        "soft professional lighting and refined appearance."
      );

    case "minimal":
      return (
        "Minimal clean avatar, elegant and simple."
      );

    default:
      return (
        "Professional profile avatar, clean and visually appealing."
      );
  }
}

/*
|--------------------------------------------------------------------------
| BUILD PROMPT
|--------------------------------------------------------------------------
*/

function buildAvatarPrompt({
  prompt,
  description,
  preset,
  settings,
}) {
  const safeSettings =
    settings &&
    typeof settings ===
      "object"
      ? settings
      : {};

  const parts = [];

  const directPrompt =
    cleanValue(
      prompt,
    );

  const directDescription =
    cleanValue(
      description,
    );

  /*
  |--------------------------------------------------------------------------
  | DIRECT FRONTEND PROMPT
  |--------------------------------------------------------------------------
  */

  if (directPrompt) {
    parts.push(
      directPrompt,
    );
  }

  if (
    directDescription
  ) {
    parts.push(
      `Additional description: ${directDescription}.`,
    );
  }

  parts.push(
    presetToSentence(
      preset,
    ),
  );

  /*
  |--------------------------------------------------------------------------
  | SETTINGS
  |--------------------------------------------------------------------------
  */

  const gender =
    cleanValue(
      safeSettings.gender,
    );

  const skin =
    cleanValue(
      safeSettings.skin ||
        safeSettings.skinTone,
    );

  const glasses =
    cleanValue(
      safeSettings.glasses,
    );

  const hairStyle =
    cleanValue(
      safeSettings.hairStyle,
    );

  const hairColor =
    cleanValue(
      safeSettings.hairColor,
    );

  const facialHair =
    cleanValue(
      safeSettings.facialHair,
    );

  const outfitStyle =
    cleanValue(
      safeSettings.outfitStyle,
    );

  const outfitColor =
    cleanValue(
      safeSettings.outfitColor,
    );

  const outfitPattern =
    cleanValue(
      safeSettings.outfitPattern,
    );

  const expression =
    cleanValue(
      safeSettings.expression,
    );

  const background =
    cleanValue(
      safeSettings.background ||
        safeSettings.backgroundColor,
    );

  const accessories =
    cleanValue(
      safeSettings.accessories,
    );

  /*
  |--------------------------------------------------------------------------
  | PERSON
  |--------------------------------------------------------------------------
  */

  if (gender) {
    parts.push(
      `Gender presentation: ${gender}.`,
    );
  }

  if (skin) {
    parts.push(
      `Skin tone: ${skin}.`,
    );
  }

  /*
  |--------------------------------------------------------------------------
  | HAIR
  |--------------------------------------------------------------------------
  */

  if (
    hairStyle ||
    hairColor
  ) {
    parts.push(
      `Hair: ${[
        hairStyle,
        hairColor,
      ]
        .filter(Boolean)
        .join(" ")}.`,
    );
  }

  /*
  |--------------------------------------------------------------------------
  | FACIAL HAIR
  |--------------------------------------------------------------------------
  */

  if (
    facialHair &&
    facialHair !==
      "none"
  ) {
    parts.push(
      `Facial hair: ${facialHair}.`,
    );
  }

  /*
  |--------------------------------------------------------------------------
  | GLASSES
  |--------------------------------------------------------------------------
  */

  if (
    glasses &&
    glasses !==
      "none"
  ) {
    parts.push(
      `Eyewear: ${glasses}.`,
    );
  } else {
    parts.push(
      "No glasses.",
    );
  }

  /*
  |--------------------------------------------------------------------------
  | EXPRESSION
  |--------------------------------------------------------------------------
  */

  if (expression) {
    parts.push(
      `Facial expression: ${expression}.`,
    );
  }

  /*
  |--------------------------------------------------------------------------
  | OUTFIT
  |--------------------------------------------------------------------------
  */

  if (
    outfitStyle ||
    outfitColor ||
    outfitPattern
  ) {
    parts.push(
      `Outfit: ${[
        outfitStyle,
        outfitColor,
        outfitPattern,
      ]
        .filter(Boolean)
        .join(", ")}.`,
    );
  }

  /*
  |--------------------------------------------------------------------------
  | ACCESSORIES
  |--------------------------------------------------------------------------
  */

  if (accessories) {
    parts.push(
      `Accessories: ${accessories}.`,
    );
  }

  /*
  |--------------------------------------------------------------------------
  | BACKGROUND
  |--------------------------------------------------------------------------
  */

  if (background) {
    parts.push(
      `Background color/style: ${background}.`,
    );
  }

  /*
  |--------------------------------------------------------------------------
  | FINAL QUALITY
  |--------------------------------------------------------------------------
  */

  parts.push(
    "Create one square 1:1 profile avatar.",
  );

  parts.push(
    "One person only.",
  );

  parts.push(
    "Centered composition.",
  );

  parts.push(
    "Head and shoulders portrait.",
  );

  parts.push(
    "Face clearly visible.",
  );

  parts.push(
    "Clean professional lighting.",
  );

  parts.push(
    "Modern polished profile picture.",
  );

  parts.push(
    "High quality portrait.",
  );

  parts.push(
    "Simple elegant background.",
  );

  parts.push(
    "No text.",
  );

  parts.push(
    "No watermark.",
  );

  parts.push(
    "No logo.",
  );

  parts.push(
    "No extra people.",
  );

  return parts
    .map(
      (item) =>
        cleanValue(
          item,
        ),
    )
    .filter(Boolean)
    .join(" ");
}

/*
|--------------------------------------------------------------------------
| DETECT MIME TYPE FROM BUFFER
|--------------------------------------------------------------------------
*/

function detectMimeTypeFromBuffer(
  buffer,
) {
  if (
    !buffer ||
    buffer.length < 4
  ) {
    return (
      "application/octet-stream"
    );
  }

  /*
  |--------------------------------------------------------------------------
  | JPEG
  |--------------------------------------------------------------------------
  |
  | FF D8 FF
  |
  */

  if (
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }

  /*
  |--------------------------------------------------------------------------
  | PNG
  |--------------------------------------------------------------------------
  |
  | 89 50 4E 47
  |
  */

  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }

  /*
  |--------------------------------------------------------------------------
  | WEBP
  |--------------------------------------------------------------------------
  |
  | RIFF....WEBP
  |
  */

  if (
    buffer.length >= 12 &&
    buffer
      .subarray(
        0,
        4,
      )
      .toString() ===
      "RIFF" &&
    buffer
      .subarray(
        8,
        12,
      )
      .toString() ===
      "WEBP"
  ) {
    return "image/webp";
  }

  return (
    "application/octet-stream"
  );
}

/*
|--------------------------------------------------------------------------
| DETECT MIME TYPE FROM BASE64
|--------------------------------------------------------------------------
*/

function detectMimeTypeFromBase64(
  base64,
) {
  try {
    const cleanBase64 =
      String(
        base64 || "",
      )
        .replace(
          /^data:[^;]+;base64,/,
          "",
        )
        .trim();

    const buffer =
      Buffer.from(
        cleanBase64,
        "base64",
      );

    return (
      detectMimeTypeFromBuffer(
        buffer,
      )
    );
  } catch {
    return (
      "application/octet-stream"
    );
  }
}

/*
|--------------------------------------------------------------------------
| FILE EXTENSION
|--------------------------------------------------------------------------
*/

function getExtensionFromMimeType(
  mimeType,
) {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";

    case "image/webp":
      return "webp";

    case "image/png":
    default:
      return "png";
  }
}

/*
|--------------------------------------------------------------------------
| CLOUDFLARE ERROR
|--------------------------------------------------------------------------
*/

async function parseCloudflareError(
  response,
) {
  const contentType =
    response.headers.get(
      "content-type",
    ) || "";

  let payload =
    null;

  let rawText =
    "";

  try {
    if (
      contentType.includes(
        "application/json",
      )
    ) {
      payload =
        await response.json();
    } else {
      rawText =
        await response.text();
    }
  } catch {
    rawText =
      "";
  }

  const firstError =
    payload?.errors?.[0] ||
    null;

  const message =
    firstError?.message ||
    payload?.result?.error ||
    payload?.message ||
    rawText ||
    `Cloudflare AI request failed with status ${response.status}.`;

  const error =
    new Error(
      message,
    );

  error.status =
    response.status;

  error.code =
    firstError?.code ||
    payload?.code ||
    "CLOUDFLARE_AI_ERROR";

  error.details =
    payload ||
    rawText ||
    null;

  throw error;
}

/*
|--------------------------------------------------------------------------
| NORMALIZE BASE64
|--------------------------------------------------------------------------
*/

function normalizeBase64Image(
  value,
) {
  if (
    !value ||
    typeof value !==
      "string"
  ) {
    return null;
  }

  /*
  |--------------------------------------------------------------------------
  | DATA URL
  |--------------------------------------------------------------------------
  */

  if (
    value.startsWith(
      "data:image/",
    )
  ) {
    const separatorIndex =
      value.indexOf(",");

    if (
      separatorIndex ===
      -1
    ) {
      return null;
    }

    const metadata =
      value.slice(
        0,
        separatorIndex,
      );

    const base64 =
      value.slice(
        separatorIndex + 1,
      );

    const mimeMatch =
      metadata.match(
        /^data:([^;]+);base64$/i,
      );

    let mimeType =
      mimeMatch?.[1] ||
      detectMimeTypeFromBase64(
        base64,
      );

    if (
      !mimeType.startsWith(
        "image/",
      )
    ) {
      mimeType =
        "image/png";
    }

    return {
      base64,
      mimeType,
      imageDataUrl:
        `data:${mimeType};base64,${base64}`,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | RAW BASE64
  |--------------------------------------------------------------------------
  */

  let mimeType =
    detectMimeTypeFromBase64(
      value,
    );

  if (
    !mimeType.startsWith(
      "image/",
    )
  ) {
    mimeType =
      "image/png";
  }

  return {
    base64:
      value,

    mimeType,

    imageDataUrl:
      `data:${mimeType};base64,${value}`,
  };
}

/*
|--------------------------------------------------------------------------
| GENERATE AVATAR
|--------------------------------------------------------------------------
*/

async function generateAvatarWithAI({
  prompt,
  description,
  preset,
  settings,
}) {
  /*
  |--------------------------------------------------------------------------
  | CONFIG
  |--------------------------------------------------------------------------
  */

  const accountId =
    getRequiredEnv(
      "CLOUDFLARE_ACCOUNT_ID",
    );

  const apiToken =
    getRequiredEnv(
      "CLOUDFLARE_API_TOKEN",
    );

  const model =
    cleanValue(
      process.env
        .CLOUDFLARE_IMAGE_MODEL,
    ) ||
    DEFAULT_MODEL;

  /*
  |--------------------------------------------------------------------------
  | PROMPT
  |--------------------------------------------------------------------------
  */

  const finalPrompt =
    buildAvatarPrompt({
      prompt,
      description,
      preset,
      settings,
    });

  /*
  |--------------------------------------------------------------------------
  | ENDPOINT
  |--------------------------------------------------------------------------
  */

  const endpoint =
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

  /*
  |--------------------------------------------------------------------------
  | REQUEST
  |--------------------------------------------------------------------------
  */

  const response =
    await fetch(
      endpoint,
      {
        method:
          "POST",

        headers: {
          Authorization:
            `Bearer ${apiToken}`,

          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            prompt:
              finalPrompt,

            width:
              1024,

            height:
              1024,

            num_steps:
              4,

            guidance:
              7.5,
          }),
      },
    );

  /*
  |--------------------------------------------------------------------------
  | ERROR
  |--------------------------------------------------------------------------
  */

  if (
    !response.ok
  ) {
    await parseCloudflareError(
      response,
    );
  }

  /*
  |--------------------------------------------------------------------------
  | CONTENT TYPE
  |--------------------------------------------------------------------------
  */

  const contentType =
    response.headers.get(
      "content-type",
    ) || "";

  /*
  |--------------------------------------------------------------------------
  | CASE 1
  |
  | DIRECT BINARY IMAGE
  |--------------------------------------------------------------------------
  */

  if (
    contentType.startsWith(
      "image/",
    )
  ) {
    const arrayBuffer =
      await response.arrayBuffer();

    const buffer =
      Buffer.from(
        arrayBuffer,
      );

    /*
    |--------------------------------------------------------------------------
    | DON'T TRUST HEADER ONLY
    |--------------------------------------------------------------------------
    */

    const detectedMime =
      detectMimeTypeFromBuffer(
        buffer,
      );

    const mimeType =
      detectedMime.startsWith(
        "image/",
      )
        ? detectedMime
        : contentType;

    const base64 =
      buffer.toString(
        "base64",
      );

    return {
      provider:
        "cloudflare",

      model,

      promptUsed:
        finalPrompt,

      mimeType,

      extension:
        getExtensionFromMimeType(
          mimeType,
        ),

      imageBase64:
        base64,

      imageDataUrl:
        `data:${mimeType};base64,${base64}`,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | CASE 2
  |
  | JSON RESPONSE
  |--------------------------------------------------------------------------
  */

  let data =
    null;

  try {
    data =
      await response.json();
  } catch (
    jsonError
  ) {
    const error =
      new Error(
        "Cloudflare a retourné une réponse non exploitable.",
      );

    error.code =
      "CLOUDFLARE_INVALID_RESPONSE";

    error.details =
      jsonError?.message ||
      null;

    throw error;
  }

  /*
  |--------------------------------------------------------------------------
  | POSSIBLE IMAGE FIELDS
  |--------------------------------------------------------------------------
  */

  const maybeBase64 =
    data?.result?.image ||
    data?.result?.images?.[0] ||
    data?.image ||
    null;

  /*
  |--------------------------------------------------------------------------
  | NORMALIZE
  |--------------------------------------------------------------------------
  */

  const normalized =
    normalizeBase64Image(
      maybeBase64,
    );

  if (normalized) {
    return {
      provider:
        "cloudflare",

      model,

      promptUsed:
        finalPrompt,

      mimeType:
        normalized.mimeType,

      extension:
        getExtensionFromMimeType(
          normalized.mimeType,
        ),

      imageBase64:
        normalized.base64,

      imageDataUrl:
        normalized.imageDataUrl,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | NO IMAGE
  |--------------------------------------------------------------------------
  */

  const error =
    new Error(
      "Réponse Cloudflare invalide : image non trouvée.",
    );

  error.code =
    "CLOUDFLARE_IMAGE_NOT_FOUND";

  error.details =
    data;

  throw error;
}

/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
  buildAvatarPrompt,
  generateAvatarWithAI,
};