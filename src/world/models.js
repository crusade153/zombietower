import * as THREE from 'three';
import { makeClassicHumanoid } from './ClassicHumanoid.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { weaponAppearance } from '../combat/Weapons.js';
import { RARITY, WEAPONS, baseWeaponKind } from '../config/weapons.js';
import { radialTexture } from './Glow.js';

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 16);
const roundGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.14);
const sphereGeo = new THREE.SphereGeometry(1, 16, 12);
// 일반 몬스터용 저해상도 도형 (몬스터가 많아 삼각형 수를 약 1/3로 줄인다)
const roundGeoLow = new RoundedBoxGeometry(1, 1, 1, 1, 0.14);
const sphereGeoLow = new THREE.SphereGeometry(1, 10, 7);
let lowDetail = false;
const matCache = new Map();
let modelStyle = 'polished';
export function setModelStyle(style) { modelStyle = style === 'classic' ? 'classic' : 'polished'; }
export function getModelStyle() { return modelStyle; }

export function lambert(color, emissive = 0x000000) {
  const key = `${modelStyle}-${color}-${emissive}`;
  let m = matCache.get(key);
  if (!m) {
    m = modelStyle === 'classic'
      ? new THREE.MeshLambertMaterial({ color, emissive })
      : new THREE.MeshStandardMaterial({ color, emissive, roughness: 0.72, metalness: 0.05 });
    matCache.set(key, m);
  }
  return m;
}

export function metal(color, roughness = 0.28) {
  if (modelStyle === 'classic') return lambert(color);
  const key = `metal-${color}-${roughness}`;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, metalness: 0.78, roughness }));
  return matCache.get(key);
}

/** Bake decorative geometry into one draw call per material. */
export function batchMeshes(group) {
  const batches = new Map();
  group.updateMatrixWorld(true);
  const inverse = group.matrixWorld.clone().invert();
  const meshes = [];
  group.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const mesh of meshes) {
    const geo = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone())
      .applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
    if (!batches.has(mesh.material)) batches.set(mesh.material, []);
    batches.get(mesh.material).push(geo);
  }
  // Temporary unique geometries are freed, shared primitives remain cached.
  const shared = new Set([boxGeo, cylGeo, roundGeo, sphereGeo, roundGeoLow, sphereGeoLow]);
  new Set(meshes.map((m) => m.geometry)).forEach((geo) => { if (!shared.has(geo)) geo.dispose(); });
  group.clear();
  for (const [material, geos] of batches) {
    const mesh = new THREE.Mesh(mergeGeometries(geos, false), material);
    geos.forEach((geo) => geo.dispose());
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

/** Merge stationary meshes without consuming labels, halos or animated props. */
export function batchStaticMeshes(group, moving = new Set()) {
  group.updateMatrixWorld(true);
  const inverse = group.matrixWorld.clone().invert();
  const batches = new Map();
  const meshes = [];
  group.traverse((mesh) => {
    if (!mesh.isMesh || mesh.isInstancedMesh || Array.isArray(mesh.material)) return;
    for (let parent = mesh; parent && parent !== group; parent = parent.parent) if (moving.has(parent)) return;
    meshes.push(mesh);
  });
  for (const mesh of meshes) {
    const key = `${mesh.material.uuid}:${mesh.castShadow}:${mesh.receiveShadow}`;
    if (!batches.has(key)) batches.set(key, { geos: [], source: mesh });
    const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
    batches.get(key).geos.push(geo);
    mesh.removeFromParent();
  }
  const retained = new Set([boxGeo, cylGeo, roundGeo, sphereGeo, roundGeoLow, sphereGeoLow]);
  group.traverse((o) => { if (o.geometry) retained.add(o.geometry); });
  for (const geo of new Set(meshes.map((m) => m.geometry))) if (!retained.has(geo) && !geo.userData.shared) geo.dispose();
  for (const { geos, source } of batches.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(geos, false), source.material);
    geos.forEach((geo) => geo.dispose());
    mesh.castShadow = source.castShadow;
    mesh.receiveShadow = source.receiveShadow;
    group.add(mesh);
  }
  return group;
}

export function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(boxGeo, material);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  return m;
}

export function cyl(rTop, h, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(cylGeo, material);
  m.scale.set(rTop, h, rTop);
  m.position.set(x, y, z);
  return m;
}

export function rounded(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(modelStyle === 'classic' ? boxGeo : (lowDetail ? roundGeoLow : roundGeo), material);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  return m;
}

export function sphere(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(modelStyle === 'classic' ? boxGeo : (lowDetail ? sphereGeoLow : sphereGeo), material);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  return m;
}

/** 꾸미기 모자. 머리(head) 그룹에 붙인다. 없으면 null */
export function makeHat(id) {
  if (!id || id === 'none') return null;
  const top = modelStyle === 'classic' ? 0.24 : 0.36;
  const g = new THREE.Group();
  const std = (color, emissive = 0, metalness = 0.1) => new THREE.MeshStandardMaterial({ color, emissive, metalness, roughness: 0.4 });
  const add = (geo, mat, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); g.add(m); return m; };
  if (id === 'crown') {
    const gold = std(0xffcc33, 0x3a2600, 0.7);
    add(new THREE.CylinderGeometry(0.27, 0.27, 0.16, 16, 1, true), gold, 0, top + 0.06, 0).material.side = THREE.DoubleSide;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      add(new THREE.ConeGeometry(0.06, 0.16, 6), gold, Math.sin(a) * 0.24, top + 0.2, Math.cos(a) * 0.24);
    }
    add(new THREE.OctahedronGeometry(0.06), std(0xff4a6a, 0x400010), 0, top + 0.07, 0.27);
  } else if (id === 'wizard') {
    const cloth = std(0x6a4bd8);
    add(new THREE.CylinderGeometry(0.46, 0.46, 0.04, 20), cloth, 0, top + 0.02, 0);
    add(new THREE.ConeGeometry(0.3, 0.72, 16), cloth, 0, top + 0.4, -0.04, -0.15);
    add(new THREE.OctahedronGeometry(0.07), std(0xffe14a, 0x6a5000), 0.12, top + 0.32, 0.22);
  } else if (id === 'horns') {
    const red = std(0xd8282f, 0x300000);
    for (const s of [-1, 1]) add(new THREE.ConeGeometry(0.07, 0.34, 8), red, s * 0.24, top + 0.1, 0.05, 0, -s * 0.45);
  } else if (id === 'halo') {
    add(new THREE.TorusGeometry(0.27, 0.035, 8, 28), std(0xfff3a0, 0xffd84a), 0, top + 0.34, 0, Math.PI / 2);
  } else if (id === 'bunny') {
    const white = std(0xfdfdfd);
    const pink = std(0xffa6c4);
    for (const s of [-1, 1]) {
      add(new THREE.SphereGeometry(1, 10, 8), white, s * 0.14, top + 0.26, -0.02, 0, -s * 0.18).scale.set(0.08, 0.3, 0.05);
      add(new THREE.SphereGeometry(1, 10, 8), pink, s * 0.14, top + 0.26, 0.02, 0, -s * 0.18).scale.set(0.045, 0.22, 0.03);
    }
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.hat = id;
  return g;
}

// 먼 몬스터용 한 덩어리 모형: 종류별로 한 번만 만들고 모든 개체가 공유 (그리기 1회)
const lodCache = new Map();
const lodMat = new THREE.MeshLambertMaterial({ vertexColors: true });
lodMat.userData.shared = true;
export function makeZombieLod(type, d) {
  let geo = lodCache.get(type);
  if (!geo) {
    const c = d.colors;
    const parts = [
      [0.74, 0.62, 0.46, c.shirt, 0, 0.98, 0], // 몸통
      [0.76, 0.64, 0.66, c.skin, 0, 1.48, 0], // 머리
      [0.26, 0.6, 0.27, c.shirt, -0.46, 1.0, 0.2], // 팔(앞으로 뻗음)
      [0.26, 0.6, 0.27, c.shirt, 0.46, 1.0, 0.2],
      [0.29, 0.68, 0.32, c.pants, -0.18, 0.34, 0], // 다리
      [0.29, 0.68, 0.32, c.pants, 0.18, 0.34, 0],
    ];
    const col = new THREE.Color();
    const geos = parts.map(([w, h, dd, color, x, y, z]) => {
      const g = new THREE.BoxGeometry(w, h, dd).toNonIndexed();
      g.translate(x, y, z);
      col.setHex(color);
      const n = g.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      g.deleteAttribute('uv');
      return g;
    });
    geo = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    geo.scale(d.scale, d.scale, d.scale);
    geo.userData.shared = true;
    lodCache.set(type, geo);
  }
  const mesh = new THREE.Mesh(geo, lodMat);
  mesh.visible = false;
  return mesh;
}

export function disposeWorld(scene) {
  const sharedGeometries = new Set([boxGeo, cylGeo, roundGeo, sphereGeo, roundGeoLow, sphereGeoLow]);
  const sharedMaterials = new Set(matCache.values());
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  scene.traverse((o) => {
    if (o.isInstancedMesh) o.dispose();
    if (o.geometry && !sharedGeometries.has(o.geometry) && !o.geometry.userData.shared) geometries.add(o.geometry);
    for (const m of o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []) {
      if (sharedMaterials.has(m) || m.userData.shared) continue;
      materials.add(m);
      for (const value of Object.values(m)) if (value?.isTexture && !value.userData.shared) textures.add(value);
    }
    if (o.isLight && o.shadow) o.shadow.dispose();
  });
  textures.forEach((t) => t.dispose());
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  scene.clear();
}

/**
 * 로블록스풍 박스 인간. 키 ≈ 1.8 (scale 곱).
 * 앞(얼굴)은 +Z 방향.
 */
const BIG = ['boss', 'finalBoss', 'magmaGiant', 'plagueQueen', 'captain'];

export function makeHumanoid(options = {}) {
  if (modelStyle === 'classic') return makeClassicHumanoid(options, { box, lambert });
  // 일반 몬스터는 작게 보이므로 저해상도로. 보스·플레이어는 그대로
  lowDetail = !!options.zombie && !BIG.includes(options.variant);
  try { return makePolishedHumanoid(options); } finally { lowDetail = false; }
}

// Keep the outer root: combat, death animation and physics retain their references.
export function replaceHumanoid(previous, options = {}) {
  const next = makeHumanoid(options);
  next.model.removeFromParent();
  disposeWorld(previous.root);
  previous.root.add(next.model);
  next.root = previous.root;
  return next;
}

function makePolishedHumanoid({
  skin = 0xffc998, shirt = 0xff635e, pants = 0x32495b, hair = 0x503b38,
  scale = 1, zombie = false, ownMaterials = false, variant = 'walker',
} = {}) {
  const owned = [];
  const mk = (c, e = 0) => {
    if (!ownMaterials) return lambert(c, e);
    const m = new THREE.MeshStandardMaterial({ color: c, emissive: e, roughness: 0.72 });
    m.userData.baseEmissive = m.emissive.clone();
    owned.push(m);
    return m;
  };
  const mats = { skin: mk(skin), shirt: mk(shirt), pants: mk(pants), hair: mk(hair) };
  const eyeMat = mk(zombie ? 0xffb94c : 0x202c35, zombie ? 0xff5a10 : 0);
  const white = mk(zombie ? 0xff762a : 0xfff9e7, zombie ? 0x8a2604 : 0);
  const yellow = mk(0xffd854);
  const teal = mk(0x36d4bd);
  const pink = mk(0xf583a8);
  const root = new THREE.Group();
  const model = new THREE.Group();
  model.scale.setScalar(scale);
  root.add(model);

  const torso = new THREE.Group();
  torso.position.set(0, 0.98, 0);
  torso.add(rounded(0.72, 0.61, 0.43, mats.shirt));
  const head = new THREE.Group();
  head.position.set(0, 1.48, 0);
  head.add(rounded(0.76, 0.64, 0.66, mats.skin));
  for (const side of [-1, 1]) {
    head.add(sphere(0.095, 0.12, 0.095, mats.skin, side * 0.39, -0.03, 0));
    const eyeSize = zombie && side < 0 ? 1.2 : 1;
    head.add(sphere(0.12 * eyeSize, 0.145 * eyeSize, 0.055, white, side * 0.165, 0.06, 0.321));
    head.add(sphere(0.064, 0.08, 0.035, eyeMat, side * 0.16, 0.04, 0.37));
    head.add(sphere(0.019, 0.025, 0.016, white, side * 0.16 - 0.016, 0.07, 0.397));
    head.add(sphere(0.073, 0.04, 0.012, zombie ? mats.shirt : pink, side * 0.24, -0.115, 0.333));
  }
  head.add(rounded(0.22, zombie ? 0.16 : 0.085, 0.045, eyeMat, 0, -0.17, 0.333));
  head.add(rounded(0.07, 0.07, 0.035, white, zombie ? -0.045 : 0, -0.13, 0.365));
  head.add(sphere(0.05, 0.045, 0.04, mats.skin, 0, -0.035, 0.355));
  if (!zombie) {
    head.add(rounded(0.79, 0.19, 0.7, mats.shirt, 0, 0.29, -0.02));
    head.add(rounded(0.65, 0.065, 0.44, mats.shirt, 0, 0.245, 0.36));
    head.add(rounded(0.16, 0.14, 0.035, white, 0, 0.3, 0.346));
    head.add(rounded(0.14, 0.19, 0.23, mats.hair, -0.31, 0.14, -0.1));
    head.add(rounded(0.14, 0.19, 0.23, mats.hair, 0.31, 0.14, -0.1));
    torso.add(rounded(0.58, 0.105, 0.51, yellow, 0, 0.28, 0));
    torso.add(rounded(0.14, 0.25, 0.045, yellow, -0.16, 0.11, 0.24));
    torso.add(rounded(0.48, 0.5, 0.28, teal, 0, -0.01, -0.31));
    torso.add(rounded(0.32, 0.18, 0.08, yellow, 0, -0.12, -0.47));
    for (const side of [-1, 1]) torso.add(rounded(0.06, 0.49, 0.025, teal, side * 0.24, -0.01, 0.23));
    torso.add(rounded(0.04, 0.44, 0.015, white, 0, -0.03, 0.22));
  } else {
    const fire = mk(0xffa333, 0xff5a16);
    const rock = mk(0x2a2335);
    const heavy = ['tank', 'boss', 'brute', 'warlock', 'finalBoss', 'captain', 'magmaGiant', 'plagueQueen', 'splitter'].includes(variant);
    // Volcanic horns, obsidian plates, and molten cracks replace the friendly zombie look.
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(heavy ? 0.13 : 0.085, heavy ? 0.6 : 0.3, 7), rock);
      horn.position.set(side * 0.33, heavy ? 0.5 : 0.4, -0.08);
      horn.rotation.z = -side * 0.35;
      head.add(horn);
      torso.add(rounded(heavy ? 0.3 : 0.2, 0.26, 0.52, rock, side * 0.4, 0.15, 0));
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, heavy ? 0.4 : 0.22, 6), fire);
      spike.position.set(side * 0.43, 0.37, -0.1);
      torso.add(spike);
      torso.add(rounded(0.035, 0.45, 0.04, fire, side * 0.24, -0.03, 0.25));
    }
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(heavy ? 0.18 : 0.12), fire);
    core.position.set(0, 0.02, 0.29);
    torso.add(core);
    for (let i = 0; i < 3; i++) head.add(rounded(0.025, 0.14, 0.025, fire, -0.24 + i * 0.06, -0.12 + i * 0.03, 0.342));
    if (variant === 'finalBoss') {
      for (const side of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 5), rock);
        wing.position.set(side * 0.72, 0.2, -0.22);
        wing.rotation.z = -side * 0.7;
        torso.add(wing);
      }
      head.add(rounded(0.52, 0.08, 0.06, fire, 0, 0.26, 0.33));
    }
    head.add(rounded(0.18, 0.035, 0.015, mats.hair, 0.19, 0.24, 0.325));
    head.add(rounded(0.025, 0.1, 0.02, eyeMat, 0.15, 0.24, 0.336));
    head.add(rounded(0.025, 0.1, 0.02, eyeMat, 0.22, 0.24, 0.336));
    head.add(rounded(0.24, 0.1, 0.38, mats.hair, -0.16, 0.33, -0.03));
    for (const side of [-1, 1]) head.add(cyl(0.07, 0.12, white, side * 0.37, -0.17, -0.1));
    torso.add(rounded(0.12, 0.12, 0.025, yellow, -0.18, 0.08, 0.225));
    if (variant === 'runner' || variant === 'leaper' || variant === 'mini') {
      head.add(rounded(0.8, 0.07, 0.7, pink, 0, 0.19, 0));
    } else if (['tank', 'boss', 'finalBoss', 'brute', 'captain', 'magmaGiant'].includes(variant)) {
      head.add(rounded(0.83, 0.17, 0.72, variant === 'boss' || variant === 'captain' ? yellow : teal, 0, 0.32, 0));
      for (const side of [-1, 0, 1]) head.add(rounded(0.14, 0.2, 0.15, yellow, side * 0.25, 0.45, 0));
    } else if (variant === 'spitter') {
      torso.add(sphere(0.2, 0.22, 0.14, pink, 0, 0.01, 0.21));
    }
  }

  const makeArm = (side) => {
    const g = new THREE.Group();
    g.position.set(side * 0.46, 1.23, 0);
    g.add(rounded(0.25, 0.36, 0.27, mats.shirt, 0, -0.17, 0));
    if (zombie) g.add(rounded(0.22, 0.22, 0.24, mats.skin, 0, -0.44, 0));
    else {
      const forearm = new THREE.Group();
      forearm.position.y = -0.33;
      forearm.add(rounded(0.22, 0.22, 0.24, white, 0, -0.11, 0));
      g.add(forearm);
      g.userData.forearm = forearm;
    }
    return g;
  };
  const makeLeg = (side) => {
    const g = new THREE.Group();
    g.position.set(side * 0.18, 0.68, 0);
    g.add(rounded(0.28, 0.48, 0.3, mats.pants, 0, -0.23, 0));
    g.add(rounded(0.32, 0.19, 0.46, zombie ? pink : mats.shirt, 0, -0.54, 0.065));
    g.add(rounded(0.33, 0.065, 0.47, white, 0, -0.635, 0.065));
    return g;
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);
  const legL = makeLeg(-1);
  const legR = makeLeg(1);
  const hand = new THREE.Group();
  hand.position.set(0, zombie ? -0.52 : -0.19, 0);
  (armR.userData.forearm || armR).add(hand);
  model.add(torso, head, armL, armR, legL, legR);
  // Merge rigid pieces by material; the head and each limb can still animate.
  for (const part of [torso, head, armL, armR, legL, legR]) {
    const batches = new Map();
    for (const mesh of [...part.children]) {
      if (!mesh.isMesh) continue;
      mesh.updateMatrix();
      const geo = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(mesh.matrix);
      if (!batches.has(mesh.material)) batches.set(mesh.material, []);
      batches.get(mesh.material).push(geo);
      part.remove(mesh);
    }
    for (const [material, geos] of batches) {
      const geo = mergeGeometries(geos, false);
      geos.forEach((piece) => piece.dispose());
      part.add(new THREE.Mesh(geo, material));
    }
  }
  // 몬스터는 발밑 원형 그림자(blob)가 있으므로 실시간 그림자를 그리지 않는다 (그림자 패스 비용 절감)
  model.traverse((o) => { if (o.isMesh) { o.castShadow = !zombie; o.receiveShadow = true; } });
  return { root, model, parts: { head, torso, armL, armR, legL, legR, hand, elbowL: armL.userData.forearm, elbowR: armR.userData.forearm }, materials: ownMaterials ? owned : Object.values(mats), eyeMat };
}

/** 무기 모델. 근접: +Z로 뻗음(팔을 앞으로 들면 위를 향함). 총: −Y로 뻗음(팔을 앞으로 들면 정면). */
export function makeWeaponMesh(weapon, accent = 0xc9ced6) {
  const w = typeof weapon === 'string' ? { kind: weapon, rarity: 0, level: 0 } : weapon;
  const kind = baseWeaponKind(w);
  const fusion = !!WEAPONS[w.kind].fusion;
  const look = weaponAppearance(w);
  const { tier, level } = look;
  if (typeof weapon !== 'string') accent = Number.parseInt(RARITY[w.rarity].color.slice(1), 16);
  const g = new THREE.Group();
  const wood = lambert(0xa96235);
  const dark = metal(0x263443, 0.4);
  const steel = metal(tier >= 3 ? 0xffcd54 : 0xc3d5e1);
  const acc = metal(accent);
  const energyColor = Number.parseInt((fusion && tier < 2 ? WEAPONS[w.kind].color : look.color).slice(1), 16);
  const energy = lambert(energyColor, tier >= 2 || fusion ? energyColor : 0);
  const grip = lambert(0x18232e);
  const band = (z, radius = 0.145) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.026, 8, 20), tier >= 2 ? energy : steel);
    ring.position.z = z;
    g.add(ring);
  };
  g.userData.appearance = look;
  if (fusion && kind === 'bat') {
    g.add(rounded(0.12, 0.12, 1.35, grip, 0, 0, 0.52));
    g.add(rounded(0.96, 0.38, 0.5, dark, 0, 0, 1.1));
    for (const side of [-1, 1]) {
      g.add(rounded(0.18, 0.5, 0.64, steel, side * 0.5, 0, 1.1));
      g.add(rounded(0.04, 0.42, 0.47, energy, side * 0.61, 0, 1.1));
    }
    g.add(sphere(0.19, 0.24, 0.19, energy, 0, 0.2, 1.1));
    for (const z of [0.22, 0.5, 0.81]) band(z, 0.1);
  } else if (fusion && kind === 'axe') {
    g.add(rounded(0.12, 0.12, 1.62, dark, 0, 0, 0.66));
    for (const side of [-1, 1]) {
      const blade = new THREE.Shape();
      blade.moveTo(0, 0.86); blade.quadraticCurveTo(0.65, 0.57, 0.91, 1.58);
      blade.quadraticCurveTo(0.42, 1.12, 0, 1.2); blade.closePath();
      const head = new THREE.Mesh(new THREE.ExtrudeGeometry(blade, { depth: 0.085, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.02, bevelSegments: 1, curveSegments: 12 }), steel);
      head.rotation.x = Math.PI / 2; head.position.y = 0.04; head.scale.x = side; g.add(head);
      const edge = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.035, 6, 20, Math.PI * 0.8), energy);
      edge.rotation.x = Math.PI / 2; edge.position.set(side * 0.25, -0.08, 1.08); edge.scale.x = side; g.add(edge);
    }
    g.add(sphere(0.16, 0.15, 0.18, energy, 0, 0, 1.08));
    for (const z of [0.2, 0.5, 0.8]) band(z, 0.1);
  } else if (fusion && kind === 'whip') {
    g.add(rounded(0.18, 0.18, 0.4, dark, 0, 0, 0.13));
    for (let i = 0; i < 12; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.082, 0.025, 6, 10), i % 3 ? steel : energy);
      ring.position.set(Math.sin(i * 0.7) * 0.16, 0, 0.4 + i * 0.12);
      ring.rotation.set(i % 2 ? Math.PI / 2 : 0, 0, 0); g.add(ring);
    }
    g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.19), energy)).position.set(0.16, 0, 1.88);
    for (const side of [-1, 1]) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.32, 6), steel);
      spike.rotation.z = side * Math.PI / 2; spike.position.set(side * 0.19 + 0.16, 0, 1.88); g.add(spike);
    }
  } else switch (kind) {
    case 'bat':
      g.add(rounded(0.11, 0.11, 0.4, grip, 0, 0, 0.14));
      g.add(rounded(0.25, 0.25, 0.78, tier ? steel : wood, 0, 0, 0.71));
      for (const z of [0.42, 0.67, 0.96]) band(z);
      if (tier) for (const z of [0.53, 0.82]) for (const side of [-1, 1]) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.23, 8), steel);
        spike.position.set(side * 0.18, 0, z);
        spike.rotation.z = -side * Math.PI / 2;
        g.add(spike);
      }
      if (tier >= 3) g.add(rounded(0.055, 0.28, 0.66, energy, 0, 0, 0.73));
      break;
    case 'axe': {
      g.add(rounded(0.1, 0.1, 1.18, tier ? dark : wood, 0, 0, 0.5));
      const blade = new THREE.Shape();
      blade.moveTo(-0.07, 0.67); blade.lineTo(0.38, 0.68); blade.quadraticCurveTo(0.58, 0.92, 0.36, 1.16);
      blade.lineTo(-0.07, 1.08); blade.closePath();
      const head = new THREE.Mesh(new THREE.ExtrudeGeometry(blade, { depth: 0.07, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.02, bevelSegments: 2, steps: 1, curveSegments: 10 }), steel);
      head.rotation.x = Math.PI / 2;
      head.position.y = 0.035;
      g.add(head);
      if (tier >= 1) {
        const back = head.clone(); back.scale.x = -0.75; g.add(back);
      }
      for (const z of [0.13, 0.36, 0.71]) band(z, 0.08);
      if (tier >= 2) g.add(rounded(0.34, 0.075, 0.065, energy, 0.19, 0, 0.96));
      break;
    }
    case 'whip': {
      g.add(rounded(0.12, 0.12, 0.36, grip, 0, 0, 0.12));
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0.29), new THREE.Vector3(0.15, 0, 0.64), new THREE.Vector3(-0.15, 0.04, 0.94), new THREE.Vector3(0.1, 0.09, 1.27)]);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, tier >= 2 ? 0.046 : 0.032, 8, false), tier >= 2 ? energy : wood));
      if (tier) for (let i = 2; i <= 8; i++) {
        const p = curve.getPoint(i / 9);
        g.add(sphere(0.065, 0.065, 0.065, steel, p.x, p.y, p.z));
      }
      g.add(sphere(0.085, 0.085, 0.085, energy, 0.1, 0.09, 1.27));
      break;
    }
    case 'pistol':
    case 'rifle':
    case 'shotgun': {
      const long = kind !== 'pistol';
      const length = fusion ? (long ? 1.28 : 0.75) : (long ? 0.96 : 0.48);
      g.userData.muzzle = new THREE.Vector3(0, -length - 0.04, 0.035);
      g.add(rounded(0.19, length * 0.55, 0.21, tier ? steel : dark, 0, -length * 0.29, 0.015));
      g.add(rounded(0.12, 0.22, 0.22, grip, 0, 0.03, -0.12));
      g.add(cyl(0.045, length * 0.5, dark, 0, -length * 0.74, 0.035));
      g.add(cyl(0.058, 0.07, tier >= 2 ? energy : steel, 0, -length, 0.035));
      g.add(rounded(0.035, length * 0.4, 0.035, acc, 0, -length * 0.27, 0.137));
      if (long) {
        g.add(rounded(0.15, 0.27, 0.18, tier ? steel : wood, 0, 0.22, 0.01));
        g.add(rounded(0.13, 0.19, 0.24, kind === 'shotgun' ? wood : dark, 0, -0.39, -0.1));
      }
      if (kind === 'shotgun') {
        g.add(cyl(0.04, 0.41, steel, 0, -0.77, -0.07));
        for (let i = 0; i < 4; i++) g.add(rounded(0.17, 0.025, 0.22, dark, 0, -0.33 - i * 0.045, -0.04));
      }
      if (tier >= 1) {
        g.add(rounded(0.09, long ? 0.27 : 0.16, 0.1, dark, 0, -length * 0.35, 0.2));
        g.add(sphere(0.045, 0.045, 0.022, energy, 0, -length * 0.28, 0.26));
      }
      if (tier >= 2) for (const side of [-1, 1]) g.add(rounded(0.025, length * 0.5, 0.035, energy, side * 0.105, -length * 0.42, 0.05));
      if (tier >= 3) g.add(rounded(0.25, 0.15, 0.25, steel, 0, -length * 0.81, 0.02));
      if (fusion) {
        for (const side of [-1, 1]) {
          g.add(rounded(0.085, length * 0.75, 0.16, dark, side * 0.2, -length * 0.55, 0.035));
          g.add(rounded(0.04, length * 0.65, 0.05, energy, side * 0.24, -length * 0.55, 0.12));
        }
        if (kind === 'shotgun') for (const x of [-0.16, 0, 0.16]) {
          g.add(cyl(0.075, 0.63, steel, x, -length * 0.79, 0.035));
          g.add(cyl(0.082, 0.06, energy, x, -length, 0.035));
        }
        else for (let i = 0; i < 4; i++) {
          const coil = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 6, 16), energy);
          coil.rotation.x = Math.PI / 2; coil.position.set(0, -length * (0.53 + i * 0.12), 0.035); g.add(coil);
        }
        g.add(sphere(0.1, 0.13, 0.1, energy, 0, -length * 0.3, 0.22));
      }
      break;
    }
    default:
  }
  if (tier >= 2 && kind !== 'pistol' && kind !== 'rifle' && kind !== 'shotgun') {
    for (const side of [-1, 1]) g.add(rounded(0.035, 0.075, fusion ? 0.95 : 0.7, energy, side * 0.09, 0.055, 0.53));
  }
  if (tier >= 2) {
    for (const side of [-1, 1]) {
      if (WEAPONS[w.kind].kind === 'gun') {
        const stabilizer = rounded(0.14, 0.46, 0.055, dark, side * 0.28, -0.42, -0.08);
        stabilizer.rotation.z = side * 0.25; g.add(stabilizer);
        const rune = rounded(0.07, 0.34, 0.025, energy, side * 0.29, -0.42, -0.115);
        rune.rotation.z = side * 0.25; g.add(rune);
      } else {
        const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), energy);
        core.position.set(side * 0.17, 0, 0.44); g.add(core);
      }
    }
  }
  if (tier >= 3) for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 5), steel);
    if (WEAPONS[w.kind].kind === 'gun') { fin.position.set(side * 0.2, -0.45, 0.17); fin.rotation.z = -side * 0.6; }
    else { fin.position.set(side * 0.2, 0, 0.73); fin.rotation.z = -side * Math.PI / 2; }
    g.add(fin);
  }
  batchMeshes(g);
  g.scale.setScalar(1 + level * 0.015);
  if (tier >= 3 || fusion) {
    const aura = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 8, 32), new THREE.MeshBasicMaterial({ color: energyColor, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }));
    if (['pistol', 'rifle', 'shotgun'].includes(kind)) { aura.position.y = -0.4; aura.rotation.x = Math.PI / 2; }
    else aura.position.z = 0.75;
    g.add(aura);
    g.userData.aura = aura;
  }
  return g;
}

export function makeBlob(radius = 0.55) {
  const geo = new THREE.CircleGeometry(radius, 20);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: modelStyle === 'classic' ? 0x000000 : 0x152333, map: modelStyle === 'classic' ? null : radialTexture(),
    transparent: true, opacity: modelStyle === 'classic' ? 0.45 : 0.38, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 2;
  return m;
}

export function makeChest() {
  const g = new THREE.Group();
  const wood = lambert(0x7668cc);
  const gold = lambert(0xffd44d, 0x292000);
  g.add(rounded(1.5, 0.8, 1.0, wood, 0, 0.4, 0));
  g.add(box(1.56, 0.14, 1.06, gold, 0, 0.12, 0));
  g.add(box(1.56, 0.14, 1.06, gold, 0, 0.72, 0));
  const lid = new THREE.Group();
  lid.position.set(0, 0.8, -0.5);
  lid.add(rounded(1.5, 0.4, 1.0, wood, 0, 0.2, 0.5));
  lid.add(box(1.56, 0.12, 1.06, gold, 0, 0.36, 0.5));
  g.add(lid);
  g.add(rounded(0.28, 0.3, 0.12, gold, 0, 0.65, 0.54));
  g.add(sphere(0.07, 0.07, 0.04, lambert(0x5b408a), 0, 0.67, 0.615));
  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 1.1, 8, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  glow.position.y = 4;
  g.add(glow);
  return { group: g, lid, glow };
}

export function makeForge() {
  const g = new THREE.Group();
  const iron = lambert(0x597081);
  const steel = lambert(0xb2c8d2);
  const teal = lambert(0x43bba7);
  const gold = lambert(0xffd258);
  g.add(rounded(1.35, 0.16, 1.05, iron, 0, 0.08, 0));
  g.add(rounded(0.9, 0.6, 0.7, teal, 0, 0.42, 0));
  g.add(rounded(1.4, 0.3, 0.65, steel, 0, 0.8, 0));
  g.add(rounded(0.5, 0.18, 0.32, steel, 0.8, 0.8, 0));
  g.add(rounded(0.32, 0.16, 0.07, gold, 0, 0.43, 0.39));
  const fire = sphere(0.45, 0.9, 0.45, lambert(0xffaa41, 0xff571e), 1.9, 0.35, 0);
  g.add(fire);
  g.add(rounded(1.05, 0.3, 1.05, iron, 1.9, 0.15, 0));
  g.add(rounded(1.15, 0.14, 1.15, teal, 1.9, 0.04, 0));
  g.add(rounded(0.08, 0.75, 0.09, gold, -0.42, 1.12, 0));
  g.add(rounded(0.42, 0.24, 0.26, steel, -0.42, 1.48, 0));
  for (const side of [-1, 1]) g.add(cyl(0.06, 0.45, steel, 1.9 + side * 0.37, 0.5, 0));
  return { group: g, fire };
}

export function makeWaterStation() {
  const g = new THREE.Group();
  const blue = lambert(0x4daed5, 0x06242d);
  const white = lambert(0xe4f5f1);
  const dark = lambert(0x4b697b);
  const gold = lambert(0xffcc51);
  g.add(rounded(1.3, 0.17, 1.12, dark, 0, 0.085, 0));
  g.add(cyl(0.51, 1.25, blue, 0, 0.79, 0));
  for (const y of [0.24, 1.34]) g.add(cyl(0.57, 0.15, white, 0, y, 0));
  g.add(sphere(0.48, 0.22, 0.48, white, 0, 1.45, 0));
  g.add(rounded(0.22, 0.2, 0.55, dark, 0, 0.95, 0.63));
  g.add(rounded(0.28, 0.27, 0.16, gold, 0, 0.95, 0.91));
  g.add(rounded(0.18, 0.56, 0.08, white, 0.57, 0.79, 0.03));
  g.add(rounded(0.2, 0.26, 0.1, gold, 0.57, 0.65, 0.03));
  for (const x of [-0.19, 0.19]) g.add(sphere(0.065, 0.065, 0.015, white, x, 1.1, 0.48));
  return g;
}

export function makeFlag() {
  const g = new THREE.Group();
  g.add(cyl(0.05, 2.4, lambert(0xdddddd), 0, 1.2, 0));
  g.add(box(0.8, 0.5, 0.04, lambert(0x2ee06a, 0x0a5a22), 0.42, 2.1, 0));
  return g;
}

export function makeHealPickup() {
  const g = new THREE.Group();
  const m = lambert(0x3bff7a, 0x0f9a3a);
  g.add(box(0.5, 0.16, 0.16, m));
  g.add(box(0.16, 0.5, 0.16, m));
  return g;
}

export function makeWaterPickup() {
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.34), lambert(0x4aa8ff, 0x1a5ac0));
  m.scale.y = 1.4;
  return m;
}

export function makeCoin() {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.085, 20), lambert(0xffcc36, 0x423000));
  m.rotation.x = Math.PI / 2;
  const g = new THREE.Group();
  g.add(m);
  g.add(rounded(0.07, 0.29, 0.04, lambert(0xfff4b6), 0, 0, 0.055));
  return g;
}
