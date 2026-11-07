import "@mantine/charts/styles.css";
import "@mantine/core/styles.css";
import { MantineProvider } from "@mantine/core";
import "./index.css";
import "./theme.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { installGlobalLogging } from "./data/log";
import { I18nProvider } from "./i18n";
import { theme } from "./theme";

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");

installGlobalLogging();

createRoot(root).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <BrowserRouter>
        <I18nProvider>
          <App />
        </I18nProvider>
      </BrowserRouter>
    </MantineProvider>
  </StrictMode>,
);
