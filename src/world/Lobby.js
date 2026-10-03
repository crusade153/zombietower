import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rounded, cyl, sphere, lambert, makeHumanoid, makeWeaponMesh, makeCoin, makeChest } from './models.js';

// The menu uses the same character and prop assets as the playable world.
export class Lobby {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xc8eeec);
    this.scene.fog = new THREE.Fog(0xc8eeec, 28, 70);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6f8ba0, 2.5));
    const sun = new THREE.DirectionalLight(0xfff1df, 3.2);
    sun.position.set(-8, 18, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 15, bottom: -10, near: 1, far: 55 });
    sun.shadow.normalBias = 0.06;
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x8adeff, 1.8);
    rim.position.set(8, 8, -10);
    this.scene.add(rim);
    this.set = new THREE.Group();
    this.scene.add(this.set);
    this.coins = [];
    this.floaters = [];
    this._build();
  }

  _build() {
    const g = this.set;
    const stone = lambert(0x8b9eb6);
    const mint = lambert(0x61d9c6);
    const ivory = lambert(0xeef5f3);
    const coral = lambert(0xff777c);
    const gold = lambert(0xffd15a);
    const violet = lambert(0xa599db);
    const dark = lambert(0x52617b);
    const island = rounded(12, 1.5, 9, stone, 0, -1.45, 0);
    island.receiveShadow = true;
    g.add(island);
    const floor = rounded(11.8, 0.22, 8.8, ivory, 0, -0.61, 0);
    floor.receiveShadow = true;
    g.add(floor);
    g.add(rounded(12.1, 0.13, 9.1, mint, 0, -0.86, 0));
    // Glowing lava below the suspended island.
    const lava = new THREE.Mesh(new THREE.CircleGeometry(19, 64), new THREE.MeshBasicMaterial({ color: 0xff7b69 }));
    lava.rotation.x = -Math.PI / 2;
    lava.position.y = -3.6;
    g.add(lava);
    for (let i = 0; i < 8; i++) {
      const a = i * 0.79;
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), stone);
      rock.position.set(Math.cos(a) * 5.6, -2.0, Math.sin(a) * 4.1);
      rock.scale.set(1.1, 1.5 + (i % 3) * 0.3, 1);
      g.add(rock);
    }
    const tower = new THREE.Group();
    tower.position.set(1.6, -0.5, -2.0);
    g.add(tower);
    tower.add(cyl(1.55, 10.8, ivory, 0, 5.1, 0));
    tower.add(cyl(1.75, 0.5, dark, 0, 0.25, 0));
    const colors = [mint, coral, violet, gold, mint];
    for (let k = 0; k < 5; k++) {
      const y = 1 + k * 2.05;
      tower.add(cyl(1.69, 0.24, colors[k], 0, y, 0));
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        const window = rounded(0.42, 0.78, 0.12, dark, Math.sin(a) * 1.53, y + 0.83, Math.cos(a) * 1.53);
        window.rotation.y = a;
        tower.add(window);
        const pane = rounded(0.27, 0.55, 0.14, lambert(0xa4f1e4, 0x24423b), Math.sin(a) * 1.57, y + 0.83, Math.cos(a) * 1.57);
        pane.rotation.y = a;
        tower.add(pane);
      }
    }
    tower.add(cyl(1.85, 0.36, violet, 0, 10.65, 0));
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5;
      tower.add(rounded(0.5, 0.7, 0.5, ivory, Math.sin(a) * 1.6, 11.1, Math.cos(a) * 1.6));
    }
    tower.add(cyl(0.06, 2.4, dark, 0, 11.9, 0));
    this.flag = rounded(1.2, 0.65, 0.06, coral, 0.6, 12.7, 0);
    tower.add(this.flag);
    for (let i = 0; i < 14; i++) {
      const a = -0.9 + i * 0.49;
      const x = 1.6 + Math.sin(a) * 2.55;
      const z = -2 + Math.cos(a) * 2.55;
      const y = 0.15 + i * 0.7;
      const step = rounded(1.7, 0.33, 1.45, colors[i % colors.length], x, y, z);
      step.castShadow = true;
      step.receiveShadow = true;
      g.add(step);
      g.add(rounded(1.56, 0.075, 1.31, ivory, x, y + 0.19, z));
      if (i % 2 === 0) {
        const coin = makeCoin();
        coin.position.set(x, y + 0.8, z);
        g.add(coin);
        this.coins.push({ mesh: coin, y: coin.position.y, phase: i });
      }
    }
    this.hero = makeHumanoid({ scale: 2.05 });
    this.hero.root.position.set(-2.15, -0.49, 2.0);
    this.hero.root.rotation.y = 0.28;
    this.hero.parts.armR.rotation.x = -1.15;
    this.hero.parts.hand.add(makeWeaponMesh('bat', 0xffd054));
    g.add(this.hero.root);
    this.zombies = [];
    for (let i = 0; i < 2; i++) {
      const z = makeHumanoid({ zombie: true, skin: i ? 0xa9df7b : 0x92d479, shirt: i ? 0x5bbbad : 0xa48bda, scale: i ? 1.6 : 2.35, variant: i ? 'runner' : 'walker' });
      z.root.position.set(i ? 4.9 : 1.1, -0.49, i ? 0.7 : 3.1);
      z.root.rotation.y = i ? -0.5 : -0.2;
      z.parts.armL.rotation.x = -0.9;
      z.parts.armR.rotation.x = -1.2;
      g.add(z.root);
      this.zombies.push(z);
    }
    const chest = makeChest();
    chest.group.position.set(-4.2, -0.49, -0.8);
    chest.group.rotation.y = 0.5;
    g.add(chest.group);
    for (const [x, z] of [[-5, 3.2], [5, 3.2], [-5, -3.2], [5, -3.2]]) {
      g.add(cyl(0.17, 1.1, dark, x, 0, z));
      g.add(sphere(0.25, 0.25, 0.25, gold, x, 0.6, z));
    }
    for (let i = 0; i < 5; i++) {
      const cloud = new THREE.Group();
      for (let j = 0; j < 3; j++) cloud.add(sphere(1.5, 0.75 + j * 0.15, 0.85, lambert(0xf7fffc), (j - 1) * 1.3, 0, 0));
      cloud.position.set(-12 + i * 6.5, 4 + (i % 3) * 3, -9 - (i % 2) * 4);
      g.add(cloud);
      this.floaters.push({ mesh: cloud, y: cloud.position.y, phase: i });
    }
    this._batchScenery();
  }

  _batchScenery() {
    const moving = new Set([this.hero.root, ...this.zombies.map((z) => z.root), this.flag, ...this.coins.map((c) => c.mesh), ...this.floaters.map((c) => c.mesh)]);
    const batches = new Map();
    const meshes = [];
    this.set.updateMatrixWorld(true);
    this.set.traverse((mesh) => {
      if (!mesh.isMesh) return;
      for (let parent = mesh; parent && parent !== this.set; parent = parent.parent) if (moving.has(parent)) return;
      meshes.push(mesh);
    });
    for (const mesh of meshes) {
      const key = `${mesh.material.uuid}:${mesh.castShadow}:${mesh.receiveShadow}`;
      if (!batches.has(key)) batches.set(key, { geos: [], material: mesh.material, cast: mesh.castShadow, receive: mesh.receiveShadow });
      const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      batches.get(key).geos.push(geo.applyMatrix4(mesh.matrixWorld));
      mesh.removeFromParent();
    }
    for (const { geos, material, cast, receive } of batches.values()) {
      const mesh = new THREE.Mesh(mergeGeometries(geos, false), material);
      geos.forEach((geo) => geo.dispose());
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      this.set.add(mesh);
    }
  }

  resize(w, h) {
    const portrait = w / h < 0.9;
    this.camera.aspect = w / h;
    this.camera.fov = portrait ? 54 : 40;
    this.camera.position.set(0, portrait ? 10 : 8.3, portrait ? 25 : 23);
    this.camera.lookAt(0, portrait ? 8.8 : 4.5, 0);
    this.set.position.x = portrait ? 0 : (w / h > 1.7 ? 6.8 : 4.5);
    this.set.scale.setScalar(portrait ? 0.92 : 1);
    this.camera.updateProjectionMatrix();
  }

  update(time, reducedMotion = false) {
    const t = reducedMotion ? 0 : time;
    this.hero.parts.head.rotation.z = Math.sin(t * 1.5) * 0.06;
    this.hero.model.position.y = Math.sin(t * 2.4) * 0.04;
    this.hero.parts.armL.rotation.x = -0.15 + Math.sin(t * 2) * 0.15;
    this.zombies.forEach((z, i) => {
      z.model.position.y = Math.sin(t * 2 + i * 2) * 0.065;
      z.parts.head.rotation.z = Math.sin(t * 1.7 + i) * 0.09;
      z.parts.armL.rotation.x = -0.9 + Math.sin(t * 2.5 + i) * 0.12;
    });
    this.coins.forEach(({ mesh, y, phase }) => {
      mesh.rotation.y = t * 1.8 + phase;
      mesh.position.y = y + Math.sin(t * 2 + phase) * 0.13;
    });
    this.floaters.forEach(({ mesh, y, phase }) => { mesh.position.y = y + Math.sin(t * 0.4 + phase) * 0.2; });
    this.flag.rotation.y = Math.sin(t * 2) * 0.13;
  }
}
