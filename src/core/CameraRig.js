import * as THREE from 'three';

// yaw 규약: 카메라가 바라보는 수평 방향 = (sin yaw, cos yaw). yaw=0 → +Z
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = 0.34;
    this.dist = 8.3;
    this.target = new THREE.Vector3();
    this.shake = 0;
    this._initialized = false;
    this._tmp = new THREE.Vector3();
  }

  get forward() { return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) }; }
  get right() { return { x: -Math.cos(this.yaw), z: Math.sin(this.yaw) }; }

  snapTo(pos, hintDir) {
    if (hintDir) this.yaw = Math.atan2(hintDir.x, hintDir.z);
    this.target.set(pos.x, pos.y + 1.4, pos.z);
    this._initialized = true;
    this._apply(0, 0);
  }

  /**
   * @param autoAlign true면 진행 방향(hint)으로 카메라를 서서히 돌림 (앞으로 이동 중일 때)
   */
  update(dt, pos, input, hintDir, autoAlign, now, follow = true) {
    const drag = input.consumeCam();
    if (drag.x || drag.y) {
      this.yaw -= drag.x * 0.0065;
      this.pitch = Math.max(0.05, Math.min(1.25, this.pitch + drag.y * 0.005));
    }
    if (autoAlign && hintDir && now - input.lastCamDrag > 1.3) {
      const want = Math.atan2(hintDir.x, hintDir.z);
      let diff = want - this.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.yaw += diff * Math.min(1, dt * 1.6);
    }
    if (!this._initialized) this.snapTo(pos, hintDir);
    if (follow) {
      const kxz = 1 - Math.exp(-14 * dt);
      const ky = 1 - Math.exp(-5 * dt);
      this.target.x += (pos.x - this.target.x) * kxz;
      this.target.z += (pos.z - this.target.z) * kxz;
      this.target.y += (pos.y + 1.4 - this.target.y) * ky;
    }
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this._apply(dt, now);
  }

  _apply(dt, now) {
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const f = this.forward;
    let sx = 0; let sy = 0;
    if (this.shake > 0) {
      sx = (Math.random() - 0.5) * this.shake * 0.5;
      sy = (Math.random() - 0.5) * this.shake * 0.5;
    }
    this.camera.position.set(
      this.target.x - f.x * this.dist * cp + sx,
      this.target.y + this.dist * sp + sy,
      this.target.z - f.z * this.dist * cp,
    );
    this.camera.lookAt(this.target.x, this.target.y + 0.3, this.target.z);
  }
}
