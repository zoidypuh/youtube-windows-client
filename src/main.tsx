import { Component, StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

type CrashBoundaryState = {
  error: Error | null;
};

class CrashBoundary extends Component<{ children: ReactNode }, CrashBoundaryState> {
  override state: CrashBoundaryState = {
    error: null
  };

  static getDerivedStateFromError(error: Error): CrashBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, errorInfo: { componentStack?: string }) {
    console.error("[renderer] uncaught render error", error, errorInfo.componentStack ?? "");
  }

  override render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100%",
            display: "grid",
            placeItems: "center",
            padding: "24px",
            color: "#f6f3ef",
            background: "#0b1014",
            fontFamily: "\"Segoe UI\", sans-serif"
          }}
        >
          <div style={{ maxWidth: "720px" }}>
            <h1 style={{ marginTop: 0 }}>Renderer crashed</h1>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                padding: "16px",
                borderRadius: "16px",
                background: "rgba(255, 255, 255, 0.06)"
              }}
            >
              {this.state.error.stack ?? this.state.error.message}
            </pre>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

window.addEventListener("error", (event) => {
  console.error("[renderer] window error", event.error ?? event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[renderer] unhandled rejection", event.reason);
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CrashBoundary>
      <App />
    </CrashBoundary>
  </StrictMode>
);
