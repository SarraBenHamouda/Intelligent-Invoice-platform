function AlertsPanel({ validation }) {

  return (

    <div className="alerts-panel">

      <h2>
        AI Alerts
      </h2>

      {
        validation.warnings?.map((warning,index)=>(
          <div key={index} className="warning-item">
            ⚠ {warning}
          </div>
        ))
      }

      {
        validation.errors?.map((error,index)=>(
          <div key={index} className="error-item">
            ❌ {error}
          </div>
        ))
      }

    </div>
  );
}

export default AlertsPanel;