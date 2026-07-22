import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./app/App";
import "./styles.css";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Root element #root not found.");
}

const root = ReactDOM.createRoot(rootElement);

async function renderApp() {
  const appProps =
    import.meta.env.VITE_E2E_HARNESS === "harvest"
      ? (await import("./e2e/harvestE2eHarness")).createHarvestE2eAppProps()
      : {};

  root.render(
    <React.StrictMode>
      <App {...appProps} />
    </React.StrictMode>
  );
}

void renderApp();
