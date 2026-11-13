import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="empty-panel">
        <h1>Tampilan belum dapat dibuka</h1>
        <p>
          Muat ulang aplikasi. Isian yang belum tersimpan mungkin perlu diisi
          kembali.
        </p>
        <button
          className="button button-primary"
          onClick={() => location.reload()}
        >
          Muat ulang
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
