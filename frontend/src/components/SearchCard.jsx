import { useState } from "react";
import { fetchInvoice } from "../services/api";

function SearchCard({
  setInvoiceData,
  setValidation
}) {

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [clientCode, setClientCode] = useState("");

  const handleSubmit = async (e) => {

    e.preventDefault();

    const result = await fetchInvoice(
      invoiceNumber,
      clientCode
    );

    setInvoiceData(result.data);
    setValidation(result.validation);
  };

  return (

    <div className="search-card">

      <h2>
        Search Invoice
      </h2>

      <form onSubmit={handleSubmit}>

        <input
          type="text"
          placeholder="Invoice Number"
          value={invoiceNumber}
          onChange={(e)=>setInvoiceNumber(e.target.value)}
        />

        <input
          type="text"
          placeholder="Client Code"
          value={clientCode}
          onChange={(e)=>setClientCode(e.target.value)}
        />

        <button type="submit">
          Extract Invoice
        </button>

      </form>

    </div>
  );
}

export default SearchCard;