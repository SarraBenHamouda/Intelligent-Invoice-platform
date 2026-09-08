/*
|--------------------------------------------------------------------------
| AVATAR SERVICE
|--------------------------------------------------------------------------
|
| Communication frontend <-> backend pour :
|
| POST /api/avatar/generate-ai
|
| Le backend peut retourner :
|
| image_base64
| image_data_url
| mime_type
| provider
| model
| prompt
|
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| API BASE URL
|--------------------------------------------------------------------------
*/

const CONFIGURED_API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  "";

const API_BASE_URL =
  CONFIGURED_API_BASE_URL ||
  "http://localhost:3000/api";

/*
|--------------------------------------------------------------------------
| TOKEN
|--------------------------------------------------------------------------
*/

function getToken() {
  return (
    localStorage.getItem(
      "auth_token",
    ) ||
    localStorage.getItem(
      "token",
    ) ||
    localStorage.getItem(
      "accessToken",
    ) ||
    localStorage.getItem(
      "authToken",
    ) ||
    ""
  );
}

/*
|--------------------------------------------------------------------------
| AUTH HEADERS
|--------------------------------------------------------------------------
*/

function getAuthorizationHeaders() {
  const token =
    getToken();

  if (!token) {
    throw new Error(
      "Utilisateur non authentifié.",
    );
  }

  return {
    Authorization:
      `Bearer ${token}`,
  };
}

/*
|--------------------------------------------------------------------------
| PARSE RESPONSE
|--------------------------------------------------------------------------
*/

async function parseResponse(
  response,
) {
  let data =
    null;

  try {
    data =
      await response.json();
  } catch {
    data =
      null;
  }

  if (!response.ok) {
    const error =
      new Error(
        data?.message ||
          data?.error ||
          `Erreur HTTP ${response.status}`,
      );

    error.status =
      response.status;

    error.code =
      data?.errorCode ||
      data?.code ||
      "AVATAR_REQUEST_FAILED";

    error.details =
      data ||
      null;

    throw error;
  }

  return data;
}

/*
|--------------------------------------------------------------------------
| MIME TYPE -> EXTENSION
|--------------------------------------------------------------------------
*/

function getExtensionFromMimeType(
  mimeType,
) {
  const type =
    String(
      mimeType ||
        "",
    )
      .trim()
      .toLowerCase();

  switch (type) {
    case "image/jpeg":
    case "image/jpg":
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
| CLEAN BASE64
|--------------------------------------------------------------------------
*/

function cleanBase64(
  base64,
) {
  const value =
    String(
      base64 ||
        "",
    ).trim();

  if (
    value.startsWith(
      "data:",
    )
  ) {
    const commaIndex =
      value.indexOf(
        ",",
      );

    if (
      commaIndex !==
      -1
    ) {
      return value.slice(
        commaIndex + 1,
      );
    }
  }

  return value;
}

/*
|--------------------------------------------------------------------------
| BASE64 -> FILE
|--------------------------------------------------------------------------
*/

function base64ToFile(
  base64,
  mimeType =
    "image/png",
) {
  const normalizedBase64 =
    cleanBase64(
      base64,
    );

  if (
    !normalizedBase64
  ) {
    throw new Error(
      "Image Base64 vide.",
    );
  }

  let binary;

  try {
    binary =
      window.atob(
        normalizedBase64,
      );
  } catch {
    throw new Error(
      "L'image Base64 retournée par le serveur est invalide.",
    );
  }

  const bytes =
    new Uint8Array(
      binary.length,
    );

  for (
    let index = 0;
    index <
    binary.length;
    index += 1
  ) {
    bytes[index] =
      binary.charCodeAt(
        index,
      );
  }

  const normalizedMimeType =
    String(
      mimeType ||
        "image/png",
    )
      .trim()
      .toLowerCase();

  const extension =
    getExtensionFromMimeType(
      normalizedMimeType,
    );

  return new File(
    [
      bytes,
    ],
    `avatar-ai-${Date.now()}.${extension}`,
    {
      type:
        normalizedMimeType,
    },
  );
}

/*
|--------------------------------------------------------------------------
| BUILD DATA URL
|--------------------------------------------------------------------------
*/

function buildImageDataUrl(
  base64,
  mimeType,
) {
  const normalizedBase64 =
    cleanBase64(
      base64,
    );

  const normalizedMimeType =
    mimeType ||
    "image/png";

  return `data:${normalizedMimeType};base64,${normalizedBase64}`;
}

/*
|--------------------------------------------------------------------------
| GENERATE AI AVATAR
|--------------------------------------------------------------------------
*/

export async function generateAiAvatar({
  prompt,
  description,
  preset,
  settings,
}) {
  /*
  |--------------------------------------------------------------------------
  | VALIDATION
  |--------------------------------------------------------------------------
  */

  const normalizedPrompt =
    String(
      prompt ||
        "",
    ).trim();

  if (
    !normalizedPrompt
  ) {
    throw new Error(
      "Description de l'avatar manquante.",
    );
  }

  /*
  |--------------------------------------------------------------------------
  | REQUEST
  |--------------------------------------------------------------------------
  */

  const response =
    await fetch(
      `${API_BASE_URL}/avatar/generate-ai`,
      {
        method:
          "POST",

        headers: {
          ...getAuthorizationHeaders(),

          Accept:
            "application/json",

          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            prompt:
              normalizedPrompt,

            description:
              String(
                description ||
                  "",
              ).trim(),

            preset:
              preset ||
              "professional",

            settings:
              settings &&
              typeof settings ===
                "object"
                ? settings
                : {},
          }),
      },
    );

  /*
  |--------------------------------------------------------------------------
  | RESPONSE
  |--------------------------------------------------------------------------
  */

  const data =
    await parseResponse(
      response,
    );

  /*
  |--------------------------------------------------------------------------
  | CHECK SUCCESS
  |--------------------------------------------------------------------------
  */

  if (
    data?.success ===
    false
  ) {
    throw new Error(
      data?.message ||
        "La génération de l'avatar a échoué.",
    );
  }

  /*
  |--------------------------------------------------------------------------
  | IMAGE DATA
  |--------------------------------------------------------------------------
  */

  const imageBase64 =
    data?.image_base64 ||
    data?.imageBase64 ||
    "";

  const mimeType =
    data?.mime_type ||
    data?.mimeType ||
    "image/png";

  const backendDataUrl =
    data?.image_data_url ||
    data?.imageDataUrl ||
    "";

  /*
  |--------------------------------------------------------------------------
  | NO IMAGE
  |--------------------------------------------------------------------------
  */

  if (
    !imageBase64 &&
    !backendDataUrl
  ) {
    throw new Error(
      "Le backend IA n'a retourné aucune image.",
    );
  }

  /*
  |--------------------------------------------------------------------------
  | GET BASE64
  |--------------------------------------------------------------------------
  */

  let finalBase64 =
    imageBase64;

  if (
    !finalBase64 &&
    backendDataUrl
  ) {
    finalBase64 =
      cleanBase64(
        backendDataUrl,
      );
  }

  /*
  |--------------------------------------------------------------------------
  | FILE
  |--------------------------------------------------------------------------
  */

  const file =
    base64ToFile(
      finalBase64,
      mimeType,
    );

  /*
  |--------------------------------------------------------------------------
  | DATA URL
  |--------------------------------------------------------------------------
  */

  const imageDataUrl =
    backendDataUrl ||
    buildImageDataUrl(
      finalBase64,
      mimeType,
    );

  /*
  |--------------------------------------------------------------------------
  | FINAL OBJECT
  |--------------------------------------------------------------------------
  |
  | AvatarCreator.jsx comprend directement :
  |
  | file
  | url
  | imageDataUrl
  | imageBase64
  | mimeType
  | provider
  | model
  |
  |--------------------------------------------------------------------------
  */

  return {
    success:
      true,

    file,

    /*
    | Nous utilisons directement le data URL.
    | Ainsi nous évitons de créer un blob URL inutile ici.
    */

    url:
      imageDataUrl,

    imageDataUrl,

    image_data_url:
      imageDataUrl,

    imageBase64:
      finalBase64,

    image_base64:
      finalBase64,

    mimeType,

    mime_type:
      mimeType,

    provider:
      data?.provider ||
      "cloudflare",

    model:
      data?.model ||
      "",

    prompt:
      data?.prompt ||
      normalizedPrompt,

    message:
      data?.message ||
      "Avatar IA généré avec succès.",

    userId:
      data?.user_id ||
      null,

    organizationId:
      data?.organization_id ||
      null,
  };
}

/*
|--------------------------------------------------------------------------
| OPTIONAL EXPORTS
|--------------------------------------------------------------------------
*/

export {
  API_BASE_URL,
  base64ToFile,
  getExtensionFromMimeType,
};