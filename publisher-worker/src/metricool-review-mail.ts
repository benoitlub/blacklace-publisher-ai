/** Opt-in presentation only. The v1 JSON envelope remains the API/archive format. */
const PREFIX = "[Gerard Metricool v1]";
const OWNER = "benoitlubert@gmail.com";
const labels: Record<string, string> = {facebook:"Facebook",instagram:"Instagram",tiktok:"TikTok"};
export function metricoolReviewMail(input: {
  subject: string; body: string; recipientEmail: string; presentation?: unknown; operationId: string;
}): {subject:string;body:string;relay?:Record<string,unknown>} {
  if (input.presentation !== "editorial-review-v1") return {subject:input.subject,body:input.body};
  let relay: Record<string,unknown>;
  try { relay=JSON.parse(input.body); } catch { throw new Error("metricool-review-invalid"); }
  if (!relay || typeof relay !== "object" || Array.isArray(relay) || !input.subject.startsWith(PREFIX) ||
      input.recipientEmail !== OWNER || relay.contract !== "gerard-metricool-mail-v1" ||
      typeof relay.operationId !== "string" || !/^gerard-metricool-[a-f0-9]{64}$/.test(relay.operationId) ||
      input.operationId !== "gerard-mail-"+relay.operationId.slice("gerard-metricool-".length) ||
      typeof relay.seedId !== "string" || !relay.seedId.trim() || typeof relay.harvestId !== "string" || !relay.harvestId ||
      typeof relay.text !== "string" || !relay.text.trim() || relay.text.length>12000 ||
      !Array.isArray(relay.networks) || !relay.networks.length || relay.networks.some(n=>typeof n!=="string" || !Object.hasOwn(labels,n)) ||
      !Array.isArray(relay.media) || relay.media.some(url=>typeof url!=="string" || !/^https:\/\//.test(url)))
    throw new Error("metricool-review-invalid");
  if (/420[^a-z0-9]*dice/i.test(relay.seedId)) throw new Error("420-dice-review-required");
  const networks=relay.networks.map(n=>labels[String(n)]).join(", ");
  const title=String(relay.title || relay.seedId).replace(/[\r\n\t]+/g," ").trim().slice(0,100);
  const media=relay.media as string[];
  const accounts: Record<string,string> = {"3350145":"Pro.Hibited","7653100":"Blacklace"};
  const accountKey=String(relay.brandId);
  return {
    subject:`${PREFIX} Proposition · ${title} · ${networks}`.slice(0,200),
    body:["Bonjour Benoît,", "", `Voici une proposition pour ${title}.`,
      `Destination : ${networks} · compte ${Object.hasOwn(accounts,accountKey) ? accounts[accountKey] : "à vérifier"}`,
      media.length ? `Média : ${media.length} lien(s) fourni(s), droits et fichier à vérifier.` : "Format : texte seul — aucune image jointe.",
      "Statut : proposition transmise pour revue. Aucune programmation ou publication confirmée par ce mail.",
      "", "LÉGENDE PROPOSÉE", "", relay.text.trim(),
      ...(media.length ? ["", "MÉDIAS FOURNIS", ...media] : []),
      "", "À relire avant diffusion : exactitude du contenu et adéquation du format.",
      "", `Référence de suivi : ${relay.operationId.slice(-12)}`, "Gérard"].join("\n"),
    relay,
  };
}
