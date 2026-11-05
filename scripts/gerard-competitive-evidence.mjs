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
  { name: "Dicey Dungeons", search: "Dicey Dungeons official gameplay trailer",
    mechanic: "Montrer le jet, le choix et l’effet dans un même enchaînement.",
    experiment: "Comparer deux vraies séquences de dés : l’une montre le lancer d’abord, l’autre le dilemme." },
  { name: "Slice & Dice", search: "Slice & Dice gameplay trailer dice game",
    mechanic: "Réduire le début du clip à un seul choix de jeu lisible.",
    experiment: "Tester un extrait court avec « garder ou relancer ? » et dévoiler le résultat dans la même vidéo." },
  { name: "Balatro", search: "Balatro official gameplay trailer combo",
    mechanic: "Faire voir une combinaison de cartes puis sa conséquence immédiate.",
    experiment: "Pour Jointed, filmer deux cartes réelles et la conséquence de leur association." },
  { name: "Exploding Kittens", search: "Exploding Kittens how to play short card game",
    mechanic: "Présenter une règle par la conséquence amusante d’une seule action.",
    experiment: "Pour Pro.Hibited, ouvrir sur une erreur ou un retournement réel, puis donner le contexte." },
  { name: "The Three Body Problem", match: /three[ -]body problem/i, search: "the three body problem book review Cixin Liu short book recommendation",
    project: "TERRA", mechanic: "Accrocher avec un seul phénomène inexplicable et une question humaine précise.",
    experiment: "Ouvrir sur la sonde verte et un témoin de TERRA, puis tester une variante qui commence par le geste quotidien du témoin." },
  { name: "Solaris", match: /solaris.*(?:lem|book|novel)|(?:lem|book|novel).*solaris/i, search: "Solaris Stanislaw Lem book recommendation review short",
    project: "TERRA", mechanic: "Suggérer l’inconnu par un détail concret plutôt que résumer l’intrigue.",
    experiment: "Associer un geste banal à un signe cosmique du livre et laisser une question ouverte en fin de clip." },
  { name: "Hitchhiker's Guide to the Galaxy", match: /hitchhiker.?s guide to the galaxy|h2g2/i, search: "Hitchhiker's Guide to the Galaxy Douglas Adams book funny short review",
    project: "Gérard & Gérard", mechanic: "Faire partir le gag d’un contresens sur une habitude humaine.",
    experiment: "Faire commenter un tapis de course ou un croissant par les deux Gérard, avec une chute originale." },
  { name: "Discworld", match: /discworld|terry pratchett|disque.monde/i, search: "Discworld Terry Pratchett books funny where to start booktok shorts",
    project: "Gérard & Gérard", mechanic: "Présenter un duo par le désaccord qui fait rire, sans réciter sa fiche.",
    experiment: "Une même habitude humaine, deux interprétations opposées, puis un dernier plan tendre." },
  { name: "Lost Boy", match: /lost boy.*(?:peter pan|christina henry|book)|(?:peter pan|christina henry).*lost boy/i, search: "Lost Boy Christina Henry dark Peter Pan retelling book review short",
    project: "Neverland Ltd.", mechanic: "Évoquer le conte familier puis révéler ce qui a changé dans ce monde.",
    experiment: "Tester une accroche « vous connaissez Neverland » suivie d’un seul détail attesté dans le tome choisi." },
  { name: "Peter Pan retellings", match: /peter pan.*(?:retell|book)|(?:retell|book).*peter pan|peter darling|straight on till morning/i, search: "Peter Pan retellings book recommendations Peter Darling Neverland short BookTok",
    project: "Neverland Ltd.", mechanic: "Donner une porte d’entrée aux lecteurs qui connaissent déjà le conte.",
    experiment: "Comparer une vidéo centrée sur le monde à une vidéo centrée sur une décision d’un personnage." },
  { name: "The Stinky Cheese Man", match: /stinky cheese man/i, search: "The Stinky Cheese Man Jon Scieszka picture book trailer book short",
    project: "La Feulette tachetée / La crotte de nez magique", mechanic: "Faire du détail incongru un jeu d’observation adapté à chaque livre.",
    experiment: "Créer deux clips distincts, chacun avec un objet et une question propres au livre. Pour Feulette, partir de la tache." },
  { name: "The Book with No Pictures", match: /book with no pictures/i, search: "The Book With No Pictures BJ Novak funny picture book short trailer",
    project: "La crotte de nez magique", mechanic: "Installer une attente très sérieuse puis la déjouer par une chute absurde.",
    experiment: "Tester une mini lecture jouée à voix naturelle avec une phrase originale, ou un extrait explicitement identifié." },
  { name: "A Wrinkle in Time", match: /wrinkle in time/i, search: "A Wrinkle in Time book recommendation short middle grade science fiction book trailer",
    project: "Les Vacances Interdites", mechanic: "Annoncer une aventure jeunesse par une perturbation concrète, à hauteur de personnage.",
    experiment: "Partir d’un détail d’Émilie ou de Pixel, puis révéler le premier signe que les vacances prennent une autre tournure." },
  { name: "Amari and the Night Brothers", match: /amari.*night brothers/i, search: "Amari and the Night Brothers book trailer middle grade short",
    project: "Les Vacances Interdites", mechanic: "Rendre le passage du quotidien à l’étrange visible en deux plans.",
    experiment: "Montrer un instant banal puis un seul élément inattendu de l’univers, sans dévoiler le dénouement." },
  { name: "Le Petit Prince", match: /petit prince/i, search: "Le Petit Prince livre présentation lecture en français vidéo courte",
    project: "Ilvaard", mechanic: "Faire entrer dans un monde par un objet ou un personnage identifiable.",
    experiment: "Utiliser le Trillo Ball comme point d’entrée dans Ilvaard, en expliquant un seul usage déjà établi." },
  { name: "Dune worldbuilding", match: /dune.*(?:world|arrakis|explained|book)|(?:world|arrakis|explained|book).*dune/i, search: "Dune book worldbuilding explained Arrakis in 60 seconds",
    project: "Ilvaard", mechanic: "Expliquer une règle du monde par ce qu’elle change dans une scène.",
    experiment: "Montrer la règle émotionnelle d’Ilvaard à travers un choix de personnage, avec un exemple issu du canon." },
  { name: "Mébius en littérature", match: /m[oœö]bius|m[ée]bius|ruban de m/i, search: "ruban de Möbius explication expérience court film lecture structure récit",
    project: "La Grammaire du réel", mechanic: "Faire sentir le retournement par une démonstration que l’on peut refaire.",
    experiment: "Faire entendre la même phrase avant et après un changement de contexte, comme un aperçu de la lecture en ordre inverse." },
  { name: "Hitchhiker adaptation clips", match: /hitchhiker.?s guide to the galaxy|answer.*(?:42|life.*universe)/i, search: "Hitchhiker Guide to the Galaxy 42 BBC clip answer",
    project: "Gérard & Gérard", mechanic: "Référence audiovisuelle : une question grandiose reçoit une réponse absurdement simple.",
    experiment: "Tester un dialogue court des deux Gérard, avec une réponse concrète et une pause avant la chute." },
  { name: "Discworld adaptation clips", match: /discworld|hogfather|going postal|terry pratchett/i, search: "Terry Pratchett Hogfather Going Postal official trailer Discworld",
    project: "Gérard & Gérard", mechanic: "Référence audiovisuelle : utiliser un personnage ou un objet quotidien pour donner un aperçu de l’absurde.",
    experiment: "Donner au spectateur une situation comique complète avant d’afficher le titre du livre." },
  { name: "Peter Pan adaptation", match: /peter pan|neverland/i, search: "Peter Pan Neverland Nightmare official teaser trailer",
    project: "Neverland Ltd.", mechanic: "Référence audiovisuelle : jouer avec la reconnaissance immédiate d’un nom familier.",
    experiment: "Ouvrir sur une image propre à Neverland Ltd. et une attente connue du lecteur, puis révéler un écart attesté." },
  { name: "Neverland adaptation", match: /peter pan|neverland/i, search: "Peter Pan and Wendy official teaser Neverland Disney trailer",
    project: "Neverland Ltd.", mechanic: "Référence audiovisuelle : présenter une porte d’entrée dans le monde par une action.",
    experiment: "Pour un tome, isoler un seul passage ou objet vérifié et inviter à choisir d’y entrer ou de rester." },
  { name: "Dune world excerpt", match: /dune|arrakis/i, search: "Dune Arrakis desert sandworm clip 1 minute",
    project: "Ilvaard", mechanic: "Référence audiovisuelle : faire découvrir une contrainte du monde au moment où elle agit.",
    experiment: "Utiliser un élément visuel original d’Ilvaard et faire comprendre une règle par sa conséquence immédiate." },
  { name: "Worldbuilding advice", match: /worldbuilding|world.building/i, search: "fantasy worldbuilding tips one minute worldbuilding shorts",
    project: "Ilvaard", mechanic: "Isoler une seule règle du monde et montrer un exemple concret.",
    experiment: "Faire un clip « une règle d’Ilvaard en une scène », sans résumer toute la chronologie." },
  { name: "Solaris audiovisual", match: /solaris.*(?:tarkovsky|trailer|criterion)|(?:tarkovsky|trailer).*solaris/i, search: "Solaris Tarkovsky Criterion trailer short",
    project: "TERRA", mechanic: "Référence audiovisuelle : installer un regard, puis introduire un signal inexpliqué.",
    experiment: "Comparer un clip qui commence sur le témoin à un clip qui commence sur la sonde, avec la même durée." },
  { name: "Avenue 5", match: /avenue 5/i, search: "Avenue 5 HBO official teaser short Hugh Laurie cruise spaceship",
    project: "FLÛTE ET RE-FLÛTE ! / Ema", mechanic: "Référence audiovisuelle : mettre côte à côte un protocole très sérieux et une situation qui déraille.",
    experiment: "Écrire un micro-dialogue original où une consigne impeccable provoque une réaction inattendue. Garder le contexte compréhensible en une phrase." },
  { name: "Futurama", match: /futurama/i, search: "Futurama official short clip space ship funny Hulu",
    project: "FLÛTE ET RE-FLÛTE ! / Ema", mechanic: "Référence audiovisuelle : faire comprendre le gag de SF à travers la réaction d’un personnage.",
    experiment: "Tester la même micro-scène avec la réaction d’abord, puis avec l’annonce du problème d’abord." },
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
    if (!/^[a-zA-Z0-9_-]{11}$/.test(video.videoId ?? "") || !(target.match ? target.match.test(title) : title.toLowerCase().includes(target.name.toLowerCase()))) continue;
    if (!/^\d{1,2}:\d{2}$/.test(duration) || !/^[\d,]+ views$/.test(views)) continue;
    const [minutes, seconds] = duration.split(":").map(Number);
    const count = Number(views.replace(/[^0-9]/g, ""));
    if (minutes * 60 + seconds > (target.project ? 120 : 90) || !Number.isSafeInteger(count) || count < (target.project ? 500 : 1000)) continue;
    rows.push({ id: video.videoId, title, duration, views: count, channel: text(video.ownerText), age: text(video.publishedTimeText) });
  }
  return [...new Map(rows.map(row => [row.id, row])).values()].sort((a, b) => b.views - a.views).slice(0, 2)
    .map(row => ({
      id: "gerard-competitive-youtube-" + row.id,
      kind: "video", category: "creative-benchmark",
      name: row.title, value: "https://www.youtube.com/watch?v=" + row.id, confidence: 0.8,
      summary: (target.project ? "Application : " + target.project + ". " : "") + "YouTube public : " + row.views + " vues relevées le " + date + ", durée " + row.duration + ", chaîne " + row.channel +
        (row.age ? ", ancienneté affichée " + row.age : "") + ". Échantillon de recherche, sans preuve de causalité. Hypothèse : " + target.mechanic +
        " Essai : " + target.experiment,
      features: ["public-view-count:" + row.views, "duration:" + row.duration],
      patterns: [target.mechanic], recommendations: [target.experiment],
      tags: ["gerard", "veille-concurrentielle", "video-courte", "youtube", "hypothese-a-tester", ...(target.project ? ["livres-et-univers", target.project] : [])],
    }));
}

const date = new Date().toISOString().slice(0, 10);
const operations = targets.map(youtube);
const evidence = (await Promise.allSettled(operations)).flatMap((result, index) => {
  if (result.status === "fulfilled") return result.value;
  console.log(JSON.stringify({ event: "source-unavailable", target: targets[index].name, reason: result.reason.message }));
  return [];
});
if (!evidence.length) throw new Error("No verifiable competitor data returned");

const existing = await get(PUBLISHER + "/api/observatory/sources?limit=200");
if (!existing.configured || !Array.isArray(existing.sources)) throw new Error("Cannot verify Publisher observatory state");
const observedToday = new Set(existing.sources.filter(row => row.lastObservedAt?.slice(0, 10) === date).map(row => row.id));
const written = [];
for (const source of evidence) {
  if (observedToday.has(source.id)) {
    written.push(source);
    console.log(JSON.stringify({ event: "publisher-source-already-observed", id: source.id, name: source.name }));
    continue;
  }
  const response = await fetch(PUBLISHER + "/api/observatory/sources", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...source, language: "fr" }), signal: AbortSignal.timeout(40000),
  });
  const result = await response.json();
  if (!response.ok || !result.source?.id || !["ok", "persisted-without-octopus"].includes(result.status)) {
    console.log(JSON.stringify({ event: "publisher-write-unconfirmed", id: source.id, status: response.status, code: result.code }));
    continue;
  }
  observedToday.add(source.id);
  written.push(source);
  console.log(JSON.stringify({ event: "publisher-source-persisted", id: result.source.id, status: result.status,
    name: source.name, url: source.value, facts: source.features, project: source.tags.includes("livres-et-univers") ? source.tags.at(-1) : null }));
}
if (process.env.GITHUB_STEP_SUMMARY && written.length) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, "### Veille concurrentielle envoyée à Publisher\n\n" +
    written.map(source => "- " + source.value + " · " + source.features.filter(x => !x.startsWith("official-trailer:")).join(", ")).join("\n") + "\n");
}
if (written.length !== evidence.length) throw new Error("One or more Publisher writes could not be confirmed");
