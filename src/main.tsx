import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// dev-only test hooks for automated acceptance runs
if (import.meta.env.DEV) {
  void Promise.all([import("./layers/layerStore"), import("./assets/assetStore")]).then(
    ([layers, assets]) => {
      const w = window as unknown as Record<string, unknown>;
      w.__layercut = layers.useEditorStore;
      w.__layercutAssets = assets.useAssetStore;
    }
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
