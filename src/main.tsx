import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { RegionCaptureOverlay } from "./features/system/region-capture/RegionCaptureOverlay";
import "./styles.css";

const params = new URLSearchParams(window.location.search);
const windowType = params.get("window");
const isOverlayWindow = windowType === "overlay";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isOverlayWindow ? <RegionCaptureOverlay /> : <App />}
  </React.StrictMode>
);
