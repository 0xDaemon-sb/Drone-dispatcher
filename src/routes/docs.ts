import { Router } from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";

import { openApiDocument } from "../docs/openapi.js";

export const docsRouter = Router();

docsRouter.get("/openapi.json", (_request, response) => {
  response.json(openApiDocument);
});

// Keep local HTTP documentation usable without requiring a TLS proxy.
docsRouter.get("/", helmet.contentSecurityPolicy({
  directives: { upgradeInsecureRequests: null },
}), swaggerUi.setup(null, {
  customSiteTitle: "Blusalt API Documentation",
  swaggerOptions: { url: "/openapi.json", validatorUrl: null, displayRequestDuration: true },
}));
docsRouter.get([
  "/swagger-ui.css", "/swagger-ui-bundle.js", "/swagger-ui-standalone-preset.js",
  "/swagger-ui-init.js", "/favicon-16x16.png", "/favicon-32x32.png",
], swaggerUi.serve);
