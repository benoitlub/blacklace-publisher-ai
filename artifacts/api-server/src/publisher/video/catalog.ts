// Author-owned existing references; no generated substitute is an official asset.
export const REFERENCE_REVISION = "10b3c2bbf0b49c8b1b9e56df43afe9556762c6ce";
const origin = `https://raw.githubusercontent.com/benoitlub/blacklace-echo/${REFERENCE_REVISION}/public/assets/videos`;
export const videoReferences = {
  "natasha-fragment-03": {
    characterId: "natasha",
    name: "Natasha",
    file: "nat3.mp4",
    url: `${origin}/nat3.mp4`,
    sha256: "345eaa73904bdb632a36b45e6d51c0ad4f4410f71bad1ac084a23b6bb3fa16a9",
    gitBlob: "41dd64be4ed74800ab44cda895188eca7b5fdd2f",
    bytes: 3934225,
    source: `https://github.com/benoitlub/blacklace-echo/blob/${REFERENCE_REVISION}/src/blacklace/data.ts`,
    attribution:
      "Pro.Hibited Network / Benoît Lubert ; filigrane Kling de la source conservé",
    rights: "user-directed-existing-media-reuse; publication-requires-review",
  },
  "marty-local": {
    characterId: "marty",
    name: "Marty",
    file: "marty.mov",
    url: `${origin}/marty.mov`,
    sha256: "dca00a84c4a3faa082a02d149808869c31424898c21ffae9771dbafa451d5e40",
    gitBlob: "d338ff93e801d01a1b669ff9eaa6c927430a6cf9",
    bytes: 14637396,
    source: `https://github.com/benoitlub/blacklace-echo/blob/${REFERENCE_REVISION}/src/blacklace/data.ts`,
    attribution:
      "Pro.Hibited Network / Benoît Lubert ; marques de la source conservées",
    rights: "user-directed-existing-media-reuse; publication-requires-review",
  },
} as const;
export type ReferenceId = keyof typeof videoReferences;
export const characters = [
  {
    id: "natasha",
    visualStatus: "existing-reference",
    references: ["natasha-fragment-03"],
    identityPolicy: "reuse-full-frame-no-face-regeneration",
    lore: "https://app.notion.com/p/2d1391197253809eb0ccff665d0ff528",
  },
  {
    id: "marty",
    visualStatus: "existing-reference",
    references: ["marty-local"],
    identityPolicy: "reuse-full-frame-no-face-regeneration",
    lore: "https://app.notion.com/p/35b391197253804d9c4df7fee6497b03",
  },
  {
    id: "aloisia",
    visualStatus: "missing-verified-visual-reference",
    references: [],
    identityPolicy: "do-not-invent-a-body-or-face",
    lore: "https://github.com/benoitlub/blacklace-echo/blob/10b3c2bbf0b49c8b1b9e56df43afe9556762c6ce/src/sherlock/LOCATION-REGISTRY.md",
  },
];
export const videoTools = [
  {
    id: "official-media",
    stage: "media-search",
    mode: "local-registry",
    externalCharge: 0,
    verified: "pinned-author-repository-and-hashes",
  },
  {
    id: "storyboard",
    stage: "storyboard",
    mode: "gerard-authored-structured-input",
    externalCharge: 0,
    verified: "validation-no-creative-agent",
  },
  {
    id: "ffmpeg-existing-motion",
    stage: "animation",
    mode: "reuse-existing-motion-only",
    externalCharge: 0,
    verified: "local-render-tested",
  },
  {
    id: "ffmpeg-assembly",
    stage: "assembly",
    mode: "local-montage",
    externalCharge: 0,
    verified: "local-render-tested",
  },
  {
    id: "ffprobe",
    stage: "quality-control",
    mode: "technical-checks-and-human-review",
    externalCharge: 0,
    verified: "local-render-tested",
  },
  {
    id: "ffmpeg-mp4",
    stage: "export",
    mode: "h264-yuv420p-aac-1080x1920",
    externalCharge: 0,
    verified: "local-render-tested",
  },
  {
    id: "morphic",
    stage: "animation",
    mode: "blocked",
    externalCharge: null,
    verified: "no-executable-integration-or-account-verified",
  },
  {
    id: "kling",
    stage: "animation",
    mode: "blocked",
    externalCharge: null,
    verified: "existing-registry-not-configured-no-executor",
  },
  {
    id: "canva-composio",
    stage: "export",
    mode: "blocked",
    externalCharge: null,
    verified:
      "mp4-export-schema-discovered-session-connection-inactive-not-runtime-proof",
  },
  {
    id: "elevenlabs-composio",
    stage: "voice",
    mode: "blocked",
    externalCharge: null,
    verified:
      "session-connection-active-cost-and-voice-rights-unverified-no-call",
  },
  {
    id: "silence",
    stage: "voice",
    mode: "explicit-silent-track",
    externalCharge: 0,
    verified: "no-synthesized-or-cloned-voice",
  },
];
