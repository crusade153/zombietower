// 외부 의존성 없이 PNG 아이콘 생성: node scripts/make-icons.mjs
import zlib from 'node:zlib';
import fs from 'node:fs';

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
function png(size, draw) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = draw(x / size, y / size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const inBox = (u, v, x0, y0, x1, y1) => u >= x0 && u <= x1 && v >= y0 && v <= y1;

function icon(u, v) {
  // 배경: 위는 어두운 적갈색, 아래는 용암
  let c = mix([30, 10, 10], [255, 106, 26], Math.pow(Math.max(0, v - 0.55) / 0.45, 1.4));
  if (v < 0.55) c = mix([20, 8, 8], [60, 18, 12], v / 0.55);
  // 타워(계단식 박스)
  if (inBox(u, v, 0.38, 0.30, 0.62, 0.86)) c = [58, 44, 44];
  if (inBox(u, v, 0.32, 0.56, 0.68, 0.86)) c = [74, 56, 56];
  if (inBox(u, v, 0.26, 0.74, 0.74, 0.88)) c = [92, 70, 70];
  // 좀비 머리(초록 박스) + 빨간 눈
  if (inBox(u, v, 0.40, 0.18, 0.60, 0.36)) c = [111, 160, 90];
  if (inBox(u, v, 0.43, 0.23, 0.48, 0.28) || inBox(u, v, 0.52, 0.23, 0.57, 0.28)) c = [255, 42, 42];
  if (inBox(u, v, 0.45, 0.31, 0.55, 0.33)) c = [40, 60, 30];
  // 발판 하이라이트
  if (inBox(u, v, 0.14, 0.50, 0.32, 0.54)) c = [94, 194, 105];
  if (inBox(u, v, 0.68, 0.40, 0.86, 0.44)) c = [94, 194, 105];
  return [...c, 255];
}

fs.mkdirSync('public/icons', { recursive: true });
for (const s of [180, 192, 512]) fs.writeFileSync(`public/icons/icon-${s}.png`, png(s, icon));
console.log('icons written');
