import JkAgentLauncher from "./JkAgentLauncher.jsx";
import JkAgentWindow from "./JkAgentWindow.jsx";

/**
 * Main JK Agent entry component containing launcher and window.
 */
export default function JkAgent() {
  return (
    <>
      <JkAgentLauncher />
      <JkAgentWindow />
    </>
  );
}
