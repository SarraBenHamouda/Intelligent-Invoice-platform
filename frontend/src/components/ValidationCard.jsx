function ValidationCard({ validation }) {

  return (

    <div className="validation-box">

      <h2>
        AI Validation
      </h2>

      <div className="validation-score">
        {validation.score}/100
      </div>

      <div className="validation-status">
        {
          validation.valid
          ? "VALID INVOICE ✅"
          : "INVALID INVOICE ❌"
        }
      </div>

    </div>
  );
}

export default ValidationCard;