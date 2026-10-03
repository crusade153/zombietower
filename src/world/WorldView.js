import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { TOWER } from '../config/balance.js';
import { THEMES, themeIndexForStage, themeForStage } from '../config/themes.js';
import {
  makeChest, makeForge, makeWaterStation, makeFlag, lambert, metal, box, cyl, rounded, batchMeshes,
} from './models.js';
import { makeWallTextures } from './WallTextures.js';
import { blinkState } from './Platforms.js';
import { spinnerAngle, fireState } from './Hazards.js';

const WALL_R = TOWER.wallRadius;

function typeColor(p, theme, stage) {
  const c = new THREE.Color();
  const t = theme.platform;
  const h = (t.h + (stage % 2) * 0.02) % 1;
  switch (p.type) {
    case 'safe': case 'sanctuary': return c.set(0xc0e5f2);
    case 'checkpoint': return c.set(0x72ddaa);
    case 'arena': return c.set(0x809fc4);
    case 'rest': return c.setHSL(h, t.s, Math.min(0.8, t.l + 0.1));
    case 'beam': return c.setHSL(h, t.s * 0.8, t.l * 0.75);
    case 'slider': return c.set(0xffa53a);
    case 'elevator': return c.set(0x3ac8ff);
    case 'falling': return c.set(0xd9b878);
    case 'conveyor': return c.set(0x3a3e48);
    case 'blink': return c.set(0x8ae8ff);
    default: {
      if (p.type === 'static' && p.id % 5 === 1) return c.set(0xc5e9fa);
      if (p.type === 'static' && p.id % 5 === 3) return c.set(0x9bb9e8);
      return c.setHSL(h, t.s, t.l);
    }
  }
}

function colorBox(p, color, atBase) {
  const g = new RoundedBoxGeometry(p.hx * 2, p.hy * 2, p.hz * 2, 1, Math.min(0.16, p.hy * 0.5));
  const normal = g.attributes.normal;
  const pos = g.attributes.position;
  const top = color.clone().lerp(new THREE.Color(0xf4fff5), p.type === 'safe' ? 0.5 : 0.06);
  const side = color.clone().multiplyScalar(0.8);
  const arr = new Float32Array(pos.count * 3);
  const face = new THREE.Color();
  const edge = new THREE.Color(0xd3fff0);
  for (let i = 0; i < pos.count; i++) {
    face.copy(side).lerp(top, Math.max(0, normal.getY(i)));
    if (Math.abs(normal.getY(i)) < 0.4 && pos.getY(i) > p.hy * 0.35) face.lerp(edge, 0.62);
    arr[i * 3] = face.r; arr[i * 3 + 1] = face.g; arr[i * 3 + 2] = face.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (atBase) g.translate(p.bx, p.by, p.bz);
  return g;
}

function topOutline(p, out) {
  const y = p.maxY + 0.014;
  const x0 = p.minX + 0.18; const x1 = p.maxX - 0.18; const z0 = p.minZ + 0.18; const z1 = p.maxZ - 0.18;
  const pts = [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]];
  for (const [ax, az, bx, bz] of pts) out.push(ax, y, az, bx, y, bz);
}

function makeLabel(text, color = '#ffe9b0', scale = [5, 1.25]) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.font = 'bold 72px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 9; g.strokeStyle = '#365862';
  g.strokeText(text, 256, 64);
  g.fillStyle = color;
  g.fillText(text, 256, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(scale[0], scale[1], 1);
  return s;
}

/** 컨베이어 위 화살표 무늬 */
function makeChevronTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#2a2e36'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#ffcf3a';
  for (const y of [8, 72]) {
    g.beginPath();
    g.moveTo(64, y); g.lineTo(112, y + 40); g.lineTo(112, y + 56); g.lineTo(64, y + 20);
    g.lineTo(16, y + 56); g.lineTo(16, y + 40); g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class WorldView {
  constructor(scene, tower, { touchDevice = false } = {}) {
    this.scene = scene;
    this.tower = tower;
    this.touchDevice = touchDevice;
    this.stageGroups = [];
    this.dynamic = []; // {mesh, p}
    this.safeProps = [];
    this.conveyors = []; // {tex, speed, dir}
    this.blinkMeshes = []; // {mesh, p}
    this.spinners = []; // {pivot, h}
    this.vents = []; // {flame, glow, v}
    this.torches = []; // 깜빡이는 횃불 불꽃
    this.crystals = [];
    this.theme = 0;
    this._lastTime = 0;
    this._build();
  }

  _build() {
    const { scene, tower } = this;
    const th0 = THEMES[0];
    scene.background = new THREE.Color(th0.fog);
    scene.fog = new THREE.Fog(th0.fog, 35, 155);
    this.fogTarget = new THREE.Color(th0.fog);
    this.skyTarget = new THREE.Color(th0.sky);

    this.hemi = new THREE.HemisphereLight(th0.sky, 0x43566e, 1.1);
    scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff2df, 2.6);
    sun.position.set(-30, 80, 20);
    scene.add(sun);
    this.sun = sun;
    sun.castShadow = true;
    sun.shadow.mapSize.set(this.touchDevice ? 1024 : 2048, this.touchDevice ? 1024 : 2048);
    Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 90 });
    sun.shadow.normalBias = 0.08;
    sun.shadow.bias = -0.0003;
    scene.add(sun.target);
    const rim = new THREE.DirectionalLight(0xa4dfff, 1.0);
    rim.position.set(30, 20, -40);
    scene.add(rim);
    // 용암이 벽·발판을 아래에서 붉게 비춘다
    this.lavaLight = new THREE.PointLight(0xff5a20, 14, 110, 1.0);
    this.lavaLight.position.set(0, -10, 0);
    scene.add(this.lavaLight);

    // 별(탑 위로 뚫린 하늘)
    const starPos = [];
    for (let i = 0; i < 500; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 0.9 + 0.1);
      const r = 900;
      starPos.push(r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) + 40, r * Math.sin(ph) * Math.sin(th));
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffe8d0, size: 2.2, sizeAttenuation: false, fog: false }));
    scene.add(this.stars);

    // 불씨
    const N = 150;
    this.emberSeed = [];
    for (let i = 0; i < N; i++) this.emberSeed.push([Math.random() * 60 - 30, Math.random() * 40, Math.random() * 60 - 30, 0.8 + Math.random() * 1.6, Math.random() * 6.28]);
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    this.embers = new THREE.Points(eg, new THREE.PointsMaterial({
      color: 0xe6f6ff, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0.8, fog: false, depthWrite: false,
    }));
    this.embers.frustumCulled = false;
    scene.add(this.embers);

    // 중앙 기둥
    const topY = tower.safeZones[tower.safeZones.length - 1].maxY;
    const pillarTop = topY + 14;
    const pillarH = pillarTop + 100;
    scene.add(cyl(TOWER.pillarRadius * 0.65, pillarH, metal(0x466276, 0.4), 0, (pillarTop - 100) / 2, 0));
    const rings = [];
    for (let y = 4; y < topY + 20; y += 7) rings.push(y);
    const ringMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 24), lambert(0x92dbcf), rings.length);
    const m4 = new THREE.Matrix4();
    rings.forEach((y, i) => {
      m4.compose(new THREE.Vector3(0, y, 0), new THREE.Quaternion(), new THREE.Vector3(TOWER.pillarRadius + 0.35, 0.5, TOWER.pillarRadius + 0.35));
      ringMesh.setMatrixAt(i, m4);
    });
    scene.add(ringMesh);
    const beacon = cyl(1.2, 3, lambert(0xffd060, 0xffa010), 0, pillarTop + 1.5, 0);
    scene.add(beacon);
    this.beacon = beacon;

    // 스테이지별 그룹
    for (let s = 0; s <= TOWER.stages; s++) {
      const group = new THREE.Group();
      group.visible = s <= 1;
      scene.add(group);
      this.stageGroups.push(group);
    }

    this._buildShell(topY);

    const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.12 });
    const lineMat = new THREE.LineBasicMaterial({ color: 0xeafff3, transparent: true, opacity: 0.35 });
    const chevron = makeChevronTexture();
    const torchMat = new THREE.MeshBasicMaterial({ color: 0xffb040 });

    // 안전구역 0..10
    tower.safeZones.forEach((p, k) => {
      const group = this.stageGroups[k];
      const theme = themeForStage(Math.max(1, k));
      const mesh = new THREE.Mesh(colorBox(p, typeColor(p, theme, k), true), solidMat);
      mesh.receiveShadow = true;
      group.add(mesh);
      const line = [];
      topOutline(p, line);
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(line, 3));
      group.add(new THREE.LineSegments(lg, lineMat));
      group.add(this._buildSafeProps(p, k, theme));
    });

    // 스테이지 발판
    tower.stages.forEach((st) => {
      const group = this.stageGroups[st.index];
      const theme = themeForStage(st.index);
      const statics = [];
      const lines = [];
      const details = new THREE.Group();
      for (const p of st.platforms) {
        const color = typeColor(p, theme, st.index);
        if (p.belt) {
          // 컨베이어: 어두운 몸체 + 움직이는 화살표 윗면
          statics.push(colorBox(p, color, true));
          const alongX = Math.abs(p.belt.x) > Math.abs(p.belt.z);
          const geo = new THREE.PlaneGeometry(alongX ? p.hz * 2 : p.hx * 2, alongX ? p.hx * 2 : p.hz * 2).rotateX(-Math.PI / 2);
          const tex = chevron.clone();
          tex.needsUpdate = true;
          const len = alongX ? p.hx * 2 : p.hz * 2;
          const wid = alongX ? p.hz * 2 : p.hx * 2;
          tex.repeat.set(Math.max(1, Math.round(wid / 1.6)), Math.max(1, Math.round(len / 1.6)));
          const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex }));
          mesh.position.set(p.bx, p.maxY + 0.02, p.bz);
          mesh.rotation.y = Math.atan2(-Math.sign(p.belt.x), -Math.sign(p.belt.z));
          group.add(mesh);
          this.conveyors.push({ tex, tps: p.belt.speed / 1.6 });
          const l = []; topOutline(p, l); lines.push(...l);
        } else if (p.blink) {
          const mat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, roughness: 0.7 });
          const mesh = new THREE.Mesh(colorBox(p, color, false), mat);
          mesh.position.set(p.x, p.y, p.z);
          group.add(mesh);
          this.blinkMeshes.push({ mesh, p });
          mesh.add(this._platformDetail(p));
        } else if (p.motion || p.type === 'falling') {
          const geo = colorBox(p, color, false);
          const mesh = new THREE.Mesh(geo, solidMat);
          mesh.receiveShadow = true;
          mesh.position.set(p.x, p.y, p.z);
          const l = [];
          const h = p.hy + 0.012;
          l.push(-p.hx, h, -p.hz, p.hx, h, -p.hz, p.hx, h, -p.hz, p.hx, h, p.hz, p.hx, h, p.hz, -p.hx, h, p.hz, -p.hx, h, p.hz, -p.hx, h, -p.hz);
          const lg = new THREE.BufferGeometry();
          lg.setAttribute('position', new THREE.Float32BufferAttribute(l, 3));
          mesh.add(new THREE.LineSegments(lg, lineMat));
          group.add(mesh);
          this.dynamic.push({ mesh, p });
          mesh.add(this._platformDetail(p));
        } else {
          statics.push(colorBox(p, color, true));
          topOutline(p, lines);
        }
        if (!p.motion && p.type !== 'falling' && !p.blink) {
          const detail = this._platformDetail(p);
          detail.position.set(p.bx, p.by, p.bz);
          details.add(detail);
        }
        if (p.type === 'checkpoint') {
          const flag = makeFlag();
          flag.position.set(p.x - p.hx * 0.6, p.maxY, p.z - p.hz * 0.6);
          group.add(flag);
        }
        if (p.type === 'sanctuary') group.add(this._buildSafeProps(p, 10, theme));
        if (p.type === 'checkpoint' || p.type === 'rest') {
          // 모서리 횃불 기둥
          for (const [sx, sz] of [[1, 1], [-1, -1]]) {
            const x = p.x + sx * (p.hx - 0.35);
            const z = p.z + sz * (p.hz - 0.35);
            group.add(cyl(0.11, 1.5, lambert(0x3a3a40), x, p.maxY + 0.75, z));
            const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 6), torchMat);
            flame.position.set(x, p.maxY + 1.8, z);
            group.add(flame);
            this.torches.push({ flame, ph: Math.random() * 6 });
          }
        }
        if (p.type === 'arena') {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(6.6, 7.2, 40).rotateX(-Math.PI / 2),
            new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.6 }),
          );
          ring.position.set(p.x, p.maxY + 0.03, p.z);
          group.add(ring);
          // 경기장 모서리 기둥
          for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
            const x = p.x + sx * (p.hx - 0.5);
            const z = p.z + sz * (p.hz - 0.5);
            group.add(cyl(0.45, 5, lambert(0x4a3030), x, p.maxY + 2.5, z));
            const flame = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 6), torchMat);
            flame.position.set(x, p.maxY + 5.6, z);
            group.add(flame);
            this.torches.push({ flame, ph: Math.random() * 6 });
          }
        }
      }
      if (statics.length) {
        const mesh = new THREE.Mesh(mergeGeometries(statics, false), solidMat);
        mesh.receiveShadow = true;
        group.add(mesh);
        statics.forEach((geo) => geo.dispose());
      }
      group.add(batchMeshes(details));
      if (lines.length) {
        const lg = new THREE.BufferGeometry();
        lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
        group.add(new THREE.LineSegments(lg, lineMat));
      }

      // 장애물 모델
      for (const h of st.hazards) this._buildHazard(h, group);
    });
  }

  _platformDetail(p) {
    const g = new THREE.Group();
    const rim = metal(0x506b7b, 0.45);
    const light = lambert(p.type === 'checkpoint' ? 0x78ffc5 : 0xb9f4f1, 0x183d40);
    const y = p.hy + 0.012;
    // Flush inlays and underside braces leave the jumping surface clear.
    for (const side of [-1, 1]) {
      g.add(box(p.hx * 1.65, 0.018, 0.045, light, 0, y, side * p.hz * 0.82));
      g.add(rounded(p.hx * 1.75, 0.14, 0.12, rim, 0, -p.hy + 0.04, side * p.hz * 0.78));
    }
    if (p.type !== 'beam' && !p.belt) {
      for (const x of [-1, 1]) for (const z of [-1, 1]) g.add(cyl(0.06, 0.02, rim, x * p.hx * 0.82, y + 0.005, z * p.hz * 0.65));
      for (const z of [-0.33, 0.33]) g.add(box(p.hx * 1.5, 0.012, 0.018, rim, 0, y, p.hz * z));
    }
    return g;
  }

  /** 탑 몸체: 테마 벽 + 버트레스 기둥 + 층 표지 + 몰딩 */
  _buildShell(topY) {
    const { tower } = this;
    const texCache = [];
    const getMat = (idx) => {
      if (!texCache[idx]) {
        const { map, glow } = makeWallTextures(idx);
        texCache[idx] = new THREE.MeshStandardMaterial({
          map, bumpMap: map, bumpScale: 0.18, emissiveMap: glow, emissive: 0xffffff, emissiveIntensity: 0.22, side: THREE.BackSide, roughness: 0.36, metalness: 0.16,
        });
      }
      return texCache[idx];
    };
    const REP_U = 14;
    for (let s = 1; s <= TOWER.stages; s++) {
      const theme = themeForStage(s);
      const idx = themeIndexForStage(s);
      const y0 = s === 1 ? -130 : tower.safeZones[s - 1].maxY - 0.5;
      const y1 = tower.safeZones[s].maxY + (s === TOWER.stages ? 70 : 0.5);
      const h = y1 - y0;
      const geo = new THREE.CylinderGeometry(WALL_R, WALL_R, h, 64, 1, true);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * REP_U, uv.getY(i) * (h / 12));
      const wall = new THREE.Mesh(geo, getMat(idx));
      wall.position.y = (y0 + y1) / 2;
      this.stageGroups[s].add(wall);

      // 버트레스 기둥 (20개)
      const pil = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), lambert(theme.wall), 20);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        q.setFromEuler(new THREE.Euler(0, -a, 0));
        m.compose(new THREE.Vector3(Math.cos(a) * (WALL_R - 1.0), (y0 + y1) / 2, Math.sin(a) * (WALL_R - 1.0)), q, new THREE.Vector3(2.0, h, 2.4));
        pil.setMatrixAt(i, m);
      }
      this.stageGroups[s].add(pil);
      this._buildArchitecture(s, theme);

      // Cloth banners break up the stone silhouette and carry each floor's colors.
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4 + 0.15;
        const banner = new THREE.Group();
        banner.position.set(Math.sin(a) * (WALL_R - 2.4), tower.safeZones[s - 1].maxY + 4.5, Math.cos(a) * (WALL_R - 2.4));
        banner.rotation.y = a;
        banner.add(rounded(2.1, 4.2, 0.16, lambert(i % 2 ? 0x7b9bd3 : 0xbce8f5), 0, 1, 0));
        banner.add(box(2.5, 0.14, 0.3, lambert(0xe1ece3), 0, 3.2, 0));
        const badge = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), lambert(0xeaf8ee));
        badge.scale.set(1, 1.5, 0.1);
        badge.position.set(0, 1.6, -0.12);
        banner.add(badge);
        this.stageGroups[s].add(banner);
      }

      // 층 경계 몰딩(벽에서 살짝 튀어나온 띠)
      if (s < TOWER.stages) {
        const band = new THREE.Mesh(
          new THREE.CylinderGeometry(WALL_R - 1.8, WALL_R - 1.8, 1.4, 64, 1, true),
          new THREE.MeshLambertMaterial({ color: theme.wall, side: THREE.BackSide }),
        );
        band.position.y = tower.safeZones[s].maxY - 1.5;
        this.stageGroups[s].add(band);
      }

      // 층 표지
      const entry = tower.safeZones[s - 1];
      const lab = makeLabel(`${s}F · ${theme.name}`, '#f0fff5', [8, 2]);
      const ang = Math.atan2(entry.z, entry.x);
      lab.position.set(Math.cos(ang) * (WALL_R - 3.5), entry.maxY + 9, Math.sin(ang) * (WALL_R - 3.5));
      this.stageGroups[s].add(lab);
    }
  }

  _buildArchitecture(stage, theme) {
    const group = this.stageGroups[stage];
    const baseY = this.tower.safeZones[stage - 1].maxY;
    const decor = new THREE.Group();
    const stone = lambert(theme.wall);
    const trim = metal(theme.accent, 0.35);
    const glass = new THREE.MeshStandardMaterial({ color: theme.accent, emissive: theme.accent, emissiveIntensity: 0.65, metalness: 0.35, roughness: 0.2 });
    for (let i = 0; i < 10; i++) {
      const angle = i * Math.PI / 5;
      const window = new THREE.Group();
      window.position.set(Math.sin(angle) * (WALL_R - 2.8), baseY + 5, Math.cos(angle) * (WALL_R - 2.8));
      window.rotation.y = angle;
      for (const side of [-1, 1]) {
        window.add(rounded(0.5, 5, 0.65, stone, side * 2.4, 2.5, 0));
        window.add(rounded(0.7, 0.3, 0.85, trim, side * 2.4, 0.2, -0.1));
        window.add(rounded(0.7, 0.3, 0.85, trim, side * 2.4, 4.9, -0.1));
      }
      const arch = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.25, 8, 24, Math.PI), stone);
      arch.position.y = 5;
      window.add(arch);
      const shape = new THREE.Shape();
      shape.moveTo(-2.1, 0.35); shape.lineTo(2.1, 0.35); shape.lineTo(2.1, 5);
      shape.absarc(0, 5, 2.1, 0, Math.PI, false); shape.lineTo(-2.1, 0.35);
      const pane = new THREE.Mesh(new THREE.ShapeGeometry(shape, 16), glass);
      pane.rotation.y = Math.PI;
      pane.position.z = 0.15;
      window.add(pane);
      for (const x of [-0.7, 0, 0.7]) window.add(box(0.07, 5.8, 0.12, trim, x, 3.3, -0.04));
      for (const y of [1.7, 3.5, 5]) window.add(box(4.2, 0.07, 0.12, trim, 0, y, -0.04));
      window.add(rounded(5.4, 0.35, 1.0, stone, 0, 0.15, 0));
      decor.add(window);
      for (let k = 0; k < 3; k++) {
        const icicle = new THREE.Mesh(new THREE.ConeGeometry(0.18 + k * 0.04, 1.2 + k * 0.5, 6), glass);
        icicle.rotation.z = Math.PI;
        icicle.position.set(window.position.x + Math.cos(angle) * (k - 1) * 1.4, baseY + 13 - k * 0.3, window.position.z - Math.sin(angle) * (k - 1) * 1.4);
        decor.add(icicle);
      }
    }
    // A floating crystal and metal halo form a landmark in the tower's core.
    const crystal = new THREE.Group();
    const entry = this.tower.safeZones[stage - 1];
    const angle = Math.atan2(entry.z, entry.x);
    crystal.position.set(Math.cos(angle) * 8, baseY + 8, Math.sin(angle) * 8);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1.25), new THREE.MeshStandardMaterial({ color: theme.accent, emissive: theme.accent, emissiveIntensity: 0.6, roughness: 0.18, metalness: 0.5 }));
    gem.scale.y = 1.8;
    crystal.add(gem);
    for (const tilt of [-0.5, 0.5]) {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.07, 8, 48), trim);
      halo.rotation.x = Math.PI / 2 + tilt;
      crystal.add(halo);
    }
    group.add(batchMeshes(decor), crystal);
    this.crystals.push({ group: crystal, y: baseY + 8 });
  }

  _buildHazard(h, group) {
    const p = h.platform;
    if (h.kind === 'spinner') {
      const pivot = new THREE.Group();
      pivot.position.set(p.x, p.maxY, p.z);
      pivot.add(cyl(0.5, 0.9, lambert(0x2a2a30), 0, 0.45, 0));
      const bar = new THREE.Group();
      bar.add(box(h.len, 0.34, 0.42, lambert(0xd02a2a, 0x300000), 0, 0.5, 0));
      for (const s of [-1, 1]) bar.add(box(0.9, 0.36, 0.44, lambert(0xffd02a, 0x403000), s * (h.len / 2 - 0.45), 0.5, 0));
      pivot.add(bar);
      group.add(pivot);
      this.spinners.push({ bar, h });
    } else if (h.kind === 'fire') {
      for (const v of h.vents) {
        const x = p.x + v.dx;
        const z = p.z + v.dz;
        const base = cyl(0.55, 0.14, lambert(0x1c1c20), x, p.maxY + 0.07, z);
        group.add(base);
        const glow = new THREE.Mesh(
          new THREE.CylinderGeometry(0.4, 0.4, 0.04, 14),
          new THREE.MeshBasicMaterial({ color: 0x401000 }),
        );
        glow.position.set(x, p.maxY + 0.15, z);
        group.add(glow);
        const flame = new THREE.Mesh(
          new THREE.ConeGeometry(0.75, 3.4, 10, 1, true),
          new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
        );
        flame.position.set(x, p.maxY + 1.7, z);
        flame.visible = false;
        group.add(flame);
        this.vents.push({ flame, glow, v });
      }
    }
  }

  _buildSafeProps(p, k, theme) {
    const g = new THREE.Group();
    const sz = p.safe;
    // Tile seams and mint edging make the landing area read as a real place.
    const tileMat = lambert(0x85bdb9);
    for (let d = -6; d <= 6; d += 2) {
      g.add(box(0.025, 0.012, p.hz * 2 - 0.5, tileMat, p.x + d, p.maxY + 0.007, p.z));
      g.add(box(p.hx * 2 - 0.5, 0.012, 0.025, tileMat, p.x, p.maxY + 0.007, p.z + d));
    }
    for (const [x, z, w, d] of [[0, -p.hz + 0.12, p.hx * 2, 0.18], [0, p.hz - 0.12, p.hx * 2, 0.18], [-p.hx + 0.12, 0, 0.18, p.hz * 2], [p.hx - 0.12, 0, 0.18, p.hz * 2]]) {
      g.add(rounded(w, 0.08, d, lambert(0x79e8c5, 0x18372d), p.x + x, p.maxY + 0.03, p.z + z));
    }
    for (const [sx, sz2] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const x = p.x + sx * (p.hx - 0.7);
      const z = p.z + sz2 * (p.hz - 0.7);
      g.add(cyl(0.22, 1.7, lambert(0x6c8391), x, p.maxY + 0.85, z));
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), new THREE.MeshBasicMaterial({ color: theme.accent })).translateX(x).translateY(p.maxY + 2.4).translateZ(z));
    }
    const label = makeLabel(sz.bossPrep ? '최종 결전 · 준비 구역' : k === 0 ? '출발' : (k === TOWER.stages ? '정상!' : `안전구역 ${k}`), '#f6fff0', [sz.bossPrep ? 5 : 2.7, 0.68]);
    label.position.set(p.x + p.next.x * 4 - p.next.z * 3, p.maxY + 2.7, p.z + p.next.z * 4 + p.next.x * 3);
    g.add(label);

    const forge = makeForge();
    forge.group.position.set(sz.forge.x - 1.0, p.maxY, sz.forge.z);
    g.add(forge.group);
    const water = makeWaterStation();
    water.position.set(sz.water.x, p.maxY, sz.water.z);
    g.add(water);
    const waterLabel = makeLabel('충전', '#a8ecff', [1.5, 0.4]);
    waterLabel.position.set(sz.water.x, p.maxY + 2.0, sz.water.z);
    g.add(waterLabel);
    const forgeLabel = makeLabel('대장간', '#ffe299', [2, 0.5]);
    forgeLabel.position.set(sz.forge.x, p.maxY + 2.0, sz.forge.z);
    g.add(forgeLabel);
    const entry = { k, forge, water, chest: null };
    if (k >= 1 && !sz.bossPrep) {
      const chest = makeChest();
      chest.group.position.set(sz.chest.x, p.maxY, sz.chest.z);
      chest.group.rotation.y = Math.atan2(p.x - sz.chest.x, p.z - sz.chest.z);
      g.add(chest.group);
      entry.chest = chest;
    }
    if (sz.bossPrep) this.bossSanctuaryProps = entry;
    else this.safeProps[k] = entry;
    return g;
  }

  /** 현재 층 기준 ±1 층만 보이게 */
  setActiveStage(s) {
    this.stageGroups.forEach((g, i) => { g.visible = Math.abs(i - s) <= 1; });
    this.setTheme(themeIndexForStage(Math.max(1, s)));
  }

  setTheme(idx) {
    if (idx === this.theme) return;
    this.theme = idx;
    const th = THEMES[idx];
    this.fogTarget.set(th.fog);
    this.skyTarget.set(th.sky);
  }

  setChestOpened(k, opened) {
    const e = this.safeProps[k];
    if (!e || !e.chest) return;
    e.chest.lid.rotation.x = opened ? -1.9 : 0;
  }

  /** 매 프레임 시각 갱신 */
  sync(time, center, lavaY) {
    const dt = Math.min(0.1, Math.max(0, time - this._lastTime));
    this._lastTime = time;
    if (center) {
      this.sun.position.set(center.x - 18, center.y + 30, center.z + 16);
      this.sun.target.position.set(center.x, center.y, center.z);
      const pos = this.embers.geometry.attributes.position;
      for (let i = 0; i < this.emberSeed.length; i++) {
        const [bx, by, bz, sp, ph] = this.emberSeed[i];
        pos.setXYZ(i, center.x + bx + Math.sin(time * 0.7 + ph) * 1.5, center.y + 30 - ((by + time * sp) % 40), center.z + bz + Math.cos(time * 0.6 + ph) * 1.5);
      }
      pos.needsUpdate = true;
    }
    // 분위기 색 전환
    const k = 1 - Math.exp(-1.4 * dt);
    this.scene.background.lerp(this.fogTarget, k);
    this.scene.fog.color.lerp(this.fogTarget, k);
    this.hemi.color.lerp(this.skyTarget, k);
    if (lavaY !== undefined) {
      this.lavaLight.position.y = lavaY + 3;
      this.lavaLight.intensity = 13 + Math.sin(time * 5) * 1.5 + Math.sin(time * 13) * 0.8;
    }

    for (const { mesh, p } of this.dynamic) {
      mesh.position.set(p.x, p.y, p.z);
      if (p.fall && p.fall.state === 'shake') {
        mesh.position.x += (Math.random() - 0.5) * 0.12;
        mesh.position.z += (Math.random() - 0.5) * 0.12;
      }
      mesh.visible = !(p.fall && p.fall.state === 'fall' && p.y < p.by - 30);
    }
    for (const { mesh, p } of this.blinkMeshes) {
      const st = blinkState(p, time);
      const m = mesh.material;
      m.opacity = st === 'on' ? 1 : (st === 'warn' ? (Math.sin(time * 28) > 0 ? 1 : 0.3) : 0.12);
    }
    for (const c of this.conveyors) c.tex.offset.y -= dt * c.tps;
    for (const s of this.spinners) s.bar.rotation.y = -spinnerAngle(s.h, time);
    for (const e of this.vents) {
      const st = fireState(e.v, time);
      e.flame.visible = st === 'on';
      e.glow.material.color.setHex(st === 'warn' ? (Math.sin(time * 24) > 0 ? 0xff4010 : 0x802000) : (st === 'on' ? 0xffa030 : 0x401000));
      if (st === 'on') e.flame.scale.set(1 + Math.sin(time * 30) * 0.08, 0.95 + Math.sin(time * 22 + e.v.phase) * 0.08, 1);
    }
    for (const t of this.torches) t.flame.scale.set(1, 0.85 + 0.3 * Math.sin(time * 9 + t.ph), 1);
    this.beacon.rotation.y = time;
    for (const c of this.crystals) {
      if (!c.group.parent.visible) continue;
      c.group.rotation.y = time * 0.3;
      c.group.position.y = c.y + Math.sin(time * 1.2) * 0.3;
    }
    for (const e of this.safeProps) {
      if (!e) continue;
      e.forge.fire.scale.y = 0.45 + 0.1 * Math.sin(time * 9 + e.k);
    }
  }
}
