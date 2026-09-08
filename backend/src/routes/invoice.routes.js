const express =
  require("express");

const authenticate =
  require(
    "../middleware/authenticate",
  );

const {
  uploadInvoiceFile,
} =
  require(
    "../middleware/upload.middleware",
  );

const {
  uploadInvoice,
  importInvoiceFromErp,
  getInvoices,
  getInvoiceById,
  updateInvoiceById,
  humanCorrectionInvoice,
  approveExtractionById,
  retryInvoiceById,
  retryErpInvoiceById,
  deleteInvoiceById,
  workflowUpdate,
  verifyInvoiceByToken,

  /*
  |--------------------------------------------------------------------------
  | DOCUMENT ORIGINAL
  |--------------------------------------------------------------------------
  */

  viewInvoiceOriginal,

  /*
  |--------------------------------------------------------------------------
  | XML
  |--------------------------------------------------------------------------
  */

  viewInvoiceXml,
  downloadInvoiceXml,
} =
  require(
    "../controllers/invoice.controller",
  );

const router =
  express.Router();

/*
|--------------------------------------------------------------------------
| UPLOAD NORMALIZATION
|--------------------------------------------------------------------------
*/

const acceptInvoiceUpload =
  uploadInvoiceFile.fields([
    {
      name:
        "file",

      maxCount:
        1,
    },

    {
      name:
        "invoice",

      maxCount:
        1,
    },
  ]);

function normalizeUploadedInvoice(
  req,
  res,
  next,
) {
  const uploadedFile =
    req.files?.file?.[0] ||
    req.files?.invoice?.[0] ||
    null;

  if (uploadedFile) {
    req.file =
      uploadedFile;
  }

  next();
}

/*
|--------------------------------------------------------------------------
| GET /api/invoices
|--------------------------------------------------------------------------
*/

router.get(
  "/",
  authenticate,
  getInvoices,
);

/*
|--------------------------------------------------------------------------
| N8N CALLBACK
|--------------------------------------------------------------------------
|
| Cette route est appelée par n8n.
|
| Pas d'auth JWT utilisateur ici.
|
| La sécurité se fait dans workflowUpdate avec :
|
| x-workflow-secret
|
|--------------------------------------------------------------------------
*/

router.post(
  "/workflow-update",
  workflowUpdate,
);

/*
|--------------------------------------------------------------------------
| QR PUBLIC
|--------------------------------------------------------------------------
*/

router.get(
  "/public/verify/:token",
  verifyInvoiceByToken,
);

/*
|--------------------------------------------------------------------------
| UPLOAD PDF / IMAGE
|--------------------------------------------------------------------------
*/

router.post(
  "/upload",
  authenticate,
  acceptInvoiceUpload,
  normalizeUploadedInvoice,
  uploadInvoice,
);

/*
|--------------------------------------------------------------------------
| IMPORT ERP
|--------------------------------------------------------------------------
*/

router.post(
  "/import-erp",
  authenticate,
  importInvoiceFromErp,
);

/*
|--------------------------------------------------------------------------
| HUMAN CORRECTION
|--------------------------------------------------------------------------
|
| Enregistre les corrections de l'utilisateur.
|
| NE DÉMARRE PAS :
|
| TEIF
| Signature
| TTN
|
| La facture reste en :
|
| PENDING_REVIEW / VALIDATION
|
|--------------------------------------------------------------------------
*/

router.post(
  "/:id/human-correction",
  authenticate,
  humanCorrectionInvoice,
);

/*
|--------------------------------------------------------------------------
| APPROVE EXTRACTION
|--------------------------------------------------------------------------
|
| Bouton frontend :
|
| "Valider et continuer vers la signature"
|
| Cette route démarre le deuxième workflow :
|
| Human Approval Webhook
| -> Revalidation
| -> TEIF
| -> Signature
| -> TTN
| -> QR
|
|--------------------------------------------------------------------------
*/

router.post(
  "/:id/approve-extraction",
  authenticate,
  approveExtractionById,
);

/*
|--------------------------------------------------------------------------
| RETRY ERP
|--------------------------------------------------------------------------
*/

router.post(
  "/:id/retry-erp",
  authenticate,
  retryErpInvoiceById,
);

/*
|--------------------------------------------------------------------------
| RETRY GÉNÉRAL
|--------------------------------------------------------------------------
*/

router.post(
  "/:id/retry",
  authenticate,
  retryInvoiceById,
);

/*
|--------------------------------------------------------------------------
| DOCUMENT ORIGINAL - VOIR
|--------------------------------------------------------------------------
|
| GET /api/invoices/:id/original
|
| Retourne le PDF ou l'image originale de la facture.
|
| IMPORTANT :
|
| - authentification obligatoire
| - vérification de organization_id dans le controller
| - original_file_path reste privé
| - le frontend reçoit uniquement le fichier
|
|--------------------------------------------------------------------------
*/

router.get(
  "/:id/original",
  authenticate,
  viewInvoiceOriginal,
);

/*
|--------------------------------------------------------------------------
| XML - VOIR
|--------------------------------------------------------------------------
|
| GET /api/invoices/:id/xml
|
| Retourne le document XML associé à la facture.
|
| IMPORTANT :
|
| - authentification obligatoire
| - vérification de l'organisation dans le controller
| - le chemin interne du serveur n'est jamais envoyé au client
|
|--------------------------------------------------------------------------
*/

router.get(
  "/:id/xml",
  authenticate,
  viewInvoiceXml,
);

/*
|--------------------------------------------------------------------------
| XML - TÉLÉCHARGER
|--------------------------------------------------------------------------
|
| GET /api/invoices/:id/xml/download
|
|--------------------------------------------------------------------------
*/

router.get(
  "/:id/xml/download",
  authenticate,
  downloadInvoiceXml,
);

/*
|--------------------------------------------------------------------------
| UPDATE EXTRACTION
|--------------------------------------------------------------------------
*/

router.put(
  "/:id",
  authenticate,
  updateInvoiceById,
);

/*
|--------------------------------------------------------------------------
| DELETE
|--------------------------------------------------------------------------
*/

router.delete(
  "/:id",
  authenticate,
  deleteInvoiceById,
);

/*
|--------------------------------------------------------------------------
| GET DETAIL
|--------------------------------------------------------------------------
|
| IMPORTANT :
|
| Toujours laisser cette route APRÈS les routes spécifiques :
|
| /:id/original
| /:id/xml
| /:id/xml/download
| /:id/retry
| /:id/retry-erp
| /:id/human-correction
| /:id/approve-extraction
|
|--------------------------------------------------------------------------
*/

router.get(
  "/:id",
  authenticate,
  getInvoiceById,
);

/*
|--------------------------------------------------------------------------
| EXPORT
|--------------------------------------------------------------------------
*/

module.exports =
  router;