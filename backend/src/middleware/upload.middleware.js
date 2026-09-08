const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadDirectory = path.resolve(
  __dirname,
  "../../uploads/invoices"
);

fs.mkdirSync(uploadDirectory, {
  recursive: true,
});

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadDirectory);
  },

  filename: (_req, file, callback) => {
    const timestamp = Date.now();

    const safeFileName = file.originalname.replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );

    callback(
      null,
      `${timestamp}_${safeFileName}`
    );
  },
});

const allowedMimeTypes = [
  "application/pdf",
  "image/png",
  "image/jpeg",
];

function fileFilter(_req, file, callback) {
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return callback(
      new Error(
        "Format non accepté. Utilisez PDF, PNG, JPG ou JPEG."
      )
    );
  }

  callback(null, true);
}

const uploadInvoiceFile = multer({
  storage,
  fileFilter,
  limits: {
   fileSize: 20 * 1024 * 1024,
  },
});

module.exports = {
  uploadInvoiceFile,
};