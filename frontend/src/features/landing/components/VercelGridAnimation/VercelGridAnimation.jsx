function VercelGridAnimation() {
  return (
    <div
      className="vercel-grid-animation"
      aria-hidden="true"
    >
      <div className="vercel-grid-lines" />

      <div className="vercel-grid-glow vercel-grid-glow-one" />

      <div className="vercel-grid-glow vercel-grid-glow-two" />

      <div className="vercel-moving-beam">
        <span />
      </div>

      <div className="vercel-grid-point point-one" />
      <div className="vercel-grid-point point-two" />
      <div className="vercel-grid-point point-three" />
      <div className="vercel-grid-point point-four" />
    </div>
  );
}

export default VercelGridAnimation;