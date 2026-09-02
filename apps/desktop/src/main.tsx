import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  StartupDebugRoot,
  installStartupDebug,
  logStartup,
} from "@chestnut/ui/startup-debug";
import "@chestnut/ui/styles.css";

function mountDebugHost(): void {
  try {
    installStartupDebug();
    logStartup("main: debug host mounting");
    const debugHost = document.getElementById("chestnut-debug-host");
    if (!debugHost) {
      logStartup("main: debug host missing", undefined, "error");
      return;
    }
    createRoot(debugHost).render(<StartupDebugRoot />);
    logStartup("main: debug host mounted");
  } catch (err) {
    console.error("[Chestnut] startup debug host failed:", err);
  }
}

function mountApp(): void {
  const root = document.getElementById("root");
  if (!root) {
    logStartup("main: #root missing", undefined, "error");
    return;
  }
  logStartup("main: loading app module");
  void import("@chestnut/ui")
    .then(({ App, ErrorBoundary }) => {
      logStartup("main: app module loaded, rendering");
      createRoot(root).render(
        <StrictMode>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </StrictMode>,
      );
      logStartup("main: createRoot render scheduled");
    })
    .catch((err) => {
      logStartup("main: app module failed", String(err), "error");
      console.error("[Chestnut] app module failed:", err);
    });
}

mountDebugHost();
mountApp();
