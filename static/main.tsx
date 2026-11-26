import React from "react";
import { createRoot } from "react-dom/client";
import { GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import workerSource from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?raw";
import "@/app/globals.css";
import App from "@/components/App";
import { localStore } from "@/lib/store/local";

// A blob URL keeps the PDF worker inside the single HTML file (including file:// and Electron).
GlobalWorkerOptions.workerSrc = URL.createObjectURL(
  new Blob([workerSource], { type: "text/javascript" }),
);

const container = document.getElementById("root");
if (!container) throw new Error("The app root element is missing.");

createRoot(container).render(
  <React.StrictMode>
    <App store={localStore} />
  </React.StrictMode>,
);
