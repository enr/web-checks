// Minimal PNG dimension reader (zero-dep). Reads width/height from the IHDR
// chunk, which is always the first chunk right after the 8-byte signature.

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface PixelSize {
  width: number;
  height: number;
}

export function readPngSize(bytes: Buffer): PixelSize | null {
  if (bytes.length < 24) return null;
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  // IHDR data starts at byte 16 (8 sig + 4 length + 4 "IHDR").
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width === 0 || height === 0) return null;
  return { width, height };
}
