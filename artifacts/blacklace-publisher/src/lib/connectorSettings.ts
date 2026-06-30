export type ConnectorMode = "mock" | "read-only" | "connected" | "auto" | "server";
export type KnowledgeConnectorType = "notion" | "markdown" | "github" | "mock";

export interface ConnectorSettingValues {
  readonly repositoryFullName?: string;
  readonly branch?: string;
  readonly mode?: ConnectorMode;
  readonly notionPageId?: string;
  readonly notionDatabaseId?: string;
  readonly defaultProvider?: string;
  readonly apiBaseUrl?: string;
  readonly model?: string;
  readonly metaPageId?: string;
  readonly metaIgUserId?: string;
  readonly connectorType?: KnowledgeConnectorType;
  readonly sourceId?: string;
}

export type ConnectorSettings = Record<string, ConnectorSettingValues>;

const CONNECTOR_SETTINGS_STORAGE_KEY = "publisher-ai:connector-settings";
export const CONNECTOR_SETTINGS_CHANGED_EVENT = "publisher-ai:connector-settings-changed";

export function loadConnectorSettings(): ConnectorSettings {
  const raw = window.localStorage.getItem(CONNECTOR_SETTINGS_STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    return isConnectorSettings(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveConnectorSettings(settings: ConnectorSettings): void {
  window.localStorage.setItem(CONNECTOR_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  notifyConnectorSettingsChanged();
}

export function updateConnectorSetting(connectorId: string, values: ConnectorSettingValues): ConnectorSettings {
  const settings = loadConnectorSettings();
  const sanitizedValues = sanitizeConnectorValues(values);
  const nextSettings = {
    ...settings,
    [connectorId]: sanitizedValues
  };

  saveConnectorSettings(nextSettings);
  return nextSettings;
}

export function clearConnectorSetting(connectorId: string): ConnectorSettings {
  const settings = loadConnectorSettings();
  const nextSettings = { ...settings };
  delete nextSettings[connectorId];
  saveConnectorSettings(nextSettings);
  return nextSettings;
}

export function hasLocalConnectorValues(values: ConnectorSettingValues | undefined): boolean {
  if (!values) {
    return false;
  }

  return Object.entries(values).some(([key, value]) => {
    if (key === "mode") {
      return value !== "mock";
    }

    return typeof value === "string" && value.trim().length > 0;
  });
}

function sanitizeConnectorValues(values: ConnectorSettingValues): ConnectorSettingValues {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, typeof value === "string" ? value.trim() : value])
  ) as ConnectorSettingValues;
}

function notifyConnectorSettingsChanged(): void {
  window.dispatchEvent(new Event(CONNECTOR_SETTINGS_CHANGED_EVENT));
}

function isConnectorSettings(value: unknown): value is ConnectorSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((setting) => typeof setting === "object" && setting !== null && !Array.isArray(setting));
}
