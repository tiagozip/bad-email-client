import "@cloudflare/kumo/styles/standalone";
import "./theme.css";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { scrubLegacyPass } from "./pgp.js";

scrubLegacyPass();

createRoot(document.getElementById("root")).render(<App />);
