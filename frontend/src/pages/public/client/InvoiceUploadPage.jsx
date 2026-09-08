import {
  useRef,
  useState,
} from "react";

import {
  Link,
  useNavigate,
} from "react-router-dom";

import AuthenticatedHeader from "../../../components/navigation/AuthenticatedHeader/AuthenticatedHeader";
import AuthenticatedFooter from "../../../components/navigation/AuthenticatedFooter/AuthenticatedFooter";

import {
  uploadInvoice,
  importInvoiceFromErp,
} from "../../../services/invoiceService";

import "./InvoiceUploadPage.css";


const SOURCE_TYPES = {
  PDF: "PDF",
  SCAN_IMAGE: "SCAN_IMAGE",
  ERP: "ERP",
};

const MAX_FILE_SIZE =
  20 * 1024 * 1024;


function formatFileSize(size) {
  if (!Number.isFinite(size)) {
    return "";
  }

  if (size < 1024) {
    return `${size} octets`;
  }

  if (size < 1024 * 1024) {
    return `${(
      size / 1024
    ).toFixed(1)} Ko`;
  }

  return `${(
    size /
    (1024 * 1024)
  ).toFixed(2)} Mo`;
}


function UploadFeedback({
  type,
  title,
  message,
}) {
  return (
    <div
      className={`invoice-upload-feedback invoice-upload-feedback--${type}`}
      role={
        type === "error"
          ? "alert"
          : "status"
      }
    >
      <span aria-hidden="true">
        {type === "error"
          ? "!"
          : "✓"}
      </span>

      <div>
        <strong>
          {title}
        </strong>

        <p>
          {message}
        </p>
      </div>
    </div>
  );
}


function InvoiceUploadPage() {
  const navigate =
    useNavigate();

  const fileInputRef =
    useRef(null);

  const [
    selectedSource,
    setSelectedSource,
  ] = useState(null);

  const [
    file,
    setFile,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    dragActive,
    setDragActive,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    error,
    setError,
  ] = useState("");

  const [
    uploadedInvoice,
    setUploadedInvoice,
  ] = useState(null);

  const [
    erpInvoiceNumber,
    setErpInvoiceNumber,
  ] = useState("");

  const [
    erpClientCode,
    setErpClientCode,
  ] = useState("");


  function resetFeedback() {
    setMessage("");
    setError("");
    setUploadedInvoice(
      null,
    );
  }


  function handleSelectSource(
    source,
  ) {
    if (loading) {
      return;
    }

    setSelectedSource(
      source,
    );

    setFile(null);

    setErpInvoiceNumber(
      "",
    );

    setErpClientCode(
      "",
    );

    resetFeedback();

    if (
      fileInputRef.current
    ) {
      fileInputRef.current.value =
        "";
    }
  }


  function handleBackToSources() {
    if (loading) {
      return;
    }

    setSelectedSource(
      null,
    );

    setFile(null);

    setErpInvoiceNumber(
      "",
    );

    setErpClientCode(
      "",
    );

    resetFeedback();

    if (
      fileInputRef.current
    ) {
      fileInputRef.current.value =
        "";
    }
  }


  function validateFile(
    selectedFile,
  ) {
    if (!selectedFile) {
      return {
        valid: false,
        message:
          "Aucun fichier sélectionné.",
      };
    }

    if (
      selectedSource ===
        SOURCE_TYPES.PDF &&
      selectedFile.type !==
        "application/pdf"
    ) {
      return {
        valid: false,
        message:
          "Veuillez sélectionner un fichier PDF.",
      };
    }

    if (
      selectedSource ===
      SOURCE_TYPES.SCAN_IMAGE
    ) {
      const acceptedImages =
        [
          "image/png",
          "image/jpeg",
        ];

      if (
        !acceptedImages.includes(
          selectedFile.type,
        )
      ) {
        return {
          valid: false,
          message:
            "Veuillez sélectionner une image PNG, JPG ou JPEG.",
        };
      }
    }

    if (
      selectedFile.size >
      MAX_FILE_SIZE
    ) {
      return {
        valid: false,
        message:
          "Le fichier dépasse la taille maximale de 20 Mo.",
      };
    }

    return {
      valid: true,
      message: "",
    };
  }


  function selectFile(
    selectedFile,
  ) {
    resetFeedback();

    const validation =
      validateFile(
        selectedFile,
      );

    if (
      !validation.valid
    ) {
      setFile(null);

      setError(
        validation.message,
      );

      if (
        fileInputRef.current
      ) {
        fileInputRef.current.value =
          "";
      }

      return;
    }

    setFile(
      selectedFile,
    );
  }


  function handleFileChange(
    event,
  ) {
    selectFile(
      event.target.files?.[0] ||
        null,
    );
  }


  function handleDragEnter(
    event,
  ) {
    event.preventDefault();
    event.stopPropagation();

    if (!loading) {
      setDragActive(true);
    }
  }


  function handleDragLeave(
    event,
  ) {
    event.preventDefault();
    event.stopPropagation();

    setDragActive(false);
  }


  function handleDragOver(
    event,
  ) {
    event.preventDefault();
    event.stopPropagation();

    if (!loading) {
      setDragActive(true);
    }
  }


  function handleDrop(
    event,
  ) {
    event.preventDefault();
    event.stopPropagation();

    setDragActive(false);

    if (loading) {
      return;
    }

    selectFile(
      event.dataTransfer
        .files?.[0] ||
        null,
    );
  }


  function removeSelectedFile() {
    if (loading) {
      return;
    }

    setFile(null);

    resetFeedback();

    if (
      fileInputRef.current
    ) {
      fileInputRef.current.value =
        "";
    }
  }


  async function handleFileSubmit(
    event,
  ) {
    event.preventDefault();

    resetFeedback();

    const validation =
      validateFile(file);

    if (
      !validation.valid
    ) {
      setError(
        validation.message,
      );

      return;
    }

    try {
      setLoading(true);

      const source =
        selectedSource ===
        SOURCE_TYPES.SCAN_IMAGE
          ? "SCAN_IMAGE"
          : "PDF";

      const result =
        await uploadInvoice(
          file,
          source,
        );

      const invoice =
        result?.invoice ||
        result?.data
          ?.invoice ||
        result?.data ||
        null;

      setUploadedInvoice(
        invoice,
      );

      setMessage(
        result?.message ||
          "Votre facture a bien été envoyée.",
      );

      setFile(null);

      if (
        fileInputRef.current
      ) {
        fileInputRef.current.value =
          "";
      }

      const invoiceId =
        invoice?.id ||
        invoice?.invoice_id ||
        null;

      if (invoiceId) {
        window.setTimeout(
          () => {
            navigate(
              `/client/invoices/${invoiceId}`,
            );
          },
          800,
        );
      }
    } catch (
      uploadError
    ) {
      setError(
        uploadError?.message ||
          "Impossible d’envoyer la facture.",
      );
    } finally {
      setLoading(false);
    }
  }


  async function handleErpSubmit(
    event,
  ) {
    event.preventDefault();

    resetFeedback();

    const invoiceNumber =
      erpInvoiceNumber.trim();

    const clientCode =
      erpClientCode.trim();

    if (!invoiceNumber) {
      setError(
        "Veuillez saisir le numéro de facture.",
      );

      return;
    }

    if (!clientCode) {
      setError(
        "Veuillez saisir le code client.",
      );

      return;
    }

    try {
      setLoading(true);

      const result =
        await importInvoiceFromErp(
          {
            invoice_number:
              invoiceNumber,

            client_code:
              clientCode,
          },
        );

      const invoice =
        result?.invoice ||
        result?.data
          ?.invoice ||
        null;

      setUploadedInvoice(
        invoice,
      );

      setMessage(
        result?.message ||
          `La facture ${invoiceNumber} a bien été trouvée.`,
      );

      const invoiceId =
        invoice?.id ||
        invoice?.invoice_id ||
        null;

      if (invoiceId) {
        window.setTimeout(
          () => {
            navigate(
              `/client/invoices/${invoiceId}`,
            );
          },
          800,
        );
      }
    } catch (
      importError
    ) {
      const existingInvoice =
        importError?.data
          ?.invoice ||
        importError?.data
          ?.existing_invoice ||
        null;

      if (
        existingInvoice?.id
      ) {
        setUploadedInvoice(
          existingInvoice,
        );
      }

      setError(
        importError?.message ||
          "Impossible de récupérer cette facture.",
      );
    } finally {
      setLoading(false);
    }
  }


  const fileAccept =
    selectedSource ===
    SOURCE_TYPES.PDF
      ? ".pdf,application/pdf"
      : ".png,.jpg,.jpeg,image/png,image/jpeg";


  const sourceTitle =
    selectedSource ===
    SOURCE_TYPES.PDF
      ? "Ajouter votre PDF"
      : selectedSource ===
        SOURCE_TYPES.SCAN_IMAGE
        ? "Ajouter votre image"
        : selectedSource ===
          SOURCE_TYPES.ERP
          ? "Rechercher une facture"
          : "";


  return (
    <div className="invoice-upload-page">

      <AuthenticatedHeader />


      <main className="invoice-upload-main">

        {/*
        |--------------------------------------------------------------------------
        | HERO
        |--------------------------------------------------------------------------
        */}

        <section className="invoice-upload-hero">

          <div>

            <h1>
              Ajouter une facture
            </h1>

            <p>
              Choisissez simplement
              comment vous souhaitez
              ajouter votre facture.
              Nous nous occupons du reste.
            </p>

          </div>


         

        </section>


        {/*
        |--------------------------------------------------------------------------
        | SOURCE SELECTION
        |--------------------------------------------------------------------------
        */}

        {!selectedSource && (

          <section className="invoice-source-section">

            <header className="invoice-source-heading">

              <span>
                Choisissez une option
              </span>

              <h2>
                Comment souhaitez-vous ajouter la facture ?
              </h2>

              <p>
                Sélectionnez la méthode
                la plus simple pour vous.
              </p>

            </header>


            <div className="invoice-source-grid">

              {/*
              |--------------------------------------------------------------------------
              | PDF
              |--------------------------------------------------------------------------
              */}

              <button
                type="button"
                className="invoice-source-card invoice-source-card--pdf"
                onClick={() =>
                  handleSelectSource(
                    SOURCE_TYPES.PDF,
                  )
                }
              >

                <span className="invoice-source-card-top">

                  <span className="invoice-source-icon">
                    PDF
                  </span>

                  <span className="invoice-source-badge">
                    Recommandé
                  </span>

                </span>


                <span className="invoice-source-card-copy">

                  <strong>
                    Importer un PDF
                  </strong>

                  <small>
                    Sélectionnez simplement
                    votre facture au format PDF.
                  </small>

                </span>


                <span className="invoice-source-simple-note">
                  Rapide et automatique
                </span>


                <span className="invoice-source-action">
                  Choisir un PDF

                  <span>
                    →
                  </span>
                </span>

              </button>


              {/*
              |--------------------------------------------------------------------------
              | IMAGE
              |--------------------------------------------------------------------------
              */}

              <button
                type="button"
                className="invoice-source-card invoice-source-card--scan"
                onClick={() =>
                  handleSelectSource(
                    SOURCE_TYPES.SCAN_IMAGE,
                  )
                }
              >

                <span className="invoice-source-card-top">

                  <span className="invoice-source-icon">
                    IMG
                  </span>

                  <span className="invoice-source-badge">
                    Photo
                  </span>

                </span>


                <span className="invoice-source-card-copy">

                  <strong>
                    Importer une image
                  </strong>

                  <small>
                    Utilisez une photo
                    ou une image scannée
                    de votre facture.
                  </small>

                </span>


                <span className="invoice-source-simple-note">
                  PNG, JPG ou JPEG
                </span>


                <span className="invoice-source-action">
                  Choisir une image

                  <span>
                    →
                  </span>
                </span>

              </button>


              {/*
              |--------------------------------------------------------------------------
              | ERP
              |--------------------------------------------------------------------------
              */}

              <button
                type="button"
                className="invoice-source-card invoice-source-card--erp"
                onClick={() =>
                  handleSelectSource(
                    SOURCE_TYPES.ERP,
                  )
                }
              >

                <span className="invoice-source-card-top">

                  <span className="invoice-source-icon">
                    ERP
                  </span>

                  <span className="invoice-source-badge invoice-source-badge--erp">
                    Connecté
                  </span>

                </span>


                <span className="invoice-source-card-copy">

                  <strong>
                    Depuis votre logiciel
                  </strong>

                  <small>
                    Retrouvez directement
                    une facture déjà enregistrée
                    dans votre système.
                  </small>

                </span>


                <span className="invoice-source-simple-note">
                  Aucun fichier nécessaire
                </span>


                <span className="invoice-source-action">
                  Rechercher une facture

                  <span>
                    →
                  </span>
                </span>

              </button>

            </div>


            {/*
            |--------------------------------------------------------------------------
            | SIMPLE PROCESS
            |--------------------------------------------------------------------------
            */}

            <div className="invoice-source-common-pipeline">

              <span className="invoice-source-common-label">
                Après l’ajout
              </span>


              <div>

                <span>
                  1. Lecture
                </span>

                <b>
                  →
                </b>

                <span>
                  2. Vérification
                </span>

                <b>
                  →
                </b>

                <span>
                  3. Envoi
                </span>

                <b>
                  →
                </b>

                <span>
                  4. Terminé
                </span>

              </div>

            </div>

          </section>

        )}


        {/*
        |--------------------------------------------------------------------------
        | SELECTED SOURCE
        |--------------------------------------------------------------------------
        */}

        {selectedSource && (

          <section className="invoice-upload-layout">

            <div>

              <button
                type="button"
                className="invoice-upload-back"
                onClick={
                  handleBackToSources
                }
                disabled={
                  loading
                }
              >
                ← Choisir une autre méthode
              </button>


              {/*
              |--------------------------------------------------------------------------
              | FILE
              |--------------------------------------------------------------------------
              */}

              {selectedSource !==
                SOURCE_TYPES.ERP && (

                <form
                  className="invoice-upload-card"
                  onSubmit={
                    handleFileSubmit
                  }
                >

                  <header className="invoice-upload-card-header">

                    <div>

                      <span>
                        Votre document
                      </span>

                      <h2>
                        {
                          sourceTitle
                        }
                      </h2>

                    </div>


                    <small>
                      Maximum 20 Mo
                    </small>

                  </header>


                  <div
                    className={[
                      "invoice-upload-dropzone",

                      dragActive
                        ? "is-drag-active"
                        : "",

                      file
                        ? "has-file"
                        : "",

                      loading
                        ? "is-disabled"
                        : "",
                    ]
                      .filter(
                        Boolean,
                      )
                      .join(" ")}
                    onDragEnter={
                      handleDragEnter
                    }
                    onDragLeave={
                      handleDragLeave
                    }
                    onDragOver={
                      handleDragOver
                    }
                    onDrop={
                      handleDrop
                    }
                  >

                    <input
                      ref={
                        fileInputRef
                      }
                      id="invoice-file"
                      className="invoice-upload-input"
                      type="file"
                      accept={
                        fileAccept
                      }
                      disabled={
                        loading
                      }
                      onChange={
                        handleFileChange
                      }
                    />


                    {!file ? (

                      <label
                        htmlFor="invoice-file"
                        className="invoice-upload-dropzone-content"
                      >

                        <span
                          className="invoice-upload-icon"
                          aria-hidden="true"
                        >
                          {selectedSource ===
                          SOURCE_TYPES.PDF
                            ? "PDF"
                            : "IMG"}
                        </span>


                        <strong>
                          {selectedSource ===
                          SOURCE_TYPES.PDF
                            ? "Déposez votre PDF ici"
                            : "Déposez votre image ici"}
                        </strong>


                        <span>
                          ou cliquez pour choisir
                          un fichier
                        </span>


                        <small>
                          {selectedSource ===
                          SOURCE_TYPES.SCAN_IMAGE
                            ? "PNG, JPG ou JPEG"
                            : "Fichier PDF"}
                        </small>

                      </label>

                    ) : (

                      <div className="invoice-upload-selected-file">

                        <span
                          className="invoice-upload-file-icon"
                          aria-hidden="true"
                        >
                          {selectedSource ===
                          SOURCE_TYPES.SCAN_IMAGE
                            ? "IMG"
                            : "PDF"}
                        </span>


                        <div>

                          <strong>
                            {
                              file.name
                            }
                          </strong>

                          <span>
                            {formatFileSize(
                              file.size,
                            )}
                          </span>

                        </div>


                        <button
                          type="button"
                          onClick={
                            removeSelectedFile
                          }
                          disabled={
                            loading
                          }
                          aria-label="Supprimer le fichier sélectionné"
                        >
                          ×
                        </button>

                      </div>

                    )}

                  </div>


                  <div className="invoice-upload-information">

                    <div>
                      <span>
                        ✓
                      </span>

                      <p>
                        Votre facture est
                        analysée automatiquement.
                      </p>
                    </div>

                    <div>
                      <span>
                        ✓
                      </span>

                      <p>
                        Les informations importantes
                        sont vérifiées.
                      </p>
                    </div>

                    <div>
                      <span>
                        ✓
                      </span>

                      <p>
                        Vous pourrez suivre
                        son état depuis
                        « Mes factures ».
                      </p>
                    </div>

                  </div>


                  {error && (
                    <UploadFeedback
                      type="error"
                      title="Impossible d’ajouter la facture"
                      message={
                        error
                      }
                    />
                  )}


                  {message && (
                    <UploadFeedback
                      type="success"
                      title="Facture ajoutée"
                      message={
                        message
                      }
                    />
                  )}


                  <div className="invoice-upload-actions">

                    <button
                      type="button"
                      className="invoice-upload-cancel"
                      disabled={
                        loading
                      }
                      onClick={
                        handleBackToSources
                      }
                    >
                      Annuler
                    </button>


                    <button
                      type="submit"
                      className="invoice-upload-submit"
                      disabled={
                        loading ||
                        !file
                      }
                    >

                      {loading && (
                        <span
                          className="invoice-upload-spinner"
                          aria-hidden="true"
                        />
                      )}


                      {loading
                        ? "Ajout en cours..."
                        : "Ajouter la facture"}

                    </button>

                  </div>

                </form>

              )}


              {/*
              |--------------------------------------------------------------------------
              | ERP
              |--------------------------------------------------------------------------
              */}

              {selectedSource ===
                SOURCE_TYPES.ERP && (

                <form
                  className="invoice-upload-card invoice-erp-card"
                  onSubmit={
                    handleErpSubmit
                  }
                >

                  <header className="invoice-upload-card-header">

                    <div>

                      <span>
                        Recherche
                      </span>

                      <h2>
                        Trouver une facture
                      </h2>

                    </div>


                    <span className="invoice-erp-live">
                      <i />

                      Disponible
                    </span>

                  </header>


                  <div className="invoice-erp-intro">

                    <span className="invoice-erp-system-icon">
                      ERP
                    </span>


                    <div>

                      <strong>
                        Votre logiciel de gestion
                      </strong>

                      <p>
                        Saisissez simplement
                        le numéro de facture
                        et le code client pour
                        retrouver votre document.
                      </p>

                    </div>

                  </div>


                  <div className="invoice-erp-fields">

                    <label>

                      <span>
                        Numéro de facture
                      </span>

                      <small>
                        Exemple : 10001416
                      </small>

                      <input
                        type="text"
                        value={
                          erpInvoiceNumber
                        }
                        disabled={
                          loading
                        }
                        placeholder="10001416"
                        autoComplete="off"
                        onChange={(
                          event,
                        ) =>
                          setErpInvoiceNumber(
                            event.target
                              .value,
                          )
                        }
                      />

                    </label>


                    <label>

                      <span>
                        Code client
                      </span>

                      <small>
                        Exemple : C0000030
                      </small>

                      <input
                        type="text"
                        value={
                          erpClientCode
                        }
                        disabled={
                          loading
                        }
                        placeholder="C0000030"
                        autoComplete="off"
                        onChange={(
                          event,
                        ) =>
                          setErpClientCode(
                            event.target
                              .value,
                          )
                        }
                      />

                    </label>

                  </div>


                  <div className="invoice-erp-note">

                    <span>
                      i
                    </span>

                    <p>
                      Aucun fichier n’est nécessaire.
                      La facture sera retrouvée
                      automatiquement.
                    </p>

                  </div>


                  {error && (
                    <UploadFeedback
                      type="error"
                      title="Facture introuvable"
                      message={
                        error
                      }
                    />
                  )}


                  {message && (
                    <UploadFeedback
                      type="success"
                      title="Facture trouvée"
                      message={
                        message
                      }
                    />
                  )}


                  <div className="invoice-upload-actions">

                    <button
                      type="button"
                      className="invoice-upload-cancel"
                      disabled={
                        loading
                      }
                      onClick={
                        handleBackToSources
                      }
                    >
                      Annuler
                    </button>


                    <button
                      type="submit"
                      className="invoice-upload-submit invoice-upload-submit--erp"
                      disabled={
                        loading ||
                        !erpInvoiceNumber.trim() ||
                        !erpClientCode.trim()
                      }
                    >

                      {loading && (
                        <span
                          className="invoice-upload-spinner"
                          aria-hidden="true"
                        />
                      )}


                      {loading
                        ? "Recherche..."
                        : "Rechercher la facture"}

                    </button>

                  </div>

                </form>

              )}

            </div>


            {/*
            |--------------------------------------------------------------------------
            | SIMPLE SIDE PANEL
            |--------------------------------------------------------------------------
            */}

            <aside className="invoice-upload-side-panel">

              <section>

                <span className="invoice-upload-side-label">
                  En quelques étapes
                </span>

                <h2>
                  Nous nous occupons du reste
                </h2>


                <ol className="invoice-upload-pipeline">

                  <li>

                    <span>
                      1
                    </span>

                    <div>
                      <strong>
                        Lecture
                      </strong>

                      <small>
                        Nous lisons votre facture.
                      </small>
                    </div>

                  </li>


                  <li>

                    <span>
                      2
                    </span>

                    <div>
                      <strong>
                        Vérification
                      </strong>

                      <small>
                        Les informations sont contrôlées.
                      </small>
                    </div>

                  </li>


                  <li>

                    <span>
                      3
                    </span>

                    <div>
                      <strong>
                        Envoi
                      </strong>

                      <small>
                        Votre facture est transmise.
                      </small>
                    </div>

                  </li>


                  <li>

                    <span>
                      4
                    </span>

                    <div>
                      <strong>
                        Suivi
                      </strong>

                      <small>
                        Vous voyez immédiatement son état.
                      </small>
                    </div>

                  </li>

                </ol>

              </section>


              {uploadedInvoice && (

                <section className="invoice-upload-result">

                  <span className="invoice-upload-side-label">
                    Dernière facture
                  </span>

                  <h2>
                    Facture ajoutée
                  </h2>


                  <p className="invoice-upload-result-message">
                    Votre facture a bien été enregistrée.
                    Vous pouvez maintenant suivre
                    son avancement.
                  </p>


                  {uploadedInvoice.id ? (

                    <Link
                      to={`/client/invoices/${uploadedInvoice.id}`}
                      className="invoice-upload-dashboard-link"
                    >
                      Voir la facture
                    </Link>

                  ) : (

                    <Link
                      to="/client/invoices"
                      className="invoice-upload-dashboard-link"
                    >
                      Voir mes factures
                    </Link>

                  )}

                </section>

              )}

            </aside>

          </section>

        )}

      </main>


      <AuthenticatedFooter />

    </div>
  );
}


export default InvoiceUploadPage;