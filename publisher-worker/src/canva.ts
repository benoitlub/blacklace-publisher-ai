import { getSql } from "./db";
import type { SecretsStoreSecret } from "./worker";

/**
 * Canva Connect API, appelée en direct — sans Composio.
 *
 * Pourquoi ce module existe
 * -------------------------
 * Le visuel passait jusqu'ici par Composio, dont le catalogue Canva n'expose
 * qu'un seul outil de création (`CANVA_CREATE_CANVA_DESIGN_WITH_OPTIONAL_ASSET`),
 * de schéma `{title, asset_id}` — sans `design_type`, et sans aucun outil pour
 * créer l'asset qu'il réclame. Canva exige « l'un de design_type ou asset_id ».
 * Aucune des deux portes n'était donc ouverte : 45 itérations de Gérard ont
 * échoué là, en silence.
 *
 * Vérifié depuis le connecteur Canva officiel : la création d'un design à
 * partir d'un simple brief fonctionne. Le blocage venait de l'intermédiaire.
 *
 * Ce que la Connect API permet — et ne permet pas
 * ----------------------------------------------
 * La spec OpenAPI publique (2024-06-18) est formelle :
 *
 * - `POST /v1/designs` crée un design **vide**, dimensionné par `design_type`,
 *   avec au mieux une image déjà présente dans le compte (`asset_id`). Il n'y
 *   met aucun texte. Un design vide non édité est supprimé au bout de 7 jours.
 * - `POST /v1/autofills` remplit un **brand template** avec des données. C'est
 *   la seule voie qui produit un visuel réellement porteur du texte.
 * - Il n'existe **aucun** endpoint de génération par IA à partir d'un texte.
 *   Celui du connecteur MCP n'appartient pas à l'API publique.
 *
 * D'où le choix ici : l'autofill, et rien d'autre. Sans brand template
 * configuré, ce module renvoie un échec nommé. Il ne fabrique pas un design
 * vide pour faire croire à un visuel — c'est précisément l'erreur que tout ce
 * chantier a passé son temps à défaire.
 *
 * L'autofill demande un compte Canva Enterprise (les offres payantes y ont un
 * quota d'essai pendant le développement de l'intégration). Ce n'est pas une
 * limite qu'on peut contourner en code : elle est annoncée par l'API elle-même,
 * et remontée telle quelle par `reason: "not-entitled"`.
 */

const CANVA_API_BASE = "https://api.canva.com/rest";

/** L'autofill est asynchrone : le job est créé, puis interrogé. */
const AUTOFILL_POLL_INTERVAL_MS = 1_000;
const AUTOFILL_POLL_TIMEOUT_MS = 25_000;

export interface CanvaEnv {
  CANVA_CLIENT_ID?: string;
  CANVA_CLIENT_SECRET?: string | SecretsStoreSecret;
  /**
   * Jeton de rafraîchissement initial, obtenu une fois à la main via le flux
   * d'autorisation. Il n'est lu que si la base n'en porte pas encore : Canva
   * fait tourner ce jeton à chaque usage, et c'est la version tournée qui fait
   * foi ensuite.
   */
  CANVA_REFRESH_TOKEN?: string | SecretsStoreSecret;
  /** Brand template à remplir. Sans lui, aucun visuel n'est produit. */
  CANVA_BRAND_TEMPLATE_ID?: string;
  DATABASE_URL?: string | SecretsStoreSecret;
}

async function secretValue(value: string | SecretsStoreSecret | undefined): Promise<string> {
  if (typeof value === "string") return value.trim();
  if (value && typeof (value as SecretsStoreSecret).get === "function") {
    try {
      const resolved = await (value as SecretsStoreSecret).get();
      return typeof resolved === "string" ? resolved.trim() : "";
    } catch (_) {
      return "";
    }
  }
  return "";
}

export function isCanvaConfigured(env: CanvaEnv): boolean {
  return Boolean(env.CANVA_CLIENT_ID?.trim() && env.CANVA_BRAND_TEMPLATE_ID?.trim());
}

// ---------------------------------------------------------------------------
// Erreurs
// ---------------------------------------------------------------------------

export class CanvaHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "CanvaHttpError";
    this.status = status;
  }

  /**
   * 403 sur l'autofill = compte hors Canva Enterprise, ou quota d'essai épuisé.
   * Ce n'est pas une panne : c'est un droit manquant, et il faut le dire
   * autrement qu'en réessayant.
   */
  get isEntitlement(): boolean {
    return this.status === 403;
  }
}

// ---------------------------------------------------------------------------
// OAuth — jeton d'accès, et rotation du jeton de rafraîchissement
// ---------------------------------------------------------------------------

/**
 * Canva rend un **nouveau** jeton de rafraîchissement à chaque échange et
 * invalide l'ancien. Le garder en mémoire d'isolate ne suffit donc pas : au
 * recyclage, le Worker repartirait d'un jeton déjà consommé et perdrait l'accès
 * définitivement. Il est donc persisté en base, comme le reste de l'état.
 */
export async function ensureCanvaSchema(env: CanvaEnv): Promise<void> {
  const sql = await getSql(env);
  await sql`
    CREATE TABLE IF NOT EXISTS canva_oauth (
      id TEXT PRIMARY KEY,
      refresh_token TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

async function readStoredRefreshToken(env: CanvaEnv): Promise<string> {
  try {
    const sql = await getSql(env);
    const rows = (await sql`SELECT refresh_token FROM canva_oauth WHERE id = 'default'`) as Array<{ refresh_token: string }>;
    return rows[0]?.refresh_token?.trim() || "";
  } catch (_) {
    // Table absente au tout premier passage : on retombe sur le secret.
    return "";
  }
}

async function storeRefreshToken(env: CanvaEnv, token: string): Promise<void> {
  const sql = await getSql(env);
  await sql`
    INSERT INTO canva_oauth (id, refresh_token, updated_at)
    VALUES ('default', ${token}, now())
    ON CONFLICT (id) DO UPDATE SET refresh_token = EXCLUDED.refresh_token, updated_at = now()
  `;
}

/** Jeton d'accès en cache d'isolate — valable 4 heures côté Canva. */
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

/** Marge avant expiration, pour ne pas partir avec un jeton qui meurt en vol. */
const ACCESS_TOKEN_SAFETY_MS = 60_000;

export async function getCanvaAccessToken(env: CanvaEnv): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + ACCESS_TOKEN_SAFETY_MS) {
    return cachedAccessToken.token;
  }

  const clientId = env.CANVA_CLIENT_ID?.trim();
  const clientSecret = await secretValue(env.CANVA_CLIENT_SECRET);
  if (!clientId || !clientSecret) {
    throw new Error("CANVA_CLIENT_ID / CANVA_CLIENT_SECRET ne sont pas configurés.");
  }

  await ensureCanvaSchema(env);
  const refreshToken = (await readStoredRefreshToken(env)) || (await secretValue(env.CANVA_REFRESH_TOKEN));
  if (!refreshToken) {
    throw new Error("Aucun jeton de rafraîchissement Canva : l'autorisation initiale n'a pas été faite.");
  }

  // Authentification recommandée par Canva : Basic {base64(client_id:secret)}.
  const credentials = btoa(`${clientId}:${clientSecret}`);
  const response = await fetch(`${CANVA_API_BASE}/v1/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new CanvaHttpError(response.status, `Canva OAuth ${response.status}: ${text.slice(0, 300)}`);
  }

  const payload = JSON.parse(text) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!payload.access_token) {
    throw new Error("Réponse OAuth Canva sans access_token.");
  }

  // La rotation d'abord : si l'écriture échoue, mieux vaut le savoir tout de
  // suite que de découvrir au prochain réveil que le jeton stocké est périmé.
  if (payload.refresh_token && payload.refresh_token !== refreshToken) {
    await storeRefreshToken(env, payload.refresh_token);
  }

  const expiresInMs = (payload.expires_in ?? 14_400) * 1_000;
  cachedAccessToken = { token: payload.access_token, expiresAt: Date.now() + expiresInMs };
  return payload.access_token;
}

async function canvaRequest(env: CanvaEnv, path: string, init: RequestInit = {}): Promise<unknown> {
  const accessToken = await getCanvaAccessToken(env);
  const response = await fetch(`${CANVA_API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let payload: unknown = null;
  try { payload = text ? JSON.parse(text) : null; } catch (_) { payload = { message: text }; }
  if (!response.ok) {
    const record = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
    const message = typeof record.message === "string" ? record.message : text || `Canva ${response.status}`;
    throw new CanvaHttpError(response.status, `Canva ${response.status}: ${message}`);
  }
  return payload;
}

// ---------------------------------------------------------------------------
// Brand template : découverte des champs
// ---------------------------------------------------------------------------

export interface BrandTemplateField {
  name: string;
  type: string;
}

/**
 * Les noms des champs d'un brand template sont choisis par celui qui l'a
 * dessiné : impossible de les deviner. On les lit, plutôt que de parier.
 */
export async function getBrandTemplateFields(env: CanvaEnv, brandTemplateId: string): Promise<BrandTemplateField[]> {
  const payload = (await canvaRequest(env, `/v1/brand-templates/${encodeURIComponent(brandTemplateId)}/dataset`)) as {
    dataset?: Record<string, { type?: string }>;
  };
  const dataset = payload?.dataset ?? {};
  return Object.entries(dataset).map(([name, definition]) => ({ name, type: String(definition?.type ?? "unknown") }));
}

/**
 * Répartit un titre et un corps de texte dans les champs texte du template.
 *
 * Heuristique assumée et volontairement simple : un champ dont le nom évoque un
 * titre reçoit le titre, les autres champs texte reçoivent le corps. Elle n'est
 * pas devinée dans le vide — elle s'applique aux noms réellement déclarés par le
 * template, et si aucun champ texte n'existe, l'appelant est prévenu plutôt que
 * de recevoir un visuel vide.
 */
export function mapTextToTemplateFields(
  fields: BrandTemplateField[],
  input: { title: string; body?: string },
): Record<string, { type: "text"; text: string }> {
  const textFields = fields.filter((field) => field.type === "text");
  const data: Record<string, { type: "text"; text: string }> = {};
  const looksLikeTitle = /titre|title|heading|headline|nom|name/i;

  const titleField = textFields.find((field) => looksLikeTitle.test(field.name));
  const body = input.body?.trim();

  for (const field of textFields) {
    if (titleField && field.name === titleField.name) {
      data[field.name] = { type: "text", text: input.title };
    } else {
      data[field.name] = { type: "text", text: body || input.title };
    }
  }

  // Aucun champ ne ressemble à un titre : le premier le porte, les suivants le
  // corps. Mieux vaut un placement discutable qu'un template à moitié vide.
  if (!titleField && textFields.length > 0) {
    data[textFields[0].name] = { type: "text", text: input.title };
  }

  return data;
}

// ---------------------------------------------------------------------------
// Autofill
// ---------------------------------------------------------------------------

export type CanvaVisualResult =
  | { ok: true; url: string; designId: string; brandTemplateId: string }
  | { ok: false; reason: CanvaFailureReason; detail: string };

export type CanvaFailureReason =
  /** Ni client OAuth ni brand template configurés. */
  | "not-configured"
  /** L'autorisation initiale n'a jamais été faite, ou le jeton est mort. */
  | "not-authorized"
  /** Compte hors Canva Enterprise, ou quota d'essai épuisé. */
  | "not-entitled"
  /** Le template n'expose aucun champ texte à remplir. */
  | "template-has-no-text-field"
  /** Le job a échoué côté Canva. */
  | "autofill-failed"
  /** Le job n'a pas abouti dans le temps imparti. */
  | "autofill-timeout"
  /** Tout le reste, message conservé. */
  | "error";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Produit un visuel Canva réellement porteur du texte, ou dit pourquoi il n'a
 * pas pu. Ne renvoie jamais un design vide en le faisant passer pour un visuel.
 */
export async function createCanvaVisual(
  env: CanvaEnv,
  input: { title: string; body?: string },
): Promise<CanvaVisualResult> {
  const brandTemplateId = env.CANVA_BRAND_TEMPLATE_ID?.trim();
  if (!isCanvaConfigured(env) || !brandTemplateId) {
    return {
      ok: false,
      reason: "not-configured",
      detail: "CANVA_CLIENT_ID et CANVA_BRAND_TEMPLATE_ID sont requis pour produire un visuel.",
    };
  }

  try {
    const fields = await getBrandTemplateFields(env, brandTemplateId);
    const data = mapTextToTemplateFields(fields, input);

    if (Object.keys(data).length === 0) {
      return {
        ok: false,
        reason: "template-has-no-text-field",
        detail: `Le brand template ${brandTemplateId} ne déclare aucun champ de type texte.`,
      };
    }

    const created = (await canvaRequest(env, "/v1/autofills", {
      method: "POST",
      body: JSON.stringify({
        type: "create_from_brand_template",
        brand_template_id: brandTemplateId,
        title: input.title.slice(0, 255),
        data,
      }),
    })) as { job?: { id?: string; status?: string } };

    const jobId = created?.job?.id;
    if (!jobId) {
      return { ok: false, reason: "autofill-failed", detail: "Canva n'a pas rendu d'identifiant de job." };
    }

    const deadline = Date.now() + AUTOFILL_POLL_TIMEOUT_MS;
    let job = created.job;

    while (job?.status === "in_progress" && Date.now() < deadline) {
      await sleep(AUTOFILL_POLL_INTERVAL_MS);
      const polled = (await canvaRequest(env, `/v1/autofills/${encodeURIComponent(jobId)}`)) as {
        job?: { id?: string; status?: string; result?: { design?: { id?: string; url?: string } }; error?: { message?: string } };
      };
      job = polled?.job;
    }

    if (job?.status === "success") {
      const design = (job as { result?: { design?: { id?: string; url?: string } } }).result?.design;
      const url = design?.url?.trim();
      if (!url) {
        return { ok: false, reason: "autofill-failed", detail: "Job réussi mais sans URL de design." };
      }
      return { ok: true, url, designId: design?.id ?? jobId, brandTemplateId };
    }

    if (job?.status === "failed") {
      const message = (job as { error?: { message?: string } }).error?.message ?? "Cause non précisée par Canva.";
      return { ok: false, reason: "autofill-failed", detail: message };
    }

    return {
      ok: false,
      reason: "autofill-timeout",
      detail: `Le job ${jobId} était encore en cours après ${AUTOFILL_POLL_TIMEOUT_MS / 1000} s.`,
    };
  } catch (error) {
    if (error instanceof CanvaHttpError) {
      if (error.isEntitlement) {
        return {
          ok: false,
          reason: "not-entitled",
          detail: `${error.message} — l'autofill demande un compte Canva Enterprise (essai limité sur les offres payantes).`,
        };
      }
      if (error.status === 401) {
        return { ok: false, reason: "not-authorized", detail: error.message };
      }
      return { ok: false, reason: "error", detail: error.message };
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: /jeton de rafraîchissement|OAuth/i.test(message) ? "not-authorized" : "error",
      detail: message,
    };
  }
}
