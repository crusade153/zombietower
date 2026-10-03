import * as THREE from 'three';
import { LAVA } from '../config/balance.js';

const VERT = /* glsl */ `
uniform float uTime;
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  w.y += sin(w.x * 0.35 + uTime * 1.2) * cos(w.z * 0.3 + uTime) * 0.08;
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uFrozen;
varying vec3 vWorld;
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
  vec2 p = vWorld.xz * 0.07;
  float t = uTime * 0.12;
  float n1 = fbm(p + vec2(t, t * 0.6));
  float n2 = fbm(p * 1.9 + vec2(-t * 0.8, t) + n1 * 1.5);
  float veins = smoothstep(0.4, 0.56, n2);
  vec3 deep = vec3(0.28, 0.035, 0.045);
  vec3 hot = vec3(1.0, 0.62, 0.12);
  vec3 col = mix(deep, hot, veins);
  float crust = smoothstep(0.55, 0.8, noise(p * 6.0 + t));
  col = mix(col, vec3(0.08, 0.055, 0.075), crust * 0.65);
  float cracks = 1.0 - smoothstep(0.025, 0.09, abs(n2 - 0.5));
  col += vec3(1.0, 0.42, 0.035) * cracks * 0.65;
  col += vec3(0.25, 0.08, 0.0) * (0.5 + 0.5 * sin(uTime * 2.0 + n2 * 8.0)) * 0.25;
  vec3 obs = mix(vec3(0.2, 0.65, 0.8), vec3(0.69, 0.93, 1.0), noise(vWorld.xz * 0.6));
  col = mix(col, obs, uFrozen);
  float dist = length(vWorld - cameraPosition);
  float f = smoothstep(90.0, 320.0, dist);
  col = mix(col, vec3(0.65, 0.63, 0.62), f);
  gl_FragColor = vec4(col, 1.0);
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
    this.uniforms = { uTime: { value: 0 }, uFrozen: { value: 0 } };
    const geo = new THREE.PlaneGeometry(1400, 1400, 96, 96);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms }));
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.mesh.position.y = this.y;
  }

  get frozen() { return this.state === 'frozen'; }

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
