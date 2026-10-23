// Simulated Composio registry, based on the public Metricool MCP signatures.
// These are not claimed to be the slugs/schemas deployed in the user's project.
const string = { type: "string" }, integer = { type: "integer" }, boolean = { type: "boolean" };
export function metricoolToolFixtures() {
  const signatures: Record<string, Record<string, unknown>> = {
    get_brands: {},
    get_scheduled_posts: { blog_id: integer, start: string, end: string, timezone: string, extendedRange: boolean },
    get_best_time_to_post: { start: string, end: string, blog_id: integer, provider: string, timezone: string },
    post_schedule_post: { date: string, blog_id: integer, info: { type: "object" } },
  };
  for (const name of ["facebook_posts", "facebook_reels", "facebook_stories", "instagram_posts", "instagram_reels", "instagram_stories", "youtube_videos"]) {
    signatures[`get_${name}`] = { init_date: string, end_date: string, blog_id: integer };
  }
  return Object.entries(signatures).map(([name, properties]) => ({ slug: `METRICOOL_MCP_${name.toUpperCase()}`, name,
    toolkit: { slug: "metricool_mcp" }, description: name,
    inputSchema: { type: "object", properties, required: Object.keys(properties), additionalProperties: false } }));
}
export const metricoolAccount = { id: "metricool-test-connection", toolkitSlug: "metricool-mcp", status: "ACTIVE" };
export const simulatedBrand = { id: 3350145, label: "pro.hbtd", timezone: "Europe/Madrid", networks: ["facebook", "instagram"] };
export function toolOperation(slug: string) { return slug.replace(/^METRICOOL_MCP_/, "").toLowerCase(); }
export const envelope = (data: unknown) => ({ successful: true, data: { content: [{ type: "text", text: JSON.stringify(data) }] } });
