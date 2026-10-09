import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { Effects } from '../src/world/Effects.js';
import { Game } from '../src/core/Game.js';
import { batchStaticMeshes, disposeWorld } from '../src/world/models.js';
import { radialTexture } from '../src/world/Glow.js';
import { SceneRenderer } from '../src/core/SceneRenderer.js';

describe('graphics resource budgets', () => {
  it('bounds simultaneous bursts, compacts live particles, and reuses expired records', () => {
    const fx = new Effects(new THREE.Scene(), { capacity: 8 });
    fx.burst(1, 2, 3, 0xffaa00, 5, 0, 0.1);
    const expired = new Set(fx.parts);
    fx.burst(4, 5, 6, 0x00aaff, 99, 0, 10);
    expect(fx.parts.length).toBe(8);
    fx.update(0.2);
    expect(fx.parts.length).toBe(3);
    expect(fx.mesh.count).toBe(3);
    expect(fx.parts.every((p) => p.x === 4 && p.color === 0x00aaff)).toBe(true);
    fx.burst(0, 0, 0, 0xffffff, 5);
    expect(fx.parts.filter((p) => expired.has(p)).length).toBe(5);
    fx.update(20);
    expect(fx.mesh.count).toBe(0);
    expect(fx.mesh.visible).toBe(false);
    fx.dispose();
  });

  it('releases active effects and leaves reusable geometry/textures alive', () => {
    const scene = new THREE.Scene();
    const fx = new Effects(scene);
    fx.slash(0, 0, 0, 0, 2, 100);
    fx.ring(0, 0, 0, 2);
    fx.line(0, 0, 0, 1, 0, 1);
    fx.burst(0, 0, 0, 0xffffff);
    fx.update(0);
    const disposals = fx.timed.map((f) => vi.fn());
    fx.timed.forEach((f, i) => f.mesh.material.addEventListener('dispose', disposals[i]));
    fx.dispose();
    expect(scene.children.length).toBe(0);
    expect(disposals.every((d) => d.mock.calls.length === 1)).toBe(true);
    const textureDispose = vi.fn();
    radialTexture().addEventListener('dispose', textureDispose);
    const group = new THREE.Group();
    group.add(new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture() })));
    disposeWorld(group);
    expect(textureDispose).not.toHaveBeenCalled();
    radialTexture().removeEventListener('dispose', textureDispose);
  });

  it('batches scenery in local coordinates while retaining moving props and labels', () => {
    const group = new THREE.Group();
    group.position.set(100, 20, 30);
    const material = new THREE.MeshBasicMaterial();
    for (const x of [2, 4]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
      mesh.position.x = x;
      group.add(mesh);
    }
    const chest = new THREE.Group();
    const lid = new THREE.Mesh(new THREE.BoxGeometry(), material);
    chest.add(lid);
    const label = new THREE.Sprite(new THREE.SpriteMaterial());
    group.add(chest, label);
    batchStaticMeshes(group, new Set([chest]));
    expect(lid.parent).toBe(chest);
    expect(label.parent).toBe(group);
    const merged = group.children.find((o) => o.isMesh);
    merged.geometry.computeBoundingBox();
    expect(merged.geometry.boundingBox.min.x).toBeCloseTo(1.5);
    expect(merged.geometry.boundingBox.max.x).toBeCloseTo(4.5);
    disposeWorld(group);
  });
});

describe('adaptive resolution', () => {
  function quality(ratio = 1) {
    return { ratio, maxRatio: 2, _frameEma: 1 / 60, _adaptT: 0,
      renderer: { setPixelRatio: vi.fn(), setSize: vi.fn() } };
  }
  function frames(g, dt, count) {
    for (let i = 0; i < count; i++) Game.prototype.adaptResolution.call(g, dt);
  }

  it('recovers resolution at 60 Hz after sustained headroom', () => {
    vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 800 });
    try {
      const g = quality();
      frames(g, 1 / 60, 100);
      expect(g.ratio).toBe(1);
      frames(g, 1 / 60, 180);
      expect(g.ratio).toBe(1.25);
    } finally { vi.unstubAllGlobals(); }
  });

  it('reduces load on slow frames and respects the minimum pixel ratio', () => {
    vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 800 });
    try {
      const g = quality();
      frames(g, 1 / 25, 300);
      expect(g.ratio).toBe(0.75);
      expect(g.renderer.setPixelRatio).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('bloom rendering', () => {
  function renderer() {
    let target = null;
    return { extensions: { has: () => true }, capabilities: { maxSamples: 4 },
      getDrawingBufferSize: (size) => size.set(3840, 2160),
      getRenderTarget: () => target, setRenderTarget: (value) => { target = value; },
      info: { autoReset: true, reset: vi.fn() }, render: vi.fn() };
  }

  it('caps offscreen memory and blurs at one quarter of each scene dimension', () => {
    const post = new SceneRenderer(renderer(), { touchDevice: true });
    post.setSize();
    expect([post.sceneTarget.width, post.sceneTarget.height]).toEqual([1920, 1080]);
    expect([post.bloomA.width, post.bloomA.height]).toEqual([480, 270]);
    expect(post.sceneTarget.samples).toBe(0);
    post.dispose();
  });

  it('restores renderer state if rendering fails and can bypass all extra passes', () => {
    const r = renderer();
    const post = new SceneRenderer(r);
    r.render.mockImplementationOnce(() => { throw Error('context interrupted'); });
    expect(() => post.render(new THREE.Scene(), new THREE.Camera())).toThrow('context interrupted');
    expect(r.getRenderTarget()).toBe(null);
    expect(r.info.autoReset).toBe(true);
    r.render.mockClear();
    post.render(new THREE.Scene(), new THREE.Camera(), false);
    expect(r.render).toHaveBeenCalledTimes(1);
    post.dispose();
  });
});
