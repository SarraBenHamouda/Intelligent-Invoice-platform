function validateInvoice(invoiceData) {

    let errors = [];

    let warnings = [];

    if (!invoiceData || invoiceData.length === 0) {

        errors.push(
            "Invoice not found"
        );

        return {

            valid: false,

            score: 0,

            errors,

            warnings

        };

    }

    const invoice =
    invoiceData[0];

    /* REQUIRED */

    if (!invoice.invoice_number) {

        errors.push(
            "Missing invoice number"
        );

    }

    if (!invoice.client_name) {

        errors.push(
            "Missing client name"
        );

    }

    if (!invoice.invoice_date) {

        errors.push(
            "Missing invoice date"
        );

    }

    /* TOTALS */

    const ht =
    parseFloat(
        invoice.total_ht || 0
    );

    const tva =
    parseFloat(
        invoice.base_tva || 0
    );

    const ttc =
    parseFloat(
        invoice.total_ttc || 0
    );

    if ((ht + tva) > 0) {

        const calculated =
        (ht + tva).toFixed(2);

        const actual =
        ttc.toFixed(2);

        if (calculated != actual) {

            warnings.push(
                "TTC mismatch detected"
            );

        }

    }

    /* TVA */

    const allowedTVA =
    [0,7,13,19,20];

    if (

        !allowedTVA.includes(
            Number(invoice.tax_rate)
        )

    ) {

        warnings.push(
            "Unusual TVA rate"
        );

    }

    /* SCORE */

    let score = 100;

    score -= errors.length * 25;

    score -= warnings.length * 10;

    if(score < 0){

        score = 0;

    }

    return {

        valid:
        errors.length === 0,

        score,

        errors,

        warnings

    };

}

module.exports =
validateInvoice;