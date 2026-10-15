import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Campus from "./campus/Campus";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Campus />
  </StrictMode>,
);
