const RECAPTCHA_SCRIPT_ID =
  "google-recaptcha-v3-script";

let recaptchaLoadPromise =
  null;

/*
|--------------------------------------------------------------------------
| SITE KEY
|--------------------------------------------------------------------------
*/

export function getRecaptchaSiteKey() {
  return String(
    import.meta.env
      .VITE_RECAPTCHA_SITE_KEY ||
      "",
  ).trim();
}

/*
|--------------------------------------------------------------------------
| CHECK CONFIG
|--------------------------------------------------------------------------
*/

export function isRecaptchaConfigured() {
  return Boolean(
    getRecaptchaSiteKey(),
  );
}

/*
|--------------------------------------------------------------------------
| LOAD GOOGLE RECAPTCHA SCRIPT
|--------------------------------------------------------------------------
*/

export function loadRecaptcha() {
  const siteKey =
    getRecaptchaSiteKey();

  if (!siteKey) {
    return Promise.reject(
      new Error(
        "VITE_RECAPTCHA_SITE_KEY n'est pas configurée.",
      ),
    );
  }

  /*
  |--------------------------------------------------------------------------
  | ALREADY AVAILABLE
  |--------------------------------------------------------------------------
  */

  if (
    window.grecaptcha &&
    typeof window.grecaptcha
      .execute ===
      "function"
  ) {
    return Promise.resolve(
      window.grecaptcha,
    );
  }

  /*
  |--------------------------------------------------------------------------
  | ALREADY LOADING
  |--------------------------------------------------------------------------
  */

  if (
    recaptchaLoadPromise
  ) {
    return recaptchaLoadPromise;
  }

  /*
  |--------------------------------------------------------------------------
  | LOAD SCRIPT
  |--------------------------------------------------------------------------
  */

  recaptchaLoadPromise =
    new Promise(
      (
        resolve,
        reject,
      ) => {
        const existingScript =
          document.getElementById(
            RECAPTCHA_SCRIPT_ID,
          );

        const waitForRecaptcha =
          () => {
            let attempts =
              0;

            const maxAttempts =
              100;

            const interval =
              window.setInterval(
                () => {
                  attempts +=
                    1;

                  if (
                    window.grecaptcha
                  ) {
                    window.clearInterval(
                      interval,
                    );

                    resolve(
                      window.grecaptcha,
                    );

                    return;
                  }

                  if (
                    attempts >=
                    maxAttempts
                  ) {
                    window.clearInterval(
                      interval,
                    );

                    recaptchaLoadPromise =
                      null;

                    reject(
                      new Error(
                        "Google reCAPTCHA n'a pas pu être chargé.",
                      ),
                    );
                  }
                },
                50,
              );
          };

        if (
          existingScript
        ) {
          waitForRecaptcha();
          return;
        }

        const script =
          document.createElement(
            "script",
          );

        script.id =
          RECAPTCHA_SCRIPT_ID;

        script.src =
          `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(
            siteKey,
          )}`;

        script.async =
          true;

        script.defer =
          true;

        script.onload =
          () => {
            waitForRecaptcha();
          };

        script.onerror =
          () => {
            recaptchaLoadPromise =
              null;

            reject(
              new Error(
                "Impossible de charger Google reCAPTCHA.",
              ),
            );
          };

        document.head.appendChild(
          script,
        );
      },
    );

  return recaptchaLoadPromise;
}

/*
|--------------------------------------------------------------------------
| EXECUTE RECAPTCHA V3
|--------------------------------------------------------------------------
*/

export async function executeRecaptcha(
  action,
) {
  const siteKey =
    getRecaptchaSiteKey();

  if (!siteKey) {
    throw new Error(
      "La clé publique reCAPTCHA n'est pas configurée.",
    );
  }

  const normalizedAction =
    String(
      action ||
        "authentication",
    )
      .trim()
      .toLowerCase()
      .replace(
        /[^a-z0-9_]/g,
        "_",
      );

  const grecaptcha =
    await loadRecaptcha();

  /*
  |--------------------------------------------------------------------------
  | WAIT UNTIL READY
  |--------------------------------------------------------------------------
  */

  await new Promise(
    (
      resolve,
      reject,
    ) => {
      try {
        grecaptcha.ready(
          resolve,
        );
      } catch (error) {
        reject(
          error,
        );
      }
    },
  );

  /*
  |--------------------------------------------------------------------------
  | GENERATE TOKEN
  |--------------------------------------------------------------------------
  */

  const token =
    await grecaptcha.execute(
      siteKey,
      {
        action:
          normalizedAction,
      },
    );

  if (!token) {
    throw new Error(
      "Google reCAPTCHA n'a pas retourné de jeton.",
    );
  }

  return token;
}