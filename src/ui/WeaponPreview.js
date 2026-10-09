import * as THREE from 'three';
import { makeWeaponMesh, disposeWorld } from '../world/models.js';
import { WEAPONS } from '../config/weapons.js';

/** One reusable WebGL context. Animation and model resources stop when the modal closes. */
export class WeaponPreview {
  stop() {
    cancelAnimationFrame(this.frame);
    this.resize?.disconnect();
    if (this.scene) disposeWorld(this.scene);
    this.scene = null;
    this.renderer?.domElement.remove();
  }

  show(host, weapon) {
    this.stop();
    if (!host) return;
    this.renderer ||= new THREE.WebGLRenderer({ antialias: true, alpha: true });
    const renderer = this.renderer;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    renderer.domElement.setAttribute('aria-label', '선택한 무기의 회전하는 3D 외형');
    host.append(renderer.domElement);
    const scene = this.scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xd4f4ff, 0x2b2438, 2));
    const key = new THREE.DirectionalLight(0xffffff, 3.5);
    key.position.set(2, 3, 4); scene.add(key);
    const rim = new THREE.DirectionalLight(0x75bfff, 2);
    rim.position.set(-3, 1, -2); scene.add(rim);
    const mount = new THREE.Group();
    const model = makeWeaponMesh(weapon);
    if (WEAPONS[weapon.kind].kind === 'gun') model.rotation.z = Math.PI / 2;
    else {
      // Show both the shaft and blade face; a side-on view hides flat axe blades.
      model.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
      model.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2));
    }
    mount.add(model); scene.add(mount);
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);
    const size = box.getSize(new THREE.Vector3());
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 30);
    const fit = () => {
      const width = host.clientWidth, height = host.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.position.set(0, 0.5, Math.max(size.y, size.x / camera.aspect, size.z) * 2.1 + 0.6);
      camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
    };
    this.resize = new ResizeObserver(fit); this.resize.observe(host); fit();
    const start = performance.now();
    const draw = now => {
      if (!this.scene || !host.isConnected) return;
      const t = (now - start) / 1000;
      mount.rotation.set(0.12, Math.sin(t * 0.6) * 0.5, -0.2);
      const aura = model.userData.aura;
      if (aura) { aura.rotation.z = t; aura.scale.setScalar(1 + Math.sin(t * 4) * 0.06); }
      if (!document.hidden) renderer.render(scene, camera);
      this.frame = requestAnimationFrame(draw);
    };
    this.frame = requestAnimationFrame(draw);
  }
}
