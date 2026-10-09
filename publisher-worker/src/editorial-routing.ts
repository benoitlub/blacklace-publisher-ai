/** Editorial destination selection, separate from transport availability.
 * Never use a games account as fallback for a book campaign.
 */
export type EditorialTopic = "book" | "game" | "world" | "unknown";
export function classifyEditorialTopic(input: {seedId?: string | null; title?: string | null; text?: string | null}): EditorialTopic {
  const seed = String(input.seedId ?? "").toLowerCase();
  const title = String(input.title ?? "").toLowerCase();
  const text = String(input.text ?? "").toLowerCase();
  if (/terra|neverland|feulette|vacances.interdites|kiff.et.molla|gerard.et.gerard|roman|livre|book/.test(seed+" "+title)) return "book";
  if (/420.dice|feuch.dice|pro.hibited|ghost.frame|silent.link|jeu|game/.test(seed+" "+title)) return "game";
  if (/blacklace|aloisia|feuch.island|f[eé]e.belette/.test(seed+" "+title)) return "world";
  if (/roman|livre|lecture|amazon.fr\/dp\//.test(text)) return "book";
  return "unknown";
}
export function chooseEditorialDestination(topic: EditorialTopic) {
  switch (topic) {
    case "book": return {audience:"author-books", preferredProvider:"buffer", preferredAccount:"benoitlubert", fallbackAccount:null, requiresChannelVerification:true};
    case "game": return {audience:"games", preferredProvider:"metricool", preferredAccount:"pro.hbtd", fallbackAccount:null, requiresChannelVerification:true};
    case "world": return {audience:"fictional-world", preferredProvider:null, preferredAccount:null, fallbackAccount:null, requiresChannelVerification:true};
    default: return {audience:"unclassified", preferredProvider:null, preferredAccount:null, fallbackAccount:null, requiresChannelVerification:true};
  }
}
