const express = require("express");

const cors = require("cors");

const sql = require("mssql");

const fs = require("fs");

const csv = require("csv-parser");

const validateInvoice =
require("./validation");

const app = express();

app.use(cors());

app.use(express.json());

/* =========================================
   SQL CONFIG
========================================= */

const config = {

    user: "sa",

    password: "s211JFT2523",

    server: "127.0.0.1",

    database: "ERP223",

    options: {

        trustServerCertificate: true

    }

};

/* =========================================
   LOAD CSV MAPPING
========================================= */

let mapping = {};

fs.createReadStream("./mapping/mapping.csv")

.pipe(csv())

.on("data", (row) => {

    mapping[row.sql_field] =
    row.human_label;

})

.on("end", () => {

    console.log("Mapping loaded");

});

/* =========================================
   ROUTE
========================================= */

app.post("/invoice", async (req, res) => {

    try {

        const invoice_number =
        req.body.invoice_number;

        const client_code =
        req.body.client_code;

        await sql.connect(config);

        const result = await sql.query(`

SELECT

    /* =====================================
       FACTURE
    ===================================== */

    ENT.DOS,

    ENT.TIERS AS client_code,

    CASE
        WHEN ISNULL(ENT.PREFPINO, '') = ''
        THEN CAST(ENT.PINO AS VARCHAR)
        ELSE ENT.PREFPINO + CAST(ENT.PINO AS VARCHAR)
    END AS invoice_number,

    CONVERT(VARCHAR, ENT.PIDT, 23) AS invoice_date,

    CONVERT(VARCHAR, ENT.ECHDT, 23) AS due_date,

    ENT.DEV AS currency,

    ENT.HTMT AS base_tva,

    ENT.HTPDTMT AS total_ht,

    ENT.TTCMT AS total_ttc,

    ENT.PIEDMT_0001 AS frais_port_non_soumis,

    ENT.PIEDMT_0002 AS frais_port_soumis,

    ENT.PIEDMT_0003 AS frais_emballage,

    /* =====================================
       TVA
    ===================================== */

    20 AS tax_rate,

    /* =====================================
       CLIENT
    ===================================== */

    T1.NOM AS client_name,

    T1.RUE AS client_address,

    T1.VIL AS client_city,

    T1.CPOSTAL AS client_postal_code,

    T1.TEL AS client_phone,

    T1.EMAIL AS client_email,

    T1.PAY AS client_country,

    /* =====================================
       SENDER
    ===================================== */

    SOC.NOM AS sender_name,

    SOC.RUE AS sender_address,

    SOC.VIL AS sender_city,

    SOC.CPOSTAL AS sender_postal_code,

    SOC.TEL AS sender_phone,

    SOC.EMAIL AS sender_email,

    SOC.WEB AS sender_website,

    SOC.SIRET AS sender_siret,

    SOC.TVANO AS sender_tva,

    /* =====================================
       ARTICLES
    ===================================== */

    CASE
        WHEN ISNULL(MOUV.ARTIND, '') = ''
        THEN MOUV.REF
        ELSE MOUV.REF + MOUV.ARTIND
    END AS article_reference,

    MOUV.DES AS designation,

    MOUV.REFQTE AS quantity,

    MOUV.PUB AS unit_price,

    MOUV.MONT AS line_total

FROM ENT

/* =====================================
   ARTICLES
===================================== */

LEFT JOIN MOUV
    ON ENT.DOS = MOUV.DOS
    AND ENT.PINO = MOUV.FANO
    AND ENT.TIERS = MOUV.TIERS

/* =====================================
   CLIENT
===================================== */

LEFT JOIN T1
    ON ENT.DOS = T1.DOS
    AND ENT.TIERS = T1.TIERS
    AND T1.ADRCOD = 'SIEGE'

/* =====================================
   SENDER
===================================== */

LEFT JOIN SOC
    ON ENT.DOS = SOC.DOS

WHERE
    ENT.PICOD = '4'
    AND ENT.TIERS = '${client_code}'
    AND ENT.PINO = '${invoice_number}'

ORDER BY
    MOUV.REF

        `);

        const validation =
        validateInvoice(
            result.recordset
        );

        res.json({

            mapping,

            validation,

            data:
            result.recordset

        });

    }

    catch(error){

        console.log(error);

        res.status(500).json({

            error:error.message

        });

    }

});

/* =========================================
   START SERVER
========================================= */

app.listen(3001, () => {

    console.log(
        "Server running on port 3001"
    );

});