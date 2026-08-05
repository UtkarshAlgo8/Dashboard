/**
 * JKLoader — the standard JK Tyre branded loading indicator (a spinning
 * wheel with the JK monogram). Shown wherever a page/panel is still fetching,
 * in place of skeletons or "no data" placeholders, until the data is ready.
 *
 * Props:
 *   - message: the wait text (default "Please wait")
 *   - fullScreen: center it over a fixed, blurred full-viewport backdrop
 */
function JKLoader({ message = "Please wait", fullScreen = false }) {
  const loader = (
    <>
      <style>{`
        .jk-enhanced-loader {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 28px;
        }
        .jk-wrapper {
          position: relative;
          width: 105px;
          height: 105px;
        }
        .jk-halo {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: radial-gradient(circle, #ffd50022, transparent 70%);
          animation: haloPulse 2s ease-in-out infinite;
          filter: blur(4px);
        }
        @keyframes haloPulse {
          0%   { transform: scale(0.8); opacity: 0.4; }
          50%  { transform: scale(1.05); opacity: 0.85; }
          100% { transform: scale(0.8); opacity: 0.4; }
        }
        .jk-ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 10px solid #ffd500;
          box-shadow: 0 0 10px #ffd50055, inset 0 0 8px rgba(0,0,0,0.25);
        }
        .jk-rotate-layer {
          position: absolute;
          inset: 5px;
          animation: spinWheel 0.9s linear infinite;
          border-radius: 50%;
        }
        @keyframes spinWheel {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .jk-wheel {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          position: relative;
          background: radial-gradient(circle at 35% 35%, #4a4a4a, #000 80%);
          box-shadow: inset 0 0 15px #000, inset 0 -10px 15px #111, 0 4px 8px rgba(0,0,0,0.45);
        }
        .jk-wheel::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 3px solid #ffd500;
          box-shadow: 0 0 10px #ffd50050;
        }
        .jk-hub {
          width: 32px;
          height: 32px;
          background: #0c0c0c;
          border-radius: 50%;
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          display: flex;
          align-items: center;
          justify-content: center;
          animation: hubPulse 1.8s ease-in-out infinite;
          box-shadow: inset 0 0 10px #000, 0 0 6px rgba(0,0,0,0.7);
        }
        @keyframes hubPulse {
          0%   { transform: translate(-50%, -50%) scale(1); }
          50%  { transform: translate(-50%, -50%) scale(1.08); }
          100% { transform: translate(-50%, -50%) scale(1); }
        }
        .jk-hub .jk-logo {
          position: relative;
          width: 20px;
          height: 12px;
        }
        .jk-hub .jk-logo span {
          position: absolute;
          width: 6px;
          height: 12px;
          background: #ffd500;
          border-radius: 2px;
          transform: skewX(-20deg);
          box-shadow: 0 0 4px #ffd50088;
        }
        .jk-hub .jk-logo span:nth-child(1) { left: 0; }
        .jk-hub .jk-logo span:nth-child(2) { left: 7px; }
        .jk-hub .jk-logo span:nth-child(3) { left: 14px; }
        .jk-wait-text {
          margin-top: 14px;
          font-size: 15px;
          font-weight: 600;
          color: #333;
          letter-spacing: 2px;
          display: flex;
          align-items: center;
          padding-left: 25px;
        }
        .jk-wait-text .dots {
          display: inline-block;
          width: 24px;
          text-align: left;
          margin-left: 5px;
          font-weight: bold;
        }
        @keyframes dotsAnim {
          0%   { content: ""; }
          25%  { content: "."; }
          50%  { content: ".."; }
          75%  { content: "..."; }
          100% { content: ""; }
        }
        .jk-wait-text .dots::after {
          content: "";
          animation: dotsAnim 1.4s steps(4,end) infinite;
        }
      `}</style>
      <div className="jk-enhanced-loader">
        <div className="jk-wrapper">
          <div className="jk-halo"></div>
          <div className="jk-ring"></div>
          <div className="jk-rotate-layer">
            <div className="jk-wheel"></div>
          </div>
          <div className="jk-hub">
            <div className="jk-logo">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </div>
        <div className="jk-wait-text">
          {message}
          <span className="dots"></span>
        </div>
      </div>
    </>
  );

  if (!fullScreen) return loader;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1400,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(255,255,255,0.72)",
        backdropFilter: "blur(2px)",
      }}
    >
      {loader}
    </div>
  );
}

export default JKLoader;
