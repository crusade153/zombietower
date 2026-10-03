import fs from 'node:fs/promises';
import { generateTower } from '../src/world/TowerGenerator.js';
import { WEAPONS, RARITY, RARITY_PERKS } from '../src/config/weapons.js';
import { ZOMBIES } from '../src/config/zombies.js';
import { ECON, CHEST_ODDS, PHYS, LAVA } from '../src/config/balance.js';
import { makeWeaponMesh } from '../src/world/models.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

globalThis.FileReader = class {
  async readAsArrayBuffer(blob) { this.result = await blob.arrayBuffer(); this.onloadend?.(); }
  async readAsDataURL(blob) { this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`; this.onloadend?.(); }
};
await fs.mkdir('godot/data', { recursive: true });
await fs.mkdir('godot/assets/weapons', { recursive: true });
const maps = [20260101, 42, 1234, 77].map((seed) => {
  const tower = generateTower(seed);
  return {
    seed, platforms: tower.chain,
    safeIds: tower.safeZones.map((p) => p.id),
    sanctuaryId: tower.bossSanctuary.id, finalArenaId: tower.finalArena.id,
    zombies: tower.stages.flatMap((s) => s.zombies.map(({ platform, ...z }) => ({ ...z, platformId: platform.id, stage: s.index }))),
    pickups: tower.stages.flatMap((s) => s.pickups.map(({ platform, ...p }) => ({ ...p, platformId: platform.id, stage: s.index }))),
    aircoins: tower.stages.flatMap((s) => s.aircoins),
    hazards: tower.hazards.map(({ platform, ...h }) => ({ ...h, platformId: platform.id })),
  };
});
await fs.writeFile('godot/data/towers.json', JSON.stringify(maps));
await fs.writeFile('godot/data/balance.json', JSON.stringify({ weapons: WEAPONS, rarities: RARITY, perks: RARITY_PERKS, zombies: ZOMBIES, economy: ECON, chest: CHEST_ODDS, physics: PHYS, lava: LAVA, floorRewards: Array.from({ length: 11 }, (_, f) => ECON.floorReward(f)) }));
const exporter = new GLTFExporter();
for (const kind of Object.keys(WEAPONS)) for (const level of [0, 1, 4, 7, 10]) {
  const mesh = makeWeaponMesh({ kind, level, rarity: 4 });
  const buffer = await exporter.parseAsync(mesh, { binary: true });
  await fs.writeFile(`godot/assets/weapons/${kind}-${level}.glb`, Buffer.from(buffer));
}
console.log(`Exported ${maps.length} verified tower layouts, full balance data, and 30 weapon models.`);
