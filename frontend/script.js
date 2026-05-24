const form =
document.querySelector("form");

const resultContainer =
document.querySelector(".result-container");

form.addEventListener("submit", async (e) => {

    e.preventDefault();

    const invoiceNumber =
    document.querySelectorAll("input")[0].value;

    const clientCode =
    document.querySelectorAll("input")[1].value;

    resultContainer.innerHTML = `

        <div class="loading">
            Loading invoice...
        </div>

    `;

    try {

        const response =
        await fetch(
            "http://localhost:3001/invoice",
            {

                method:"POST",

                headers:{
                    "Content-Type":"application/json"
                },

                body:JSON.stringify({

                    invoice_number:
                    invoiceNumber,

                    client_code:
                    clientCode

                })

            }
        );

        const responseData =
        await response.json();

        console.log(responseData);

        const data =
        responseData.data;

        const validation =
        responseData.validation;

        if(!data || data.length === 0){

            resultContainer.innerHTML = `

                <div class="error-box">
                    No invoice found
                </div>

            `;

            return;

        }

        const invoice = data[0];

        let rows = "";

        data.forEach(item => {

            rows += `

                <tr>

                    <td>${item.article_reference || ""}</td>

                    <td>${item.designation || ""}</td>

                    <td>${item.quantity || ""}</td>

                    <td>${item.unit_price || ""}</td>

                    <td>${item.line_total || ""}</td>

                </tr>

            `;

        });

        resultContainer.innerHTML = `

            <div class="invoice-result">

                <div class="validation-box">

                    <h2>
                        AI Validation
                    </h2>

                    <div class="validation-score">

                        ${validation.score}/100

                    </div>

                    <div class="validation-status">

                        ${
                            validation.valid
                            ? "VALID INVOICE ✅"
                            : "INVALID INVOICE ❌"
                        }

                    </div>

                </div>

                <h2>
                    Invoice ${invoice.invoice_number}
                </h2>

                <div class="section-title">
                    Invoice Information
                </div>

                <div class="invoice-grid">

                    <div class="info-card">
                        <h3>Invoice Number</h3>
                        <p>${invoice.invoice_number}</p>
                    </div>

                    <div class="info-card">
                        <h3>Invoice Date</h3>
                        <p>${invoice.invoice_date}</p>
                    </div>

                    <div class="info-card">
                        <h3>Due Date</h3>
                        <p>${invoice.due_date}</p>
                    </div>

                    <div class="info-card">
                        <h3>Currency</h3>
                        <p>${invoice.currency}</p>
                    </div>

                    <div class="info-card">
                        <h3>Total TTC</h3>
                        <p>${invoice.total_ttc}</p>
                    </div>

                </div>

                <div class="section-title">
                    Client Information
                </div>

                <div class="invoice-grid">

                    <div class="info-card">
                        <h3>Client Name</h3>
                        <p>${invoice.client_name}</p>
                    </div>

                    <div class="info-card">
                        <h3>Address</h3>
                        <p>${invoice.client_address}</p>
                    </div>

                    <div class="info-card">
                        <h3>City</h3>
                        <p>${invoice.client_city}</p>
                    </div>

                    <div class="info-card">
                        <h3>Email</h3>
                        <p>${invoice.client_email}</p>
                    </div>

                    <div class="info-card">
                        <h3>Phone</h3>
                        <p>${invoice.client_phone}</p>
                    </div>

                </div>

                <div class="section-title">
                    Supplier Information
                </div>

                <div class="invoice-grid">

                    <div class="info-card">
                        <h3>Supplier</h3>
                        <p>${invoice.sender_name}</p>
                    </div>

                    <div class="info-card">
                        <h3>SIRET</h3>
                        <p>${invoice.sender_siret}</p>
                    </div>

                    <div class="info-card">
                        <h3>TVA Number</h3>
                        <p>${invoice.sender_tva}</p>
                    </div>

                    <div class="info-card">
                        <h3>Website</h3>
                        <p>${invoice.sender_website}</p>
                    </div>

                </div>

                <div class="section-title">
                    Totals & TVA
                </div>

                <div class="invoice-grid">

                    <div class="info-card">
                        <h3>Base TVA</h3>
                        <p>${invoice.base_tva}</p>
                    </div>

                    <div class="info-card">
                        <h3>Total HT</h3>
                        <p>${invoice.total_ht}</p>
                    </div>

                    <div class="info-card">
                        <h3>Total TTC</h3>
                        <p>${invoice.total_ttc}</p>
                    </div>

                    <div class="info-card">
                        <h3>TVA Rate</h3>
                        <p>${invoice.tax_rate}%</p>
                    </div>

                </div>

                <div class="section-title">
                    Invoice Lines
                </div>

                <div class="table-container">

                    <table>

                        <thead>

                            <tr>

                                <th>Reference</th>
                                <th>Designation</th>
                                <th>Quantity</th>
                                <th>Unit Price</th>
                                <th>Total</th>

                            </tr>

                        </thead>

                        <tbody>

                            ${rows}

                        </tbody>

                    </table>

                </div>

            </div>

        `;

    }

    catch(error){

        console.log(error);

        resultContainer.innerHTML = `

            <div class="error-box">
                Backend connection failed
            </div>

        `;

    }

});