// Download only the requested official template using HTTP ranges.
import fs from 'node:fs/promises';
import zlib from 'node:zlib';
const url = 'https://godot-releases.nbg1.your-objectstorage.com/4.7.2-stable/Godot_v4.7.2-stable_export_templates.tpz';
const head = await fetch(url, { method: 'HEAD' });
if (!head.ok) throw new Error(`Template HEAD: ${head.status}`);
const size = Number(head.headers.get('content-length'));
async function range(start, end) {
  const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
  if (res.status !== 206) { await res.body.cancel(); throw new Error(`Server did not honor range: ${res.status}`); }
  return Buffer.from(await res.arrayBuffer());
}
const tail = await range(size - 100000, size - 1);
let eocd = -1;
for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
if (eocd < 0) throw new Error('ZIP directory missing');
const directory = await range(tail.readUInt32LE(eocd + 16), tail.readUInt32LE(eocd + 16) + tail.readUInt32LE(eocd + 12) - 1);
await fs.mkdir('.tools/godot/templates', { recursive: true });
let downloaded = 0;
const web = process.argv.includes('--web');
for (let i = 0; i < directory.length;) {
  if (directory.readUInt32LE(i) !== 0x02014b50) throw new Error('Invalid ZIP directory');
  const method = directory.readUInt16LE(i + 10);
  const compressed = directory.readUInt32LE(i + 20);
  const nameLength = directory.readUInt16LE(i + 28);
  const extraLength = directory.readUInt16LE(i + 30);
  const commentLength = directory.readUInt16LE(i + 32);
  const offset = directory.readUInt32LE(i + 42);
  const name = directory.subarray(i + 46, i + 46 + nameLength).toString();
  if ((web ? /web_nothreads_release\.zip$/ : /windows_release_x86_64\.exe$/).test(name)) {
    const local = await range(offset, offset + 29);
    const start = offset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
    const body = await range(start, start + compressed - 1);
    const decoded = method === 8 ? zlib.inflateRawSync(body) : body;
    const basename = name.split('/').pop();
    await fs.writeFile(`.tools/godot/templates/${basename}`, decoded);
    downloaded += body.length;
    console.log(`${basename}: ${decoded.length} bytes verified decompressed`);
  }
  i += 46 + nameLength + extraLength + commentLength;
}
if (!downloaded) throw new Error('Requested template not found');
console.log(`Downloaded ${(downloaded / 1024 / 1024).toFixed(1)} MB instead of ${(size / 1024 / 1024).toFixed(0)} MB.`);
