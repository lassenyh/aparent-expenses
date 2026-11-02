declare module "heic-decode" {
  type DecodedHeic = { width: number; height: number; data: Uint8ClampedArray };

  /** Decodes the primary image of a HEIC/HEIF file to RGBA pixels. */
  export default function decodeHeic(input: {
    buffer: ArrayBufferLike | Uint8Array;
  }): Promise<DecodedHeic>;
}
