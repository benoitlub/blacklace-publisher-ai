import { appendFile } from "node:fs/promises";

const PUBLISHER = "https://blacklace-publisher-worker.benoitlubert.workers.dev";
const targets = [
  { name: "Taco Cat Goat Cheese Pizza", search: "Taco Cat Goat Cheese Pizza how to play shorts",
    mechanic: "Ouvrir sur le geste ou la réaction qui fait comprendre le jeu, puis expliquer la règle en une phrase.",
    experiment: "Pour Prout.Hibited, filmer un vrai moment de table : réaction d'abord, contexte ensuite." },
  { name: "Tapple", search: "Tapple board game how to play shorts",
    mechanic: "Faire participer le spectateur en posant un défi dès le début, puis montrer la réponse.",
    experiment: "Pour Pro.Hibited, mettre un choix à l'écran et donner la réponse avant la fin du clip." },
  { name: "Dobble", search: "Dobble how to play shorts Asmodee",
    mechanic: "Rendre le défi lisible dans un plan rapproché, de sorte que le spectateur puisse jouer avant la révélation.",
    experiment: "Pour un jeu de cartes Blacklace, cadrer le détail qui change le choix et révéler son effet." },
];
const steam = [
  { id: 861540, name: "Dicey Dungeons", mechanic: "Mettre un résultat de dés à l'écran, puis montrer immédiatement comment il modifie la décision.",
    experiment: "Sur un futur extrait de partie autorisé, comparer une ouverture « résultat d'abord » et une ouverture « choix d'abord »." },
  { id: 1775490, name: "Slice & Dice", mechanic: "Faire d'un seul lancer ou d'une seule relance un enjeu compréhensible.",
    experiment: "Sur un futur extrait de partie autorisé, afficher « garder ou relancer ? » avant de montrer le résultat." },
  { id: 2379780, name: "Balatro", mechanic: "Révéler le résultat d'une combinaison visible en gardant le calcul ou le score à l'écran.",
    experiment: "Pour Jointed, filmer une vraie association de cartes et montrer sa conséquence avant le générique." },
];

async function get(url, json = true) {
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; BlacklacePublisher/1.0)" },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("HTTP " + response.status);
  return json ? response.json() : response.text();
}

function text(value) {
  return value?.simpleText ?? value?.runs?.map(run => run.text).join("") ?? "";
}

function* videos(value) {
  if (!value || typeof value !== "object") return;
  if (value.videoRenderer) yield value.videoRenderer;
  for (const child of Object.values(value)) yield* videos(child);
}

async function youtube(target) {
  const url = new URL("https://www.youtube.com/results");
  url.search = new URLSearchParams({ search_query: target.search, hl: "en", gl: "US" });
  const html = await get(url, false);
  const raw = html.match(/(?:var )?ytInitialData\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/)?.[1];
  if (!raw) throw new Error("Public YouTube response has no search data");
  const rows = [];
  for (const video of videos(JSON.parse(raw))) {
    const title = text(video.title);
    const duration = text(video.lengthText);
    const views = text(video.viewCountText);
    if (!/^[a-zA-Z0-9_-]{11}$/.test(video.videoId ?? "") || !title.toLowerCase().includes(target.name.toLowerCase())) continue;
    if (!/^\d{1,2}:\d{2}$/.test(duration) || !/^[\d,]+ views$/.test(views)) continue;
    const [minutes, seconds] = duration.split(":").map(Number);
    const count = Number(views.replace(/[^0-9]/g, ""));
    if (minutes * 60 + seconds > 90 || !Number.isSafeInteger(count) || count < 1000) continue;
    rows.push({ id: video.videoId, title, duration, views: count, channel: text(video.ownerText), age: text(video.publishedTimeText) });
  }
  return [...new Map(rows.map(row => [row.id, row])).values()].sort((a, b) => b.views - a.views).slice(0, 2)
    .map(row => ({
      id: "gerard-competitive-youtube-" + row.id,
      kind: "video", category: "creative-benchmark",
      name: row.title, value: "https://www.youtube.com/watch?v=" + row.id, confidence: 0.8,
      summary: "YouTube public : " + row.views + " vues relevées le " + date + ", durée " + row.duration + ", chaîne " + row.channel +
        (row.age ? ", ancienneté affichée " + row.age : "") + ". Échantillon de recherche, sans preuve de causalité. Hypothèse : " + target.mechanic +
        " Essai : " + target.experiment,
      features: ["public-view-count:" + row.views, "duration:" + row.duration],
      patterns: [target.mechanic], recommendations: [target.experiment],
      tags: ["gerard", "veille-concurrentielle", "video-courte", "youtube", "hypothese-a-tester"],
    }));
}

async function steamEvidence(target) {
  const [detail, reviews] = await Promise.all([
    get("https://store.steampowered.com/api/appdetails?cc=us&l=en&appids=" + target.id),
    get("https://store.steampowered.com/appreviews/" + target.id + "?json=1&language=all&purchase_type=all&num_per_page=0"),
  ]);
  const product = detail[target.id]?.data;
  const stats = reviews.query_summary;
  if (product?.name !== target.name || !Number.isSafeInteger(stats?.total_reviews) || stats.total_reviews < 1) throw new Error("Missing confirmed store metadata");
  const trailer = product.movies?.find(movie => /^https:\/\//.test(movie.mp4?.max ?? ""));
  const value = "https://store.steampowered.com/app/" + target.id + "/";
  return {
    id: "gerard-competitive-steam-" + target.id,
    kind: "url", category: "creative-benchmark", value, name: target.name + " · Steam",
    confidence: 0.85,
    summary: stats.total_reviews + " avis publics Steam, dont " + stats.total_positive + " positifs, relevés le " + date +
      ". Les avis concernent le jeu. Aucune donnée de vues du trailer. Hypothèse de mise en scène : " + target.mechanic + " Essai : " + target.experiment,
    features: ["steam-reviews:" + stats.total_reviews, "positive-reviews:" + stats.total_positive, ...(trailer ? ["official-trailer:" + trailer.mp4.max] : [])],
    patterns: [target.mechanic], recommendations: [target.experiment],
    tags: ["gerard", "veille-concurrentielle", "steam", "hypothese-a-tester"],
  };
}

const date = new Date().toISOString().slice(0, 10);
const operations = [...targets.map(target => youtube(target)), ...steam.map(target => steamEvidence(target))];
const evidence = (await Promise.allSettled(operations)).flatMap((result, index) => {
  if (result.status === "fulfilled") return result.value;
  console.log(JSON.stringify({ event: "source-unavailable", target: [...targets, ...steam][index].name, reason: result.reason.message }));
  return [];
});
if (!evidence.length) throw new Error("No verifiable competitor data returned");

const written = [];
for (const source of evidence) {
  const response = await fetch(PUBLISHER + "/api/observatory/sources", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...source, language: "fr" }), signal: AbortSignal.timeout(40000),
  });
  const result = await response.json();
  if (!response.ok || !result.source?.id || !["ok", "persisted-without-octopus"].includes(result.status)) {
    console.log(JSON.stringify({ event: "publisher-write-unconfirmed", id: source.id, status: response.status, code: result.code }));
    continue;
  }
  written.push(source);
  console.log(JSON.stringify({ event: "publisher-source-persisted", id: result.source.id, status: result.status,
    name: source.name, url: source.value, facts: source.features }));
}
if (process.env.GITHUB_STEP_SUMMARY && written.length) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, "### Veille concurrentielle envoyée à Publisher\n\n" +
    written.map(source => "- " + source.value + " · " + source.features.filter(x => !x.startsWith("official-trailer:")).join(", ")).join("\n") + "\n");
}
if (written.length !== evidence.length) throw new Error("One or more Publisher writes could not be confirmed");
