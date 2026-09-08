import {
  useEffect,
  useRef,
} from "react";

const SCRIPT_ID =
  "google-recaptcha-v2-script";

let scriptPromise =
  null;

function loadRecaptcha() {
  if (
    window.grecaptcha &&
    typeof window.grecaptcha.render === "function"
  ) {
    return Promise.resolve(
      window.grecaptcha,
    );
  }

  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise =
    new Promise(
      (resolve, reject) => {
        const finishLoading =
          () => {
            let attempts =
              0;

            const timer =
              window.setInterval(
                () => {
                  attempts += 1;

                  if (
                    window.grecaptcha &&
                    typeof window.grecaptcha.render ===
                      "function"
                  ) {
                    window.clearInterval(
                      timer,
                    );

                    resolve(
                      window.grecaptcha,
                    );

                    return;
                  }

                  if (
                    attempts >= 120
                  ) {
                    window.clearInterval(
                      timer,
                    );

                    scriptPromise =
                      null;

                    reject(
                      new Error(
                        "Google reCAPTCHA n'a pas pu être chargé.",
                      ),
                    );
                  }
                },
                100,
              );
          };

        const existing =
          document.getElementById(
            SCRIPT_ID,
          );

        if (existing) {
          finishLoading();
          return;
        }

        const script =
          document.createElement(
            "script",
          );

        script.id =
          SCRIPT_ID;

        script.src =
          "https://www.google.com/recaptcha/api.js?render=explicit&hl=fr";

        script.async =
          true;

        script.defer =
          true;

        script.onload =
          finishLoading;

        script.onerror =
          () => {
            scriptPromise =
              null;

            reject(
              new Error(
                "Impossible de charger Google reCAPTCHA. Vérifiez votre connexion ou les extensions du navigateur.",
              ),
            );
          };

        document.head.appendChild(
          script,
        );
      },
    );

  return scriptPromise;
}

function RecaptchaV2({
  visible,
  onVerified,
  onExpired,
  onError,
}) {
  const containerRef =
    useRef(null);

  const widgetIdRef =
    useRef(null);

  const onVerifiedRef =
    useRef(onVerified);

  const onExpiredRef =
    useRef(onExpired);

  const onErrorRef =
    useRef(onError);

  useEffect(() => {
    onVerifiedRef.current =
      onVerified;
  }, [onVerified]);

  useEffect(() => {
    onExpiredRef.current =
      onExpired;
  }, [onExpired]);

  useEffect(() => {
    onErrorRef.current =
      onError;
  }, [onError]);

  useEffect(() => {
    if (!visible) {
      return undefined;
    }

    let cancelled =
      false;

    async function renderCaptcha() {
      try {
        const siteKey =
          String(
            import.meta.env
              .VITE_RECAPTCHA_SITE_KEY ||
              "",
          ).trim();

        if (!siteKey) {
          throw new Error(
            "VITE_RECAPTCHA_SITE_KEY n'est pas configurée.",
          );
        }

        const grecaptcha =
          await loadRecaptcha();

        if (
          cancelled ||
          !containerRef.current
        ) {
          return;
        }

        /*
        |--------------------------------------------------------------------------
        | RESET OLD WIDGET
        |--------------------------------------------------------------------------
        */

        if (
          widgetIdRef.current !==
          null
        ) {
          try {
            grecaptcha.reset(
              widgetIdRef.current,
            );
          } catch {
            widgetIdRef.current =
              null;
          }
        }

        /*
        |--------------------------------------------------------------------------
        | EMPTY CONTAINER
        |--------------------------------------------------------------------------
        */

        containerRef.current.innerHTML =
          "";

        /*
        |--------------------------------------------------------------------------
        | RENDER
        |--------------------------------------------------------------------------
        */

        widgetIdRef.current =
          grecaptcha.render(
            containerRef.current,
            {
              sitekey:
                siteKey,

              theme:
                "light",

              size:
                "normal",

              callback:
                (token) => {
                  if (!token) {
                    onErrorRef.current?.(
                      new Error(
                        "Google reCAPTCHA n'a pas retourné de jeton.",
                      ),
                    );

                    return;
                  }

                  onVerifiedRef.current?.(
                    token,
                  );
                },

              "expired-callback":
                () => {
                  onExpiredRef.current?.();
                },

              "error-callback":
                () => {
                  onErrorRef.current?.(
                    new Error(
                      "Google reCAPTCHA n'a pas pu terminer la vérification.",
                    ),
                  );
                },
            },
          );
      } catch (error) {
        if (!cancelled) {
          onErrorRef.current?.(
            error,
          );
        }
      }
    }

    renderCaptcha();

    return () => {
      cancelled =
        true;
    };
  }, [visible]);

  if (!visible) {
    return null;
  }

  return (
    <div className="password-reset-recaptcha">
      <p>
        Confirmez que vous n'êtes pas un robot.
      </p>

      <div
        ref={containerRef}
      />
    </div>
  );
}

export default RecaptchaV2;