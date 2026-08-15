import fs from "node:fs";

const path = "publisher-worker/src/worker.ts";
let source = fs.readFileSync(path, "utf8");

const canvaNeedle = '  const pool = options.requireNovel ? scored.filter((candidate) => !excluded.has(candidate.slug)) : scored;\n  if (options.requireNovel && !pool.length) return null;\n  for (const candidate of pool.slice(0, CANVA_MAX_ATTEMPTS)) {';
const canvaReplacement = '  const pool = options.requireNovel ? scored.filter((candidate) => !excluded.has(candidate.slug)) : scored;\n  if (options.requireNovel && !pool.length) return null;\n  let lastCanvaError: unknown = null;\n  for (const candidate of pool.slice(0, CANVA_MAX_ATTEMPTS)) {';
if (!source.includes(canvaNeedle)) throw new Error("Canva instrumentation anchor not found");
source = source.replace(canvaNeedle, canvaReplacement);

const canvaCatchNeedle = '    } catch (_) { /* try the next candidate */ }\n  }\n  return null;\n}\n\n// ============================================================================\n// Octopus health';
const canvaCatchReplacement = '    } catch (error) {\n      lastCanvaError = error;\n    }\n  }\n  if (lastCanvaError) throw lastCanvaError;\n  return null;\n}\n\n// ============================================================================\n// Octopus health';
if (!source.includes(canvaCatchNeedle)) throw new Error("Canva catch anchor not found");
source = source.replace(canvaCatchNeedle, canvaCatchReplacement);

const improveNeedle = `async function runImproveCycle(env: Env, sql: Awaited<ReturnType<typeof getSql>>, tentacle: TentacleRow): Promise<{ seedId: string; mode: TentacleMode; status: string }> {\n  const previous = await latestIteration(sql, tentacle.seed_id);`;
const improveReplacement = `async function runImproveCycle(env: Env, sql: Awaited<ReturnType<typeof getSql>>, tentacle: TentacleRow): Promise<{ seedId: string; mode: TentacleMode; status: string; diagnostics: Record<string, unknown> }> {\n  const previous = await latestIteration(sql, tentacle.seed_id);\n  let mistralStatus = "not-attempted";\n  let mistralError: string | null = null;\n  let canvaStatus = "not-attempted";\n  let canvaError: string | null = null;`;
if (!source.includes(improveNeedle)) throw new Error("runImproveCycle anchor not found");
source = source.replace(improveNeedle, improveReplacement);

const mistralNeedle = `  if (knowledge.verified) {\n    try {\n      const artifact = await executeMistralText(env, { title: tentacle.title, prompt: buildImprovePrompt(tentacle, previous, knowledge.prompt) });\n      content = artifact.content;\n    } catch (_) { /* Mistral unavailable this cycle — a visual alone can still land */ }\n  }`;
const mistralReplacement = `  if (knowledge.verified) {\n    try {\n      const artifact = await executeMistralText(env, { title: tentacle.title, prompt: buildImprovePrompt(tentacle, previous, knowledge.prompt) });\n      content = artifact.content;\n      mistralStatus = "success";\n    } catch (error) {\n      mistralStatus = "error";\n      mistralError = error instanceof Error ? error.message : String(error);\n    }\n  } else {\n    mistralStatus = "skipped-unverified";\n  }`;
if (!source.includes(mistralNeedle)) throw new Error("Mistral catch anchor not found");
source = source.replace(mistralNeedle, mistralReplacement);

const canvaCycleNeedle = `  let visualUrl: string | null = null;\n  let toolCombination: string | null = null;\n  const canva = await executeCanvaDesign(env, tentacle.title).catch(() => null);\n  if (canva) { visualUrl = canva.artifact.url; toolCombination = \`canva:\${canva.toolSlug}\`; }\n\n  await recordIteration(sql, { seedId: tentacle.seed_id, mode: "improve", content, visualUrl, toolCombination });\n  return { seedId: tentacle.seed_id, mode: "improve", status: content || visualUrl ? "completed" : "skipped-no-provider" };`;
const canvaCycleReplacement = `  let visualUrl: string | null = null;\n  let toolCombination: string | null = null;\n  try {\n    const canva = await executeCanvaDesign(env, tentacle.title);\n    if (canva) {\n      visualUrl = canva.artifact.url;\n      toolCombination = \`canva:\${canva.toolSlug}\`;\n      canvaStatus = "success";\n    } else {\n      canvaStatus = "no-artifact";\n    }\n  } catch (error) {\n    canvaStatus = "error";\n    canvaError = error instanceof Error ? error.message : String(error);\n  }\n\n  await recordIteration(sql, { seedId: tentacle.seed_id, mode: "improve", content, visualUrl, toolCombination });\n  return {\n    seedId: tentacle.seed_id,\n    mode: "improve",\n    status: content || visualUrl ? "completed" : "skipped-no-provider",\n    diagnostics: {\n      knowledge: { verified: knowledge.verified, slug: knowledge.slug, source: knowledge.source },\n      mistral: { status: mistralStatus, error: mistralError },\n      canva: { status: canvaStatus, error: canvaError, toolCombination },\n      visualUrl,\n    },\n  };`;
if (!source.includes(canvaCycleNeedle)) throw new Error("Cycle Canva anchor not found");
source = source.replace(canvaCycleNeedle, canvaCycleReplacement);

fs.writeFileSync(path, source);
console.log("Instrumented publisher-worker/src/worker.ts for provider diagnostics.");
