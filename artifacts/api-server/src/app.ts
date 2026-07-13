import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Alias kept at the service root because the Publisher local-technique page
// and Render probes historically used /health while the canonical API route
// is /api/healthz.
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "blacklace-publisher-api",
    api: "/api",
    canonicalHealth: "/api/healthz",
  });
});

app.use("/api", router);

export default app;
