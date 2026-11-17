import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
// A panel window receives its existing DOM from the main renderer after load.
// It must never boot a second application, polling loop or document session.
if (!new URLSearchParams(window.location.search).has('panelWindow')) createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
