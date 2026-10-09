import * as THREE from 'three';
import { LAVA } from '../config/balance.js';

const VERT = /* glsl */ `
uniform float uTime;
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uFrozen;
uniform float uClassic;
varying vec3 vWorld;
#include <fog_pars_fragment>
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = hash(i); float b = hash(i + vec2(1.0, 0.0)); float c = hash(i + vec2(0.0, 1.0)); float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}
void main() {
  vec3 col;
  if (uClassic > 0.5) {
    float tile = hash(floor(vWorld.xz * 0.4));
    vec3 block = mix(vec3(1.0, 0.24, 0.035), vec3(1.0, 0.55, 0.12), step(0.55, tile));
    col = mix(block, vec3(0.45, 0.85, 1.0), uFrozen);
  } else {
  vec2 p = vWorld.xz * 0.14;
  float t = uTime * 0.12;
  float n1 = fbm(p + vec2(t, t * 0.6));
  float n2 = fbm(p * 1.9 + vec2(-t * 0.8, t) + n1 * 1.5);
  float veins = smoothstep(0.42, 0.53, n2);
  vec3 deep = vec3(0.035, 0.004, 0.009);
  vec3 hot = vec3(2.0, 0.3, 0.015);
  col = mix(deep, hot, veins);
  float crust = smoothstep(0.55, 0.8, noise(p * 6.0 + t));
  col = mix(col, vec3(0.08, 0.055, 0.075), crust * 0.65);
  float cracks = 1.0 - smoothstep(0.008, 0.035, abs(n2 - 0.5));
  col += vec3(1.0, 0.42, 0.035) * cracks * 0.65;
  col += vec3(0.25, 0.08, 0.0) * (0.5 + 0.5 * sin(uTime * 2.0 + n2 * 8.0)) * 0.25;
  // Fine moving currents and white-hot seams add detail without tessellation.
  float ripple = sin(vWorld.x * 1.2 + vWorld.z * 0.8 + uTime * 1.6 + n1 * 9.0);
  col += vec3(1.0, 0.18, 0.025) * pow(max(0.0, ripple), 12.0) * cracks * 0.35;
  col *= 1.6;
  float ice = noise(vWorld.xz * 0.6);
  float iceCrack = 1.0 - smoothstep(0.015, 0.045, abs(ice - 0.5));
  vec3 obs = mix(vec3(0.12, 0.4, 0.57), vec3(0.47, 0.78, 0.88), ice);
  obs += vec3(0.4, 0.65, 0.8) * iceCrack;
  vec3 viewDir = normalize(cameraPosition - vWorld);
  obs += vec3(0.18, 0.3, 0.38) * pow(1.0 - abs(viewDir.y), 3.0);
  col = mix(col, obs, uFrozen);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export class Lava {
  constructor(scene) {
    this.y = -14;
    this.targetY = -14;
    this.state = 'idle'; // idle | rising | frozen
    this.delay = 0;
    this.speed = 0.5;
    this.frozenT = 0;
    this.time = 0;
    // 물대포로 굳었을 때 밟을 수 있는 바닥
    this.floor = {
      type: 'lavafloor', solid: false, moved: false, dx: 0, dy: 0, dz: 0, x: 0, z: 0,
      minX: -700, maxX: 700, minZ: -700, maxZ: 700, minY: -5, maxY: 0,
    };
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uFrozen: { value: 0 }, uClassic: { value: 0 } }]);
    // Surface motion is shaded per pixel; a flat plane matches the collision floor.
    const geo = new THREE.PlaneGeometry(1400, 1400);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, fog: true }));
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.mesh.position.y = this.y;
  }

  get frozen() { return this.state === 'frozen'; }

  setGraphicsStyle(style) {
    this.uniforms.uClassic.value = style === 'classic' ? 1 : 0;
  }

  /** 안전구역: 용암을 y까지 서서히 내리고 대기 */
  setIdle(y) {
    this.state = 'idle';
    this.targetY = y;
  }

  /** 스테이지 시작: speed(m/s) 로 상승 시작, delay초 후 */
  begin(speed, delay = LAVA.startDelay) {
    this.state = 'rising';
    this.speed = speed;
    this.delay = delay;
  }

  /** 사망 후 부활: 즉시 y로 이동, freezeSec 동안 정지했다가 다시 상승 */
  reset(y, freezeSec = LAVA.deathFreeze) {
    this.y = y;
    this.targetY = y;
    this.state = 'rising';
    this.delay = freezeSec;
  }

  /** 물대포 */
  freeze(duration = LAVA.waterFreeze) {
    if (this.state === 'idle') return false;
    this.state = 'frozen';
    this.frozenT = duration;
    return true;
  }

  update(dt, playerY) {
    this.time += dt;
    if (this.state === 'idle') {
      if (this.y > this.targetY) this.y = Math.max(this.targetY, this.y - 7 * dt);
      else if (this.y < this.targetY) this.y = Math.min(this.targetY, this.y + 7 * dt);
    } else if (this.state === 'rising') {
      if (this.delay > 0) this.delay -= dt;
      else {
        const gap = playerY - this.y;
        const mult = gap > LAVA.catchUpGap ? LAVA.catchUpMult : 1;
        this.y += this.speed * mult * dt;
      }
    } else if (this.state === 'frozen') {
      this.frozenT -= dt;
      if (this.frozenT <= 0) {
        this.state = 'rising';
        this.delay = 0;
      }
    }
    this.mesh.position.y = this.y;
    this.floor.maxY = this.y;
    this.floor.minY = this.y - 5;
    this.floor.solid = this.state === 'frozen';
    const blink = this.state === 'frozen' && this.frozenT < LAVA.waterBlink;
    this.uniforms.uTime.value = this.time;
    this.uniforms.uFrozen.value = this.state === 'frozen' ? (blink ? (Math.sin(this.time * 22) > 0 ? 1 : 0.15) : 1) : 0;
  }

  /** 굳은 상태가 곧 풀리는가(경고용) */
  get meltingSoon() { return this.state === 'frozen' && this.frozenT < LAVA.waterBlink; }
}
