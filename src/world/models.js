import * as THREE from 'three';

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 16);
const matCache = new Map();

export function lambert(color, emissive = 0x000000) {
  const key = `${color}-${emissive}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, emissive });
    matCache.set(key, m);
  }
  return m;
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

/**
 * 로블록스풍 박스 인간. 키 ≈ 1.8 (scale 곱).
 * 앞(얼굴)은 +Z 방향.
 */
export function makeHumanoid({
  skin = 0xffd2a8, shirt = 0x3b82f6, pants = 0x2b3a67, hair = 0x3a2a1a,
  scale = 1, zombie = false, ownMaterials = false,
} = {}) {
  const mk = (c, e) => (ownMaterials ? new THREE.MeshLambertMaterial({ color: c, emissive: e || 0 }) : lambert(c, e));
  const mats = { skin: mk(skin), shirt: mk(shirt), pants: mk(pants), hair: mk(hair) };
  const eyeMat = zombie ? mk(0xff2a2a, 0xaa0000) : mk(0x1a1a1a);
  const root = new THREE.Group();
  const model = new THREE.Group();
  model.scale.setScalar(scale);
  root.add(model);

  const torso = box(0.7, 0.7, 0.36, mats.shirt, 0, 1.05, 0);
  const head = new THREE.Group();
  head.position.set(0, 1.61, 0);
  head.add(box(0.5, 0.42, 0.5, mats.skin));
  if (!zombie) head.add(box(0.54, 0.14, 0.54, mats.hair, 0, 0.19, -0.01));
  else head.add(box(0.52, 0.08, 0.52, mk(0x2a3a22), 0, 0.2, -0.02));
  head.add(box(0.09, 0.09, 0.03, eyeMat, -0.12, 0.04, 0.255));
  head.add(box(0.09, 0.09, 0.03, eyeMat, 0.12, 0.04, 0.255));
  head.add(box(0.2, 0.04, 0.03, eyeMat, 0, -0.1, 0.255));

  const makeArm = (side) => {
    const g = new THREE.Group();
    g.position.set(side * 0.46, 1.38, 0);
    g.add(box(0.22, 0.46, 0.22, mats.shirt, 0, -0.23, 0));
    g.add(box(0.22, 0.24, 0.22, mats.skin, 0, -0.58, 0));
    return g;
  };
  const makeLeg = (side) => {
    const g = new THREE.Group();
    g.position.set(side * 0.17, 0.7, 0);
    g.add(box(0.3, 0.7, 0.3, mats.pants, 0, -0.35, 0));
    return g;
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);
  const legL = makeLeg(-1);
  const legR = makeLeg(1);
  const hand = new THREE.Group();
  hand.position.set(0, -0.68, 0);
  armR.add(hand);
  model.add(torso, head, armL, armR, legL, legR);
  return { root, model, parts: { head, torso, armL, armR, legL, legR, hand }, materials: Object.values(mats), eyeMat };
}

/** 무기 모델. 근접: +Z로 뻗음(팔을 앞으로 들면 위를 향함). 총: −Y로 뻗음(팔을 앞으로 들면 정면). */
export function makeWeaponMesh(kind, accent = 0xc9ced6) {
  const g = new THREE.Group();
  const wood = lambert(0xb5833c);
  const dark = lambert(0x2a2a2e);
  const steel = lambert(0xaab3c0);
  const acc = lambert(accent, accent);
  switch (kind) {
    case 'bat':
      g.add(box(0.07, 0.07, 0.32, wood, 0, 0, 0.12));
      g.add(box(0.15, 0.15, 0.75, wood, 0, 0, 0.62));
      g.add(box(0.17, 0.17, 0.06, acc, 0, 0, 0.3));
      break;
    case 'axe':
      g.add(box(0.07, 0.07, 1.0, wood, 0, 0, 0.45));
      g.add(box(0.06, 0.36, 0.3, steel, 0, 0.0, 0.88));
      g.add(box(0.07, 0.4, 0.06, acc, 0, 0.0, 1.05));
      break;
    case 'whip':
      g.add(box(0.07, 0.07, 0.3, dark, 0, 0, 0.1));
      g.add(box(0.03, 0.03, 0.55, lambert(0x6a4020), 0, 0.02, 0.5));
      g.add(box(0.07, 0.07, 0.07, acc, 0, 0.02, 0.8));
      break;
    case 'pistol':
      g.add(box(0.08, 0.34, 0.12, dark, 0, -0.17, 0.02));
      g.add(box(0.07, 0.1, 0.16, wood, 0, -0.02, -0.06));
      g.add(box(0.09, 0.05, 0.05, acc, 0, -0.3, 0.09));
      break;
    case 'rifle':
      g.add(box(0.09, 0.8, 0.12, dark, 0, -0.4, 0.02));
      g.add(box(0.08, 0.28, 0.1, wood, 0, 0.12, 0.0));
      g.add(box(0.07, 0.16, 0.2, dark, 0, -0.35, -0.1));
      g.add(box(0.1, 0.05, 0.05, acc, 0, -0.65, 0.09));
      break;
    case 'shotgun':
      g.add(box(0.1, 0.8, 0.12, dark, 0, -0.4, 0.02));
      g.add(box(0.12, 0.26, 0.09, wood, 0, -0.42, -0.1));
      g.add(box(0.09, 0.3, 0.1, wood, 0, 0.12, -0.02));
      g.add(box(0.11, 0.05, 0.05, acc, 0, -0.76, 0.09));
      break;
    default:
  }
  return g;
}

export function makeBlob(radius = 0.55) {
  const geo = new THREE.CircleGeometry(radius, 20);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 2;
  return m;
}

export function makeChest() {
  const g = new THREE.Group();
  const wood = lambert(0x8a5a2b);
  const gold = lambert(0xe0a82a, 0x3a2a00);
  g.add(box(1.5, 0.8, 1.0, wood, 0, 0.4, 0));
  g.add(box(1.56, 0.14, 1.06, gold, 0, 0.12, 0));
  g.add(box(1.56, 0.14, 1.06, gold, 0, 0.72, 0));
  const lid = new THREE.Group();
  lid.position.set(0, 0.8, -0.5);
  lid.add(box(1.5, 0.4, 1.0, wood, 0, 0.2, 0.5));
  lid.add(box(1.56, 0.12, 1.06, gold, 0, 0.36, 0.5));
  g.add(lid);
  g.add(box(0.22, 0.3, 0.1, gold, 0, 0.78, 0.52));
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
  const iron = lambert(0x3a3c44);
  const steel = lambert(0x8a93a3);
  g.add(box(0.9, 0.6, 0.7, iron, 0, 0.3, 0));
  g.add(box(1.4, 0.3, 0.6, steel, 0, 0.75, 0));
  g.add(box(0.5, 0.18, 0.3, steel, 0.85, 0.75, 0));
  const fire = box(0.8, 0.5, 0.8, lambert(0xff7a1a, 0xff5500), 1.9, 0.25, 0);
  g.add(fire);
  g.add(box(1.0, 0.1, 1.0, iron, 1.9, 0.05, 0));
  return { group: g, fire };
}

export function makeWaterStation() {
  const g = new THREE.Group();
  g.add(cyl(0.6, 1.4, lambert(0x2a8cff, 0x0a3a7a), 0, 0.7, 0));
  g.add(cyl(0.65, 0.12, lambert(0xcfe3ff), 0, 1.4, 0));
  g.add(box(0.2, 0.2, 0.8, lambert(0xcfe3ff), 0, 1.0, 0.7));
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
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 14), lambert(0xffcf3a, 0x8a5a00));
  m.rotation.x = Math.PI / 2;
  const g = new THREE.Group();
  g.add(m);
  return g;
}
