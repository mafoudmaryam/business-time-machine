import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App.tsx";
import { ConfigProvider } from "./components/ConfigProvider.tsx";
import { UndoProvider } from "./components/UndoProvider.tsx";
import "./theme.css";
import "./index.css";
import "./beginner.css";
import "./redesign.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ConfigProvider>
        <UndoProvider>
          <App />
        </UndoProvider>
      </ConfigProvider>
    </BrowserRouter>
  </StrictMode>,
);
