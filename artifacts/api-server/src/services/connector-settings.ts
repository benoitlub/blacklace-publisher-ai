import fs from "node:fs";
import path from "node:path";

export interface ConnectorFieldDefinition {
  readonly name: string;
  readonly label: string;
  readonly sensitive?: boolean;
}

export interface ConnectorSettingsDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly fields: ConnectorFieldDefinition[];
}

export interface PublicConnectorSetting {
  readonly id: string;
  readonly values: Record<string, string>;
  readonly secrets: Record<string, { configured: boolean; last4?: string }>;
  readonly updatedAt?: string;
}

const SETTINGS_FILE = path.resolve(process.cwd(), ".publisher-server", "connector-settings.json");

export const CONNECTOR_SETTINGS_DEFINITIONS: ConnectorSettingsDefinition[] = [
  {
    id: "ai-provider",
    displayName: "AI Provider",
    fields: [
      { name: "mode", label: "Mode" },
      { name: "provider", label: "Provider" },
      { name: "model", label: "Modele" }
    ]
  },
  {
    id: "knowledge-source",
    displayName: "Knowledge Source",
    fields: [
      { name: "connectorType", label: "Type de source" },
      { name: "sourceId", label: "Source ID" }
    ]
  },
  {
    id: "notion",
    displayName: "Notion",
    fields: [
      { name: "apiKey", label: "API Key", sensitive: true },
      { name: "pageId", label: "Page ID" },
      { name: "databaseId", label: "Database ID" }
    ]
  },
  {
    id: "github",
    displayName: "GitHub",
    fields: [
      { name: "token", label: "Token", sensitive: true },
      { name: "repo", label: "Repo" },
      { name: "branch", label: "Branche" }
    ]
  },
  {
    id: "mistral",
    displayName: "Mistral",
    fields: [
      { name: "apiKey", label: "API Key", sensitive: true },
      { name: "model", label: "Modele" }
    ]
  },
  {
    id: "instagram",
    displayName: "Instagram",
    fields: [
      { name: "token", label: "Token", sensitive: true },
      { name: "businessId", label: "Business ID" }
    ]
  },
  {
    id: "meta",
    displayName: "Meta",
    fields: [
      { name: "token", label: "Token", sensitive: true },
      { name: "pageId", label: "Page ID" },
      { name: "igUserId", label: "Instagram User ID" }
    ]
  },
  {
    id: "linkedin",
    displayName: "LinkedIn",
    fields: [
      { name: "token", label: "Token", sensitive: true },
      { name: "organizationId", label: "Organization ID" }
    ]
  },
  {
    id: "tiktok",
    displayName: "TikTok",
    fields: [
      { name: "token", label: "Token", sensitive: true },
      { name: "businessId", label: "Business ID" }
    ]
  },
  {
    id: "youtube",
    displayName: "YouTube",
    fields: [
      { name: "apiKey", label: "API Key", sensitive: true },
      { name: "channelId", label: "Channel ID" }
    ]
  },
  {
    id: "kdp",
    displayName: "KDP",
    fields: [
      { name: "accessKey", label: "Access Key", sensitive: true },
      { name: "secretKey", label: "Secret Key", sensitive: true },
      { name: "sellerId", label: "Seller ID" }
    ]
  }
];

type StoredSettings = Record<string, { values: Record<string, string>; updatedAt: string }>;

export function listPublicConnectorSettings(): PublicConnectorSetting[] {
  const stored = readSettings();
  return CONNECTOR_SETTINGS_DEFINITIONS.map((definition) => toPublicSetting(definition, stored[definition.id]));
}

export function getPublicConnectorSetting(id: string): PublicConnectorSetting | null {
  const definition = getDefinition(id);
  if (!definition) {
    return null;
  }

  return toPublicSetting(definition, readSettings()[id]);
}

export function updateConnectorSetting(id: string, values: Record<string, unknown>): PublicConnectorSetting | null {
  const definition = getDefinition(id);
  if (!definition) {
    return null;
  }

  const stored = readSettings();
  const previous = stored[id]?.values ?? {};
  const nextValues = { ...previous };

  for (const field of definition.fields) {
    const value = values[field.name];
    if (typeof value !== "string") {
      continue;
    }

    if (field.sensitive && value.trim() === "") {
      continue;
    }

    nextValues[field.name] = value.trim();
  }

  stored[id] = { values: nextValues, updatedAt: new Date().toISOString() };
  writeSettings(stored);
  return toPublicSetting(definition, stored[id]);
}

export function clearConnectorSetting(id: string): boolean {
  const stored = readSettings();
  if (!stored[id]) {
    return false;
  }

  delete stored[id];
  writeSettings(stored);
  return true;
}

export function getConnectorSecret(id: string, key: string): string | undefined {
  return readSettings()[id]?.values[key];
}

function getDefinition(id: string): ConnectorSettingsDefinition | undefined {
  return CONNECTOR_SETTINGS_DEFINITIONS.find((definition) => definition.id === id);
}

function toPublicSetting(
  definition: ConnectorSettingsDefinition,
  stored: { values: Record<string, string>; updatedAt: string } | undefined
): PublicConnectorSetting {
  const values: Record<string, string> = {};
  const secrets: PublicConnectorSetting["secrets"] = {};

  for (const field of definition.fields) {
    const value = stored?.values[field.name];
    if (field.sensitive) {
      secrets[field.name] = value ? { configured: true, last4: value.slice(-4) } : { configured: false };
    } else {
      values[field.name] = value ?? "";
    }
  }

  return { id: definition.id, values, secrets, updatedAt: stored?.updatedAt };
}

function readSettings(): StoredSettings {
  if (!fs.existsSync(SETTINGS_FILE)) {
    return {};
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
    return typeof parsed === "object" && parsed !== null ? (parsed as StoredSettings) : {};
  } catch {
    return {};
  }
}

function writeSettings(settings: StoredSettings): void {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}
