import * as THREE from 'three';

// One tiny radial texture shared by light halos and soft contact shadows.
let radial;
export function radialTexture() {
  if (radial) return radial;
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const r = Math.hypot((x + 0.5) / size * 2 - 1, (y + 0.5) / size * 2 - 1);
    const at = (y * size + x) * 4;
    data[at] = data[at + 1] = data[at + 2] = 255;
    data[at + 3] = Math.round(Math.max(0, 1 - r * r) ** 3 * 255);
  }
  radial = new THREE.DataTexture(data, size, size);
  radial.magFilter = radial.minFilter = THREE.LinearFilter;
  radial.userData.shared = true;
  radial.needsUpdate = true;
  return radial;
}

export function makeGlow(color, size = 2, opacity = 0.3) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  sprite.scale.set(size, size, 1);
  return sprite;
}
