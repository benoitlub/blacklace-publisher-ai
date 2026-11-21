const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const CHUNK_BIN = 0x004e4942; // "BIN\0"

export const align4 = (value: number): number => Math.ceil(value / 4) * 4;

export function packGlb(gltf: object, binary: Uint8Array): ArrayBuffer {
  const binLength = align4(binary.byteLength);
  const jsonBytes = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonLength = align4(jsonBytes.length);
  const totalLength = 12 + 8 + jsonLength + 8 + binLength;

  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);

  // JSON chunk, padded with spaces to a multiple of four.
  let offset = 12;
  view.setUint32(offset, jsonLength, true);
  view.setUint32(offset + 4, CHUNK_JSON, true);
  offset += 8;
  bytes.fill(0x20, offset, offset + jsonLength);
  bytes.set(jsonBytes, offset);
  offset += jsonLength;

  // BIN chunk, padded with zeroes.
  view.setUint32(offset, binLength, true);
  view.setUint32(offset + 4, CHUNK_BIN, true);
  offset += 8;

  bytes.set(binary, offset);
  return buffer;
}
