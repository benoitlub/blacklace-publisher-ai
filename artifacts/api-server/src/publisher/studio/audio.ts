import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { executeMistralText } from "../../services/mistral-text";
import { command, probe, hash, StudioError } from "./runtime";
import {
  requirePermission,
  validateSegments,
  type StudioRequest,
} from "./request";
const VOICE_RIGHTS = {
  license: "CC-BY-4.0",
  attribution:
    "SIWIS French Speech Synthesis Database, University of Edinburgh; Piper fr_FR-siwis-medium",
  source:
    "https://huggingface.co/rhasspy/piper-voices/blob/main/fr/fr_FR/siwis/medium/MODEL_CARD",
};
const SIWIS_MODEL_HASH =
  "641d1ab097da2b81128c076810edb052b385decc8be3381814802a64a73baf99";
export async function scriptFor(
  request: StudioRequest,
  generate = executeMistralText,
) {
  if (request.segments)
    return {
      segments: request.segments,
      provider: "approved-parcel-script",
      provenance: request.scriptRights,
      externalCost: 0,
    };
  requirePermission(request, "mistral.text");
  if (!request.knowledge)
    throw new StudioError("VERIFIED_PARCEL_CONTEXT_REQUIRED");
  const result = await generate({
    title: request.title,
    prompt: JSON.stringify({
      task: 'Écris une narration française factuelle pour un Short. JSON strict uniquement: {"segments":[{"text":"phrase parlée","caption":"sous-titre"}]}. 4 à 8 phrases, texte parlé <= 180 caractères, caption <= 84 caractères. Aucun fait absent du contexte. Aucune promesse, URL ou marque inventée.',
      durationSeconds: request.durationSeconds,
      context: request.knowledge,
    }),
    maxTokens: 1200,
    temperature: 0.2,
  });
  let parsed: any;
  try {
    parsed = JSON.parse(
      result.content.replace(/^```(?:json)?\s*|\s*```$/g, ""),
    );
  } catch {
    throw new StudioError("MISTRAL_SCRIPT_NOT_JSON");
  }
  validateSegments(parsed.segments);
  return {
    segments: parsed.segments,
    provider: "mistral",
    provenance: result.metadata,
    externalCost: null,
  };
}
function wav(samples: Float32Array, rate = 48000) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((v, i) =>
    b.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, v)) * 32767),
      44 + i * 2,
    ),
  );
  return b;
}
export function originalSoundtrack(duration: number, events: number[]) {
  const rate = 48000,
    n = Math.ceil(rate * duration),
    music = new Float32Array(n),
    effects = new Float32Array(n);
  // Original deterministic instrumental loop, no sampled recording or third-party song.
  const chords = [
    [130.81, 164.81, 196],
    [110, 130.81, 164.81],
    [146.83, 174.61, 220],
    [98, 123.47, 146.83],
  ];
  for (let i = 0; i < n; i++) {
    const t = i / rate,
      beat = t % 0.5,
      chord = chords[Math.floor(t / 3) % chords.length];
    const fade = Math.min(1, t / 0.4, (duration - t) / 0.8);
    music[i] =
      fade *
      (chord.reduce((s, f) => s + Math.sin(2 * Math.PI * f * t), 0) * 0.012 +
        Math.sin(2 * Math.PI * 65.4 * t) * Math.exp(-beat * 14) * 0.035);
    for (const start of events) {
      const dt = t - start;
      if (dt >= 0 && dt < 0.18)
        effects[i] +=
          Math.sin(2 * Math.PI * (780 * dt - 950 * dt * dt)) *
          Math.exp(-dt * 28) *
          0.13;
    }
  }
  return { music: wav(music), effects: wav(effects) };
}
export function loudnessJson(stderr: string) {
  const matches = stderr.match(/\{\s*"input_i"[\s\S]*?\}/g);
  if (!matches?.length) throw new StudioError("AUDIO_LOUDNESS_UNVERIFIED");
  const j = JSON.parse(matches.at(-1)!);
  if (
    !Number.isFinite(Number(j.input_i)) ||
    !Number.isFinite(Number(j.input_tp))
  )
    throw new StudioError("AUDIO_SILENT_OR_INVALID");
  return j;
}
export async function measureAudio(file: string) {
  const r = await command("ffmpeg", [
    "-hide_banner",
    "-nostdin",
    "-i",
    file,
    "-af",
    "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
    "-f",
    "null",
    "-",
  ]);
  const j = loudnessJson(r.stderr);
  return {
    integratedLufs: Number(j.input_i),
    truePeakDbtp: Number(j.input_tp),
    lra: Number(j.input_lra),
  };
}
export async function produceAudio(
  request: StudioRequest,
  dir: string,
  generate = executeMistralText,
) {
  const script = await scriptFor(request, generate);
  await writeFile(
    path.join(dir, "script.json"),
    JSON.stringify(script, null, 2) + "\n",
  );
  const model = process.env.PIPER_MODEL;
  if (!model) throw new StudioError("PIPER_MODEL_REQUIRED");
  let config: any;
  try {
    config = JSON.parse(await readFile(model + ".json", "utf8"));
  } catch {
    throw new StudioError("PIPER_MODEL_CONFIG_REQUIRED");
  }
  if (
    config.language?.code !== "fr_FR" ||
    !String(config.espeak?.voice).startsWith("fr")
  )
    throw new StudioError("FRENCH_VOICE_REQUIRED");
  const modelHash = hash(await readFile(model));
  if (
    modelHash !== SIWIS_MODEL_HASH ||
    (process.env.PIPER_MODEL_SHA256 &&
      modelHash !== process.env.PIPER_MODEL_SHA256)
  )
    throw new StudioError("PIPER_MODEL_HASH_REQUIRED_OR_MISMATCH");
  const segments: {
      text: string;
      caption: string;
      start: number;
      end: number;
      meanVolumeDb: number;
    }[] = [],
    inputs: string[] = [],
    filters: string[] = [],
    labels: string[] = [];
  let cursor = 0.3;
  for (let i = 0; i < script.segments.length; i++) {
    const s = script.segments[i],
      name = `voice-${i}.wav`;
    await writeFile(path.join(dir, `voice-${i}.txt`), s.text);
    await command(process.env.PIPER_BIN || "piper", [
      "--model",
      model,
      "--input-file",
      path.join(dir, `voice-${i}.txt`),
      "--output-file",
      path.join(dir, name),
      "--sentence-silence",
      "0.12",
    ]);
    const p = await probe(path.join(dir, name)),
      duration = Number(p.format.duration);
    if (
      !Number.isFinite(duration) ||
      duration < 0.15 ||
      !p.streams.some((s) => s.codec_type === "audio")
    )
      throw new StudioError("TTS_FILE_INVALID");
    const volume = await command(
      "ffmpeg",
      [
        "-hide_banner",
        "-nostdin",
        "-i",
        name,
        "-af",
        "volumedetect",
        "-f",
        "null",
        "-",
      ],
      dir,
    );
    const meanVolumeDb = Number(
      volume.stderr.match(/mean_volume:\s*(-?[\d.]+|-inf)\s*dB/)?.[1],
    );
    if (!Number.isFinite(meanVolumeDb) || meanVolumeDb < -45)
      throw new StudioError("TTS_NARRATION_SILENT");
    segments.push({
      ...s,
      start: cursor,
      end: cursor + duration,
      meanVolumeDb,
    });
    inputs.push("-i", name);
    filters.push(
      `[${i}:a]aresample=48000,adelay=${Math.round(cursor * 1000)}:all=1[v${i}]`,
    );
    labels.push(`[v${i}]`);
    cursor += duration + 0.18;
  }
  if (cursor > request.durationSeconds - 0.2)
    throw new StudioError("NARRATION_EXCEEDS_DURATION");
  filters.push(
    `${labels.join("")}amix=inputs=${labels.length}:normalize=0,apad,atrim=duration=${request.durationSeconds}[voice]`,
  );
  await command(
    "ffmpeg",
    [
      "-v",
      "error",
      "-nostdin",
      "-y",
      ...inputs,
      "-filter_complex_threads",
      "1",
      "-filter_complex",
      filters.join(";"),
      "-map",
      "[voice]",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-c:a",
      "pcm_s16le",
      "voice.wav",
    ],
    dir,
  );
  const sounds = originalSoundtrack(
    request.durationSeconds,
    segments.slice(1).map((s) => s.start),
  );
  await writeFile(path.join(dir, "music.wav"), sounds.music);
  await writeFile(path.join(dir, "effects.wav"), sounds.effects);
  await command(
    "ffmpeg",
    [
      "-v",
      "error",
      "-nostdin",
      "-y",
      "-i",
      "voice.wav",
      "-i",
      "music.wav",
      "-i",
      "effects.wav",
      "-filter_complex_threads",
      "1",
      "-filter_complex",
      `[0:a]asplit=2[voice][side];[1:a][side]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=250[duck];[voice][duck][2:a]amix=inputs=3:normalize=0,apad,atrim=duration=${request.durationSeconds}[mix]`,
      "-map",
      "[mix]",
      "-ar",
      "48000",
      "-ac",
      "2",
      "mix.wav",
    ],
    dir,
  );
  const analysis = await command(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostdin",
      "-i",
      "mix.wav",
      "-af",
      "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
      "-f",
      "null",
      "-",
    ],
    dir,
  );
  const m = loudnessJson(analysis.stderr);
  await command(
    "ffmpeg",
    [
      "-v",
      "error",
      "-nostdin",
      "-y",
      "-i",
      "mix.wav",
      "-af",
      `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`,
      "-ar",
      "48000",
      "-ac",
      "2",
      "-c:a",
      "pcm_s16le",
      "audio.wav",
    ],
    dir,
  );
  const measured = await measureAudio(path.join(dir, "audio.wav"));
  if (Math.abs(measured.integratedLufs + 16) > 1 || measured.truePeakDbtp > -1)
    throw new StudioError("AUDIO_NORMALIZATION_FAILED");
  return {
    segments,
    durationSeconds: request.durationSeconds,
    speechEndSeconds: segments.at(-1)!.end,
    loudness: measured,
    voice: {
      provider: "piper-local",
      language: "fr_FR",
      modelSha256: modelHash,
      rights: VOICE_RIGHTS,
    },
    music: {
      provider: "original-procedural",
      license: "CC0-1.0",
      attribution:
        "Publisher original procedural soundtrack; dedicated to the public domain",
    },
    effects: { provider: "original-procedural", license: "CC0-1.0" },
    scriptProvider: script.provider,
    externalProviderCost: script.externalCost,
  };
}
