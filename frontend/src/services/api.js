export async function fetchInvoice(invoiceNumber, clientCode) {

  const response = await fetch(
    "http://localhost:3001/invoice",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        invoice_number: invoiceNumber,
        client_code: clientCode
      })
    }
  );

  return await response.json();
}