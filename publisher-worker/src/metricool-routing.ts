/** Two Metricool accounts in the same trusted Composio project. */
export interface MetricoolCredentialBindings<T> {
  COMPOSIO_API_KEY?: T;
  COMPOSIO_USER_ID?: T;
  METRICOOL_CONNECTED_ACCOUNT_ID?: string;
  METRICOOL_BLACKLACE_CONNECTED_ACCOUNT_ID?: string;
}

export function metricoolCredentialsForBrand<T>(env: MetricoolCredentialBindings<T>, brandId: string): MetricoolCredentialBindings<T> {
  if (brandId === "3350145") return env;
  if (brandId !== "7653100") throw new Error("METRICOOL_BRAND_NOT_ALLOWLISTED");
  const accountId = env.METRICOOL_BLACKLACE_CONNECTED_ACCOUNT_ID?.trim();
  if (!accountId) throw new Error("BLACKLACE_METRICOOL_ACCOUNT_NOT_CONFIGURED");
  if (accountId === env.METRICOOL_CONNECTED_ACCOUNT_ID?.trim()) throw new Error("METRICOOL_ACCOUNT_DESTINATION_COLLISION");
  // Keep the original API key and user: only the connected account changes.
  return { ...env, METRICOOL_CONNECTED_ACCOUNT_ID: accountId };
}
