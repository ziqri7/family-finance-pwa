import jpeg from "jpeg-js";
import { decode } from "fast-png";
import { fail } from "./http";
export function validateImage(data: Uint8Array, type: string) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let width = 0,
    height = 0;
  if (type === "image/png") {
    if (
      data.length < 45 ||
      ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => data[i] === v) ||
      view.getUint32(8) !== 13 ||
      String.fromCharCode(...data.slice(12, 16)) !== "IHDR"
    )
      fail(400, "INVALID_IMAGE", "Gambar PNG tidak valid.");
    width = view.getUint32(16);
    height = view.getUint32(20);
    dimensions(width, height);
    const bits = data[24],
      channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[
        data[25]
      ];
    if (
      !channels ||
      width * height * channels * Math.max(1, bits / 8) > 32 * 1024 * 1024
    )
      fail(400, "IMAGE_MEMORY", "Gunakan gambar berukuran lebih kecil.");
    let offset = 8,
      ended = false;
    while (offset + 12 <= data.length) {
      const size = view.getUint32(offset),
        kind = String.fromCharCode(...data.slice(offset + 4, offset + 8));
      if (size > data.length - offset - 12 || kind === "acTL")
        fail(400, "INVALID_IMAGE", "PNG rusak atau beranimasi tidak didukung.");
      offset += size + 12;
      if (kind === "IEND") {
        ended = size === 0 && offset === data.length;
        break;
      }
    }
    if (!ended) fail(400, "INVALID_IMAGE", "Struktur PNG tidak lengkap.");
    try {
      decode(data, { checkCrc: true });
    } catch {
      fail(400, "INVALID_IMAGE", "Gambar PNG tidak dapat dibaca.");
    }
  } else if (type === "image/jpeg") {
    if (
      data.length < 10 ||
      data[0] !== 255 ||
      data[1] !== 216 ||
      data.at(-2) !== 255 ||
      data.at(-1) !== 217
    )
      fail(400, "INVALID_IMAGE", "Gambar JPG tidak valid.");
    let offset = 2;
    while (offset + 4 < data.length) {
      if (data[offset++] !== 255) break;
      let marker = data[offset++];
      while (marker === 255) marker = data[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      const size = view.getUint16(offset);
      if (size < 2 || offset + size > data.length) break;
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        if (size < 8) fail(400, "INVALID_IMAGE", "Struktur JPG tidak valid.");
        height = view.getUint16(offset + 3);
        width = view.getUint16(offset + 5);
        break;
      }
      offset += size;
    }
    dimensions(width, height);
    try {
      const decoded = jpeg.decode(data, {
        useTArray: true,
        formatAsRGBA: false,
        tolerantDecoding: false,
        maxResolutionInMP: 16,
        maxMemoryUsageInMB: 64,
      });
      if (decoded.width !== width || decoded.height !== height) throw Error();
    } catch {
      fail(
        400,
        "INVALID_IMAGE",
        "Gambar JPG tidak dapat dibaca atau terlalu besar.",
      );
    }
  } else fail(415, "IMAGE_TYPE", "Gunakan JPG atau PNG.");
  return { width, height };
}
function dimensions(w: number, h: number) {
  if (!w || !h || w > 10000 || h > 10000 || w * h > 16000000)
    fail(
      400,
      "IMAGE_DIMENSIONS",
      "Gambar maksimal 16 megapiksel dan 10.000 piksel per sisi.",
    );
}
