import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

let crcTable;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++)
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++)
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function makePng(size, pixelFn) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x, y, size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const ACCENT = [0, 95, 184];
const PAGE = [255, 255, 255];
const FOLD = [168, 200, 236];
const LINE = [91, 155, 213];

function pixel(x, y, size) {
  const s = 256 / size;
  const bx = x * s;
  const by = y * s;
  const r = 58;
  // rounded square
  const dx = Math.max(r - bx, 0, bx - (256 - r));
  const dy = Math.max(r - by, 0, by - (256 - r));
  if (dx * dx + dy * dy > r * r) return [0, 0, 0, 0];
  // page
  if (bx >= 84 && bx <= 172 && by >= 60 && by <= 196) {
    if (bx > 150 && by < 82 && bx - 150 > by - 60) {
      // cut corner
      return [0, 0, 0, 0];
    }
    if (bx >= 150 && by < 82) return [...FOLD, 255];
    // lines
    if (bx >= 98 && bx <= 158) {
      if ((by >= 104 && by <= 110) || (by >= 122 && by <= 128))
        return [...LINE, 255];
      if (by >= 140 && by <= 146 && bx <= 130) return [...LINE, 255];
    }
    return [...PAGE, 255];
  }
  return [...ACCENT, 255];
}

function makeIco(png256) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry[0] = 0;
  entry[1] = 0;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png256.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, png256]);
}

const png32 = makePng(32, pixel);
const png64 = makePng(64, pixel);
const png128 = makePng(128, pixel);
const png256 = makePng(256, pixel);

const out = (p, data) => {
  const full = join(root, p);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, p.endsWith(".ico") ? makeIco(png256) : data);
  console.log("wrote", p);
};

out("src-tauri/icons/32x32.png", png32);
out("src-tauri/icons/128x128.png", png128);
out("src-tauri/icons/128x128@2x.png", png256);
out("src-tauri/icons/icon.ico");
out("public/icon.png", png64);
