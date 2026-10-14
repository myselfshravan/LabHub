// Generates public/icon/{16,32,48,128}.png: a rounded square with a white "refresh" arc.
// Pure Node (zlib) so it needs no image tooling. Run: node scripts/gen-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size, pixel) {
  const ss = 4; // supersampling for anti-aliasing
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0, 0];
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const [r, g, b, a] = pixel((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size);
          acc[0] += r * a; acc[1] += g * a; acc[2] += b * a; acc[3] += a;
        }
      const a = acc[3] / (ss * ss);
      const o = 1 + x * 4;
      row[o] = a ? acc[0] / acc[3] : 0;
      row[o + 1] = a ? acc[1] / acc[3] : 0;
      row[o + 2] = a ? acc[2] / acc[3] : 0;
      row[o + 3] = Math.round(a * 255);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Shape in unit coordinates.
function pixel(u, v) {
  const r = 0.22; // corner radius
  const dx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0);
  const dy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0);
  if (dx * dx + dy * dy > r * r) return [0, 0, 0, 0];
  const bg = [252 - 60 * v, 109 - 20 * v, 38 + 30 * v]; // GitLab orange, slightly graded
  const x = u - 0.5, y = v - 0.5;
  const d = Math.hypot(x, y);
  const ang = Math.atan2(y, x); // -π..π, 0 = right
  // Arc of ~300° leaving a gap at the top-right, plus a triangular arrow head at the gap.
  const onRing = Math.abs(d - 0.24) < 0.065 && !(ang < -0.35 && ang > -1.35);
  const hx = 0.5 + 0.24 * Math.cos(-0.35), hy = 0.5 + 0.24 * Math.sin(-0.35);
  const inHead = (() => {
    // Triangle pointing "up-left" along the arc tangent at the gap.
    const px = u - hx, py = v - hy;
    const t = [Math.sin(-0.35), -Math.cos(-0.35)]; // tangent direction (counter-clockwise)
    const n = [Math.cos(-0.35), Math.sin(-0.35)];
    const along = px * t[0] + py * t[1];
    const across = px * n[0] + py * n[1];
    return along > -0.02 && along < 0.16 && Math.abs(across) < 0.13 * (1 - (along + 0.02) / 0.18);
  })();
  return onRing || inHead ? [255, 255, 255, 1] : [...bg, 1];
}

mkdirSync('public/icon', { recursive: true });
for (const size of [16, 32, 48, 128]) writeFileSync(`public/icon/${size}.png`, png(size, pixel));
console.log('icons written');
