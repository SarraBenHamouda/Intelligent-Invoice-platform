function PipelineTimeline() {

  return (

    <div className="timeline">

      <div className="timeline-step">ERP</div>
      <div className="timeline-arrow">→</div>

      <div className="timeline-step">Extraction</div>
      <div className="timeline-arrow">→</div>

      <div className="timeline-step">Validation AI</div>
      <div className="timeline-arrow">→</div>

      <div className="timeline-step">TEIF XML</div>
      <div className="timeline-arrow">→</div>

      <div className="timeline-step">Signature</div>
      <div className="timeline-arrow">→</div>

      <div className="timeline-step">TTN</div>

    </div>
  );
}

export default PipelineTimeline;