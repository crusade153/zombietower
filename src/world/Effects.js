import * as THREE from 'three';

const sparkGeo = new THREE.OctahedronGeometry(0.7);
const lineGeo = new THREE.BoxGeometry(1, 1, 1);
lineGeo.userData.shared = true;
const fanCache = new Map();
function fanGeo(arcDeg, edge = false) {
  const key = `${arcDeg}-${edge}`;
  if (!fanCache.has(key)) {
    const a = arcDeg * Math.PI / 180;
    const g = edge ? new THREE.RingGeometry(0.88, 1, 32, 1, -Math.PI / 2 - a / 2, a)
      : new THREE.CircleGeometry(1, 24, -Math.PI / 2 - a / 2, a);
    g.rotateX(-Math.PI / 2);
    g.userData.shared = true;
    fanCache.set(key, g);
  }
  return fanCache.get(key);
}

function effectMaterial(color, opacity, side = THREE.FrontSide) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side,
    blending: THREE.AdditiveBlending, toneMapped: false });
}

export class Effects {
  constructor(scene, { capacity = 512 } = {}) {
    this.scene = scene;
    this.capacity = capacity;
    this.parts = [];
    this.free = [];
    this.timed = [];
    this.ringGeo = new THREE.RingGeometry(0.94, 1, 40).rotateX(-Math.PI / 2);
    const geometry = sparkGeo.clone();
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.alpha.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('particleAlpha', this.alpha);
    const material = effectMaterial(0xffffff, 1);
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float particleAlpha;\nvarying float vParticleAlpha;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvParticleAlpha = particleAlpha;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vParticleAlpha;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vParticleAlpha;');
    };
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    // Moving effects can cover several platforms; avoid stale instance bounds.
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.scene.add(this.mesh);
    this.dummy = new THREE.Object3D();
    this.color = new THREE.Color();
  }

  confetti(x, y, z) {
    for (const color of [0xffd75d, 0xff7d9c, 0x76e0c3, 0xbfa6f0]) this.burst(x, y, z, color, 9, 6, 1.4, 0.15);
  }

  burst(x, y, z, color, count = 8, speed = 4, life = 0.5, size = 0.14) {
    const available = Math.min(count, this.capacity - this.parts.length);
    for (let i = 0; i < available; i++) {
      const p = this.free.pop() || {};
      p.x = x; p.y = y; p.z = z;
      p.size = size * (0.6 + Math.random() * 0.8);
      p.color = color;
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

  _add(mesh, life, base, radius = 0) {
    if (this.timed.length >= 128) this._release(this.timed.shift());
    this.scene.add(mesh);
    this.timed.push({ mesh, t: 0, life, base, radius });
  }

  _release(f) {
    f.mesh.removeFromParent();
    f.mesh.material.dispose();
  }

  /** Broad translucent sweep and a sharp outer edge. */
  slash(x, y, z, yaw, range, arcDeg, color = 0xfff2b0) {
    for (const edge of [false, true]) {
      const opacity = edge ? 0.85 : 0.22;
      const mesh = new THREE.Mesh(fanGeo(arcDeg, edge), effectMaterial(edge ? 0xffffff : color, opacity, THREE.DoubleSide));
      mesh.position.set(x, y + 0.9, z);
      mesh.rotation.y = yaw;
      mesh.scale.set(range, 1, range);
      this._add(mesh, edge ? 0.22 : 0.2, opacity);
    }
  }

  line(ax, ay, az, bx, by, bz, color = 0xffe38a, width = 0.05, life = 0.08) {
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    if (len < 0.01) return;
    const mesh = new THREE.Mesh(lineGeo, effectMaterial(color, 0.9));
    mesh.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    mesh.scale.set(width, width, len);
    mesh.lookAt(bx, by, bz);
    this._add(mesh, life, 0.9);
  }

  ring(x, y, z, radius, color = 0xff3a2a, life = 0.8, grow = false) {
    const mesh = new THREE.Mesh(this.ringGeo, effectMaterial(color, 0.7, THREE.DoubleSide));
    mesh.position.set(x, y + 0.05, z);
    mesh.scale.set(grow ? 0.2 : radius, 1, grow ? 0.2 : radius);
    this._add(mesh, life, 0.7, grow ? radius : 0);
  }

  update(dt) {
    let write = 0;
    for (const p of this.parts) {
      p.t += dt;
      if (p.t >= p.life) { this.free.push(p); continue; }
      p.vy -= 14 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = p.t / p.life;
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.rotation.set(p.t * 4, 0, p.t * 3);
      this.dummy.scale.setScalar(p.size * (1 - k * 0.55));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(write, this.dummy.matrix);
      this.mesh.setColorAt(write, this.color.set(p.color));
      this.alpha.setX(write, (1 - k) ** 2);
      this.parts[write++] = p;
    }
    this.parts.length = write;
    this.mesh.count = write;
    this.mesh.visible = write > 0;
    if (write) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor.needsUpdate = true;
      this.alpha.needsUpdate = true;
    }
    for (let i = this.timed.length - 1; i >= 0; i--) {
      const f = this.timed[i];
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) { this._release(f); this.timed.splice(i, 1); continue; }
      if (f.radius) {
        const r = 0.2 + (f.radius - 0.2) * (1 - (1 - k) ** 3);
        f.mesh.scale.set(r, 1, r);
      }
      f.mesh.material.opacity = f.base * (1 - k) ** 2;
    }
  }

  dispose() {
    for (const f of this.timed) this._release(f);
    this.timed.length = this.parts.length = this.free.length = 0;
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.ringGeo.dispose();
  }
}
