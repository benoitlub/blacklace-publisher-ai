import { packGlb } from "./glb";

export const PROCEDURAL_CAPABILITY = "asset.procedural.plan";

type Vec3 = [number, number, number];
type Part = { name: string; translation: Vec3; scale: Vec3; accent?: boolean };
const palette = {
  blue: [0.06, 0.3, 0.8, 1],
  red: [0.8, 0.08, 0.06, 1],
  green: [0.09, 0.55, 0.18, 1],
  gold: [0.85, 0.49, 0.07, 1],
};

const templates: Record<"crate" | "robot", Part[]> = {
  crate: [
    { name: "Crate", translation: [0, 0.5, 0], scale: [1, 1, 1] },
    ...[-0.33, 0.33].map((x): Part => ({
      name: "Reinforcement", translation: [x, 0.51, 0], scale: [0.13, 1.02, 1.04], accent: true,
    })),
  ],
  robot: [
    { name: "Head", translation: [0, 1.65, 0], scale: [0.52, 0.44, 0.46] },
    { name: "Visor", translation: [0, 1.67, 0.24], scale: [0.36, 0.13, 0.05], accent: true },
    { name: "Torso", translation: [0, 1.07, 0], scale: [0.62, 0.59, 0.35] },
    ...[-1, 1].flatMap((sign): Part[] => [
      { name: "Arm", translation: [sign * 0.47, 1.03, 0], scale: [0.23, 0.58, 0.24] },
      { name: "Leg", translation: [sign * 0.18, 0.35, 0], scale: [0.23, 0.54, 0.25] },
      { name: "Foot", translation: [sign * 0.18, 0.09, 0.08], scale: [0.27, 0.18, 0.43], accent: true },
    ]),
  ],
};

export function planProceduralAsset(intent: string): string {
  const text = intent.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const robot = /\b(robot|androide|android|personnage|character)\b/.test(text);
  const crate = /\b(crate|box|caisse|cajon)\b/.test(text);
  if (robot === crate) throw new Error("Describe one supported asset: a crate or a robot.");
  const color = text.match(/\b(bleu\w*|blue|rouge\w*|red|vert\w*|green|gold|dore\w*)\b/)?.[0];
  let material = "blue";
  if (color && /^(rouge|red)/.test(color)) material = "red";
  if (color && /^(vert|green)/.test(color)) material = "green";
  if (color && /^(dore|gold)/.test(color)) material = "gold";
  return `v1-${robot ? "robot" : "crate"}-${material}`;
}

export const recipePattern = /^v1-(robot|crate)-(blue|red|green|gold)$/;
const positions = [
  -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5,
  -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
];
const indices = [
  0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4,
  3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
];

export function buildProceduralGlb(recipe: string): ArrayBuffer {
  const match = recipePattern.exec(recipe);
  if (!match) throw new Error("Invalid procedural asset recipe.");
  const parts = templates[match[1] as keyof typeof templates];
  const color = palette[match[2] as keyof typeof palette];
  const indexOffset = positions.length * 4;
  const binary = new Uint8Array(indexOffset + indices.length * 2);
  const view = new DataView(binary.buffer);
  positions.forEach((value, index) => view.setFloat32(index * 4, value, true));
  indices.forEach((value, index) => view.setUint16(indexOffset + index * 2, value, true));
  return packGlb({
    asset: { version: "2.0", generator: "Metaverse Creator (procedural)" },
    scene: 0,
    scenes: [{ nodes: parts.map((_, index) => index) }],
    nodes: parts.map(({ accent, ...part }) => ({ ...part, mesh: accent ? 1 : 0 })),
    meshes: [0, 1].map((material) => ({ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material }] })),
    materials: [color, [0.12, 0.14, 0.17, 1]].map((baseColorFactor) => ({
      pbrMetallicRoughness: { baseColorFactor, metallicFactor: 0, roughnessFactor: 0.7 },
    })),
    buffers: [{ byteLength: binary.length }],
    bufferViews: [
      { buffer: 0, byteLength: indexOffset, target: 34962 },
      { buffer: 0, byteOffset: indexOffset, byteLength: indices.length * 2, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 8, type: "VEC3", min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
      { bufferView: 1, componentType: 5123, count: indices.length, type: "SCALAR" },
    ],
  }, binary);
}
