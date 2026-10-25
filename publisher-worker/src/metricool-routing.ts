/** Credential routing for independent Metricool brands, never based on editorial text alone. */
export interface MetricoolCredentialBindings<T> {
  COMPOSIO_API_KEY?: T;
  COMPOSIO_USER_ID?: T;
  METRICOOL_CONNECTED_ACCOUNT_ID?: string;
  Composio2?: T;
  COMPOSIO2_USER_ID?: T;
  COMPOSIO2_METRICOOL_CONNECTED_ACCOUNT_ID?: string;
}

export function metricoolCredentialsForBrand<T>(env: MetricoolCredentialBindings<T>, brandId: string): MetricoolCredentialBindings<T> {
  if (brandId === "3350145") return env;
  if (brandId !== "7653100") throw new Error("METRICOOL_BRAND_NOT_ALLOWLISTED");
  // A missing Composio2 must *never* be substituted by the primary API key.
  return {
    ...env,
    COMPOSIO_API_KEY: env.Composio2,
    COMPOSIO_USER_ID: env.COMPOSIO2_USER_ID ?? env.COMPOSIO_USER_ID,
    METRICOOL_CONNECTED_ACCOUNT_ID: env.COMPOSIO2_METRICOOL_CONNECTED_ACCOUNT_ID,
  };
}
