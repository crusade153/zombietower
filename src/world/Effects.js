import * as THREE from 'three';

const boxGeo = new THREE.OctahedronGeometry(0.7);
const basicCache = new Map();
function basic(color, opacity = 1) {
  const key = `${color}-${opacity}`;
  let m = basicCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
    basicCache.set(key, m);
  }
  return m;
}

const fanCache = new Map();
function fanGeo(arcDeg) {
  let g = fanCache.get(arcDeg);
  if (!g) {
    const a = (arcDeg * Math.PI) / 180;
    g = new THREE.CircleGeometry(1, 24, -Math.PI / 2 - a / 2, a);
    g.rotateX(-Math.PI / 2);
    fanCache.set(arcDeg, g);
  }
  return g;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];
    this.free = [];
    this.timed = []; // 슬래시/트레이서/링: {mesh, t, life, kind, ...}
    this.ringGeo = new THREE.RingGeometry(0.92, 1, 40);
    this.ringGeo.rotateX(-Math.PI / 2);
  }

  confetti(x, y, z) {
    for (const color of [0xffd75d, 0xff7d9c, 0x76e0c3, 0xbfa6f0]) {
      this.burst(x, y, z, color, 9, 6, 1.4, 0.15);
    }
  }

  burst(x, y, z, color, count = 8, speed = 4, life = 0.5, size = 0.14) {
    for (let i = 0; i < count; i++) {
      let p = this.free.pop();
      if (!p) {
        p = { mesh: new THREE.Mesh(boxGeo, basic(color)), vx: 0, vy: 0, vz: 0, t: 0, life: 0 };
        this.scene.add(p.mesh);
      }
      p.mesh.material = basic(color);
      p.mesh.visible = true;
      p.mesh.position.set(x, y, z);
      const s = size * (0.6 + Math.random() * 0.8);
      p.mesh.scale.set(s, s, s);
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 0.9 + 0.1;
      p.vx = Math.cos(a) * speed * e;
      p.vz = Math.sin(a) * speed * e;
      p.vy = (Math.random() * 0.8 + 0.3) * speed;
      p.t = 0;
      p.life = life * (0.6 + Math.random() * 0.6);
      this.parts.push(p);
    }
  }

  /** 근접 공격 부채꼴 */
  slash(x, y, z, yaw, range, arcDeg, color = 0xfff2b0) {
    const mesh = new THREE.Mesh(fanGeo(arcDeg), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
    mesh.position.set(x, y + 0.9, z);
    mesh.rotation.y = yaw;
    mesh.scale.set(range, 1, range);
    this.scene.add(mesh);
    this.timed.push({ mesh, t: 0, life: 0.2, kind: 'fade', base: 0.45 });
    const arc = (arcDeg * Math.PI) / 180;
    const edge = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32, 1, -Math.PI / 2 - arc / 2, arc).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    edge.position.copy(mesh.position);
    edge.rotation.copy(mesh.rotation);
    edge.scale.copy(mesh.scale);
    this.scene.add(edge);
    this.timed.push({ mesh: edge, t: 0, life: 0.22, kind: 'fade', base: 0.9, ownGeometry: true });
  }

  /** 직선(채찍/총알 궤적) */
  line(ax, ay, az, bx, by, bz, color = 0xffe38a, width = 0.05, life = 0.08) {
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    if (len < 0.01) return;
    const mesh = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
    mesh.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    mesh.scale.set(width, width, len);
    mesh.lookAt(bx, by, bz);
    this.scene.add(mesh);
    this.timed.push({ mesh, t: 0, life, kind: 'fade', base: 0.9 });
  }

  /** 바닥 링 (보스 예고 / 충격파) */
  ring(x, y, z, radius, color = 0xff3a2a, life = 0.8, grow = false) {
    const mesh = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
    mesh.position.set(x, y + 0.05, z);
    mesh.scale.set(grow ? 0.2 : radius, 1, grow ? 0.2 : radius);
    this.scene.add(mesh);
    this.timed.push({ mesh, t: 0, life, kind: grow ? 'grow' : 'fade', base: 0.7, radius });
  }

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.t += dt;
      if (p.t >= p.life) {
        p.mesh.visible = false;
        this.free.push(p);
        this.parts.splice(i, 1);
        continue;
      }
      p.vy -= 14 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += dt * 4;
      p.mesh.rotation.z += dt * 3;
    }
    for (let i = this.timed.length - 1; i >= 0; i--) {
      const f = this.timed[i];
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) {
        this.scene.remove(f.mesh);
        f.mesh.material.dispose();
        if (f.ownGeometry) f.mesh.geometry.dispose();
        this.timed.splice(i, 1);
        continue;
      }
      if (f.kind === 'grow') {
        const r = f.radius * Math.min(1, k * 1.5);
        f.mesh.scale.set(r, 1, r);
      }
      f.mesh.material.opacity = f.base * (1 - k);
    }
  }
}
