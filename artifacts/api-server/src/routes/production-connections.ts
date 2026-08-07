import type { Request, Response } from "express";
import { Router } from "express";
import {
  findComposioAuthConfig,
  initiateComposioConnection,
  isActiveComposioStatus,
  isComposioConfigured,
  listComposioConnectedAccounts,
} from "../services/composio";

const router = Router();
const COMPOSIO_USER_ID = process.env.COMPOSIO_USER_ID?.trim() || "benoit-lubert";
const SUPPORTED_TOOLKITS = new Set(["canva", "elevenlabs", "notion"]);
const COMPOSIO_CONNECT_ERROR = "La connexion Canva n’a pas pu être ouverte. Le connecteur Composio doit être mis à jour.";

function normalizeToolkit(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function callbackUrl(): string {
  return (
    process.env.COMPOSIO_CALLBACK_URL?.trim() ||
    process.env.PUBLISHER_FRONTEND_URL?.trim() ||
    "https://blacklace-publisher-web.onrender.com/"
  );
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Erreur inconnue";
  return message
    .replace(/ak_[a-zA-Z0-9_-]+/g, "[secret]")
    .replace(/Bearer\s+[a-zA-Z0-9._-]+/g, "Bearer [secret]");
}

async function connectionState(toolkit: string) {
  const accounts = await listComposioConnectedAccounts(COMPOSIO_USER_ID);
  const account = accounts.find(
    (candidate) => candidate.toolkitSlug === toolkit && isActiveComposioStatus(candidate.status),
  );
  return { accounts, account: account ?? null };
}

async function initiate(toolkit: string) {
  if (!isComposioConfigured()) {
    return {
      status: 503,
      body: {
        status: "unavailable",
        toolkit,
        error: "COMPOSIO_API_KEY n'est pas configurée sur Publisher API.",
      },
    };
  }

  if (!SUPPORTED_TOOLKITS.has(toolkit)) {
    return {
      status: 400,
      body: {
        status: "unsupported",
        toolkit,
        error: "Toolkit non pris en charge par le flux de connexion Publisher.",
      },
    };
  }

  const { account } = await connectionState(toolkit);
  if (account) {
    return {
      status: 200,
      body: {
        status: "connected",
        toolkit,
        userId: COMPOSIO_USER_ID,
        connectedAccountId: account.id,
        redirectUrl: null,
      },
    };
  }

  const authConfigId = await findComposioAuthConfig(toolkit);
  const request = await initiateComposioConnection({
    userId: COMPOSIO_USER_ID,
    toolkitSlug: toolkit,
    authConfigId,
    callbackUrl: callbackUrl(),
  });

  if (!request.redirectUrl) {
    return {
      status: 502,
      body: {
        status: "failed",
        toolkit,
        userId: COMPOSIO_USER_ID,
        connectedAccountId: request.id,
        error: "Composio n'a pas retourné d'URL d'autorisation.",
      },
    };
  }

  return {
    status: 201,
    body: {
      status: "waiting-authorization",
      toolkit,
      userId: COMPOSIO_USER_ID,
      connectedAccountId: request.id,
      redirectUrl: request.redirectUrl,
      callbackUrl: callbackUrl(),
    },
  };
}

router.get("/connections", async (req: Request, res: Response) => {
  try {
    if (!isComposioConfigured()) {
      return res.status(503).json({
        configured: false,
        userId: COMPOSIO_USER_ID,
        connectedAccounts: [],
      });
    }

    const accounts = await listComposioConnectedAccounts(COMPOSIO_USER_ID);
    return res.json({
      configured: true,
      userId: COMPOSIO_USER_ID,
      connectedAccounts: accounts.map((account) => ({
        id: account.id,
        toolkitSlug: account.toolkitSlug,
        status: account.status,
        active: isActiveComposioStatus(account.status),
      })),
    });
  } catch (error) {
    return res.status(502).json({
      configured: isComposioConfigured(),
      userId: COMPOSIO_USER_ID,
      connectedAccounts: [],
      error: safeError(error),
    });
  }
});

router.post("/connections/:toolkit/connect", async (req, res) => {
  const toolkit = normalizeToolkit(req.params.toolkit);
  try {
    const result = await initiate(toolkit);
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.warn("[composio] production connection failed", safeError(error));
    return res.status(502).json({
      status: "failed",
      toolkit,
      userId: COMPOSIO_USER_ID,
      error: COMPOSIO_CONNECT_ERROR,
    });
  }
});

router.get("/connections/:toolkit/authorize", async (req, res) => {
  const toolkit = normalizeToolkit(req.params.toolkit);
  try {
    const result = await initiate(toolkit);
    const redirectUrl = "redirectUrl" in result.body ? result.body.redirectUrl : null;
    if (typeof redirectUrl === "string" && redirectUrl) {
      return res.redirect(302, redirectUrl);
    }
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.warn("[composio] production authorization failed", safeError(error));
    return res.status(502).json({
      status: "failed",
      toolkit,
      userId: COMPOSIO_USER_ID,
      error: COMPOSIO_CONNECT_ERROR,
    });
  }
});

export default router;
