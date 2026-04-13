#!/usr/bin/env node
/**
 * Generate placeholder app icons for electron-builder.
 *
 * Creates a 256x256 PNG with the Team-X "T" logo (Strategia red on dark bg)
 * and a 512x512 variant for Linux. electron-builder converts PNG to ICO/ICNS
 * automatically when the `icon` field points to a PNG without extension.
 *
 * Replace these with professionally designed icons before public release (M27).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = join(__dirname, '..', 'apps', 'desktop', 'build');

mkdirSync(BUILD_DIR, { recursive: true });

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    let byte = buf[i];
    for (let j = 0; j < 8; j++) {
      if ((crc ^ byte) & 1) {
        crc = (crc >>> 1) ^ 0xedb88320;
      } else {
        crc = crc >>> 1;
      }
      byte >>>= 1;
    }
  }
  return crc ^ -1;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crcBuf]);
}

function createPNG(size) {
  const px = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const s = size / 256; // scale factor

      let r = 15;
      let g = 15;
      let b = 35;
      let a = 255;

      // Rounded-rect border
      const m = Math.round(16 * s);
      const bw = Math.round(4 * s);
      const cr = Math.round(32 * s);

      const inOuter = x >= m && x < size - m && y >= m && y < size - m;
      const inInner = x >= m + bw && x < size - m - bw && y >= m + bw && y < size - m - bw;

      // Corner exclusion
      let outside = false;
      const corners = [
        [m + cr, m + cr],
        [size - m - cr, m + cr],
        [m + cr, size - m - cr],
        [size - m - cr, size - m - cr],
      ];
      for (const [cx, cy] of corners) {
        const dx = x < cx && x < size / 2 ? cx - x : x > cx && x > size / 2 ? x - cx : 0;
        const dy = y < cy && y < size / 2 ? cy - y : y > cy && y > size / 2 ? y - cy : 0;
        if ((dx > 0 || dy > 0) && Math.sqrt(dx * dx + dy * dy) > cr) {
          outside = true;
          break;
        }
      }

      if (inOuter && !outside) {
        if (!inInner) {
          r = 170;
          g = 32;
          b = 36; // Strategia red border
        } else {
          r = 15;
          g = 15;
          b = 35; // Dark inner
        }
      } else {
        a = 0; // Transparent outside
      }

      // "T" letter
      const tBarT = Math.round(60 * s);
      const tBarB = Math.round(85 * s);
      const tBarL = Math.round(55 * s);
      const tBarR = Math.round(200 * s);
      const tStemL = Math.round(110 * s);
      const tStemR = Math.round(146 * s);
      const tBot = Math.round(200 * s);

      const inTBar = x >= tBarL && x <= tBarR && y >= tBarT && y <= tBarB;
      const inTStem = x >= tStemL && x <= tStemR && y > tBarB && y <= tBot;

      if ((inTBar || inTStem) && inOuter && !outside) {
        const progress = (y - tBarT) / (tBot - tBarT);
        r = Math.round(170 + 63 * progress);
        g = Math.round(32 + 37 * progress);
        b = Math.round(36 + 60 * progress);
        a = 255;
      }

      px[idx] = r;
      px[idx + 1] = g;
      px[idx + 2] = b;
      px[idx + 3] = a;
    }
  }

  // Build PNG: filter byte 0 per row
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const rowOff = y * (1 + size * 4);
    raw[rowOff] = 0;
    px.copy(raw, rowOff + 1, y * size * 4, (y + 1) * size * 4);
  }

  const compressed = deflateSync(raw);
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Generate both sizes
const png256 = createPNG(256);
const png512 = createPNG(512);

writeFileSync(join(BUILD_DIR, 'icon.png'), png256);
writeFileSync(join(BUILD_DIR, 'icon-512.png'), png512);

console.log(`icon.png    ${png256.length} bytes (256x256)`);
console.log(`icon-512.png ${png512.length} bytes (512x512)`);
console.log('Build icons written to apps/desktop/build/');
