const nodemailer =
  require("nodemailer");

/*
|--------------------------------------------------------------------------
| ENV HELPERS
|--------------------------------------------------------------------------
*/

function getRequiredEnvironmentVariable(
  name,
) {
  const value =
    String(
      process.env[name] ||
        "",
    ).trim();

  if (!value) {
    throw new Error(
      `Variable d'environnement manquante : ${name}`,
    );
  }

  return value;
}

/*
|--------------------------------------------------------------------------
| ESCAPE HTML
|--------------------------------------------------------------------------
*/

function escapeHtml(
  value,
) {
  return String(
    value || "",
  )
    .replace(
      /&/g,
      "&amp;",
    )
    .replace(
      /</g,
      "&lt;",
    )
    .replace(
      />/g,
      "&gt;",
    )
    .replace(
      /"/g,
      "&quot;",
    )
    .replace(
      /'/g,
      "&#039;",
    );
}

/*
|--------------------------------------------------------------------------
| TRANSPORTER
|--------------------------------------------------------------------------
*/

function createTransporter() {
  const host =
    getRequiredEnvironmentVariable(
      "SMTP_HOST",
    );

  const port =
    Number(
      process.env
        .SMTP_PORT ||
        587,
    );

  const secure =
    String(
      process.env
        .SMTP_SECURE ||
        "false",
    )
      .trim()
      .toLowerCase() ===
    "true";

  const user =
    getRequiredEnvironmentVariable(
      "SMTP_USER",
    );

  const password =
    getRequiredEnvironmentVariable(
      "SMTP_PASSWORD",
    );

  return nodemailer.createTransport({
    host,

    port,

    secure,

    auth: {
      user,

      pass:
        password,
    },
  });
}

/*
|--------------------------------------------------------------------------
| MAIL FROM
|--------------------------------------------------------------------------
*/

function getMailFrom() {
  return String(
    process.env
      .SMTP_FROM ||
      process.env
        .SMTP_USER ||
      "",
  ).trim();
}

/*
|--------------------------------------------------------------------------
| PASSWORD RESET EMAIL
|--------------------------------------------------------------------------
*/

async function sendPasswordResetEmail({
  email,
  firstName,
  resetUrl,
  expiresInMinutes,
}) {
  const transporter =
    createTransporter();

  const from =
    getMailFrom();

  const safeFirstName =
    String(
      firstName ||
        "",
    ).trim();

  const greeting =
    safeFirstName
      ? `Bonjour ${safeFirstName},`
      : "Bonjour,";

  const subject =
    "Réinitialisation de votre mot de passe";

  const text = `
${greeting}

Nous avons reçu une demande de réinitialisation du mot de passe de votre compte Ténor Afrique.

Utilisez le lien suivant :

${resetUrl}

Ce lien est valable pendant ${expiresInMinutes} minutes et ne peut être utilisé qu'une seule fois.

Si vous n'avez pas demandé cette réinitialisation, vous pouvez ignorer cet e-mail.

Ténor Afrique
`.trim();

  const html = `
<!DOCTYPE html>

<html lang="fr">
<head>
  <meta charset="UTF-8" />

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  />

  <title>
    Réinitialisation du mot de passe
  </title>
</head>

<body
  style="
    margin:0;
    padding:0;
    background:#f4f6f8;
    font-family:Arial,Helvetica,sans-serif;
    color:#172033;
  "
>
  <table
    role="presentation"
    width="100%"
    cellspacing="0"
    cellpadding="0"
    border="0"
    style="padding:32px 16px;"
  >
    <tr>
      <td align="center">
        <table
          role="presentation"
          width="100%"
          cellspacing="0"
          cellpadding="0"
          border="0"
          style="
            max-width:560px;
            background:#ffffff;
            border-radius:16px;
            overflow:hidden;
            box-shadow:0 12px 30px rgba(15,23,42,.08);
          "
        >
          <tr>
            <td
              style="
                padding:28px 32px;
                background:#111827;
                color:#ffffff;
              "
            >
              <div
                style="
                  font-size:13px;
                  letter-spacing:.08em;
                  text-transform:uppercase;
                  opacity:.75;
                "
              >
                Ténor Afrique
              </div>

              <h1
                style="
                  margin:10px 0 0;
                  font-size:26px;
                  line-height:1.25;
                "
              >
                Réinitialisation du mot de passe
              </h1>
            </td>
          </tr>

          <tr>
            <td
              style="
                padding:32px;
                font-size:15px;
                line-height:1.7;
              "
            >
              <p style="margin-top:0;">
                ${escapeHtml(greeting)}
              </p>

              <p>
                Nous avons reçu une demande de
                réinitialisation du mot de passe
                de votre compte.
              </p>

              <p
                style="
                  margin:28px 0;
                  text-align:center;
                "
              >
                <a
                  href="${escapeHtml(resetUrl)}"
                  style="
                    display:inline-block;
                    padding:14px 24px;
                    background:#111827;
                    color:#ffffff;
                    text-decoration:none;
                    border-radius:10px;
                    font-weight:700;
                  "
                >
                  Réinitialiser mon mot de passe
                </a>
              </p>

              <p>
                Ce lien est valable pendant
                <strong>
                  ${expiresInMinutes} minutes
                </strong>
                et ne peut être utilisé qu'une seule fois.
              </p>

              <p
                style="
                  color:#667085;
                  font-size:13px;
                  margin-bottom:0;
                "
              >
                Si vous n'avez pas demandé cette
                réinitialisation, ignorez simplement
                cet e-mail.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>

</html>
`.trim();

  const result =
    await transporter.sendMail({
      from,

      to:
        email,

      subject,

      text,

      html,
    });

  return {
    messageId:
      result.messageId,
  };
}

/*
|--------------------------------------------------------------------------
| CONTACT SUBJECT
|--------------------------------------------------------------------------
*/

function getContactSubjectLabel(
  subject,
) {
  const labels = {
    demo:
      "Demande de démonstration",

    integration:
      "Intégration ERP",

    signature:
      "Signature électronique",

    ttn:
      "Transmission TTN",

    support:
      "Support technique",

    other:
      "Autre demande",
  };

  return (
    labels[subject] ||
    "Demande de contact"
  );
}

/*
|--------------------------------------------------------------------------
| CONTACT EMAIL
|--------------------------------------------------------------------------
*/

async function sendContactEmail({
  name,
  email,
  company,
  subject,
  message,
}) {
  const transporter =
    createTransporter();

  const from =
    getMailFrom();

  /*
  |--------------------------------------------------------------------------
  | DESTINATION
  |--------------------------------------------------------------------------
  */

  const recipient =
    String(
      process.env
        .CONTACT_RECEIVER_EMAIL ||
        process.env
          .SMTP_USER ||
        "",
    ).trim();

  if (!recipient) {
    throw new Error(
      "CONTACT_RECEIVER_EMAIL ou SMTP_USER doit être configuré.",
    );
  }

  const subjectLabel =
    getContactSubjectLabel(
      subject,
    );

  const mailSubject =
    `[Contact Ténor] ${subjectLabel} - ${name}`;

  /*
  |--------------------------------------------------------------------------
  | TEXT
  |--------------------------------------------------------------------------
  */

  const text = `
Nouveau message depuis le formulaire de contact Ténor Afrique.

Nom : ${name}
E-mail : ${email}
Entreprise : ${company || "Non renseignée"}
Sujet : ${subjectLabel}

Message :
${message}
`.trim();

  /*
  |--------------------------------------------------------------------------
  | HTML
  |--------------------------------------------------------------------------
  */

  const html = `
<!DOCTYPE html>

<html lang="fr">
<head>
  <meta charset="UTF-8" />

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  />

  <title>
    Nouveau message de contact
  </title>
</head>

<body
  style="
    margin:0;
    padding:0;
    background:#f4f6f8;
    font-family:Arial,Helvetica,sans-serif;
    color:#172033;
  "
>
  <table
    role="presentation"
    width="100%"
    cellspacing="0"
    cellpadding="0"
    border="0"
    style="
      padding:32px 16px;
    "
  >
    <tr>
      <td align="center">
        <table
          role="presentation"
          width="100%"
          cellspacing="0"
          cellpadding="0"
          border="0"
          style="
            max-width:620px;
            background:#ffffff;
            border-radius:16px;
            overflow:hidden;
            box-shadow:0 12px 30px rgba(15,23,42,.08);
          "
        >
          <tr>
            <td
              style="
                padding:28px 32px;
                background:#111827;
                color:#ffffff;
              "
            >
              <div
                style="
                  font-size:12px;
                  letter-spacing:.08em;
                  text-transform:uppercase;
                  opacity:.75;
                "
              >
                Ténor Afrique
              </div>

              <h1
                style="
                  margin:10px 0 0;
                  font-size:25px;
                  line-height:1.3;
                "
              >
                Nouveau message de contact
              </h1>
            </td>
          </tr>

          <tr>
            <td
              style="
                padding:32px;
                font-size:15px;
                line-height:1.65;
              "
            >
              <table
                width="100%"
                cellspacing="0"
                cellpadding="0"
                border="0"
                style="
                  margin-bottom:26px;
                "
              >
                <tr>
                  <td
                    style="
                      padding:9px 0;
                      color:#667085;
                      width:120px;
                    "
                  >
                    Nom
                  </td>

                  <td
                    style="
                      padding:9px 0;
                      font-weight:700;
                    "
                  >
                    ${escapeHtml(name)}
                  </td>
                </tr>

                <tr>
                  <td
                    style="
                      padding:9px 0;
                      color:#667085;
                    "
                  >
                    E-mail
                  </td>

                  <td
                    style="
                      padding:9px 0;
                    "
                  >
                    <a
                      href="mailto:${escapeHtml(email)}"
                      style="
                        color:#2563eb;
                        text-decoration:none;
                      "
                    >
                      ${escapeHtml(email)}
                    </a>
                  </td>
                </tr>

                <tr>
                  <td
                    style="
                      padding:9px 0;
                      color:#667085;
                    "
                  >
                    Entreprise
                  </td>

                  <td
                    style="
                      padding:9px 0;
                    "
                  >
                    ${escapeHtml(company || "Non renseignée")}
                  </td>
                </tr>

                <tr>
                  <td
                    style="
                      padding:9px 0;
                      color:#667085;
                    "
                  >
                    Sujet
                  </td>

                  <td
                    style="
                      padding:9px 0;
                    "
                  >
                    ${escapeHtml(subjectLabel)}
                  </td>
                </tr>
              </table>

              <div
                style="
                  padding:20px;
                  border:1px solid #e2e8f0;
                  border-radius:12px;
                  background:#f8fafc;
                "
              >
                <div
                  style="
                    margin-bottom:10px;
                    color:#667085;
                    font-size:12px;
                    font-weight:700;
                    text-transform:uppercase;
                    letter-spacing:.06em;
                  "
                >
                  Message
                </div>

                <div
                  style="
                    white-space:pre-wrap;
                    word-break:break-word;
                  "
                >${escapeHtml(message)}</div>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>

</html>
`.trim();

  /*
  |--------------------------------------------------------------------------
  | SEND
  |--------------------------------------------------------------------------
  */

  const result =
    await transporter.sendMail({
      from,

      to:
        recipient,

      /*
      |--------------------------------------------------------------------------
      | Reply goes directly to visitor.
      |--------------------------------------------------------------------------
      */

      replyTo:
        email,

      subject:
        mailSubject,

      text,

      html,
    });

  return {
    messageId:
      result.messageId,
  };
}

/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
  sendPasswordResetEmail,

  sendContactEmail,
};