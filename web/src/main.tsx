import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Register the service worker AFTER load so it never competes with
// initial render. The registration was previously an inline <script> in
// index.html; moving it into the bundle lets the CSP drop 'unsafe-inline'
// for scripts (script-src 'self' + nonce-free module script only).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
