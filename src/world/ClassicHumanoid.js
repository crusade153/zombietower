import * as THREE from 'three';

// Original block character from the first playable version (a2e9913).
export function makeClassicHumanoid({
  skin = 0xffd2a8, shirt = 0x3b82f6, pants = 0x2b3a67, hair = 0x3a2a1a,
  scale = 1, zombie = false, ownMaterials = false,
} = {}, { box, lambert }) {
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
