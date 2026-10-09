import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/** HDR scene + two quarter-resolution bloom passes + final color output. */
export class SceneRenderer {
  constructor(renderer, { touchDevice = false } = {}) {
    this.renderer = renderer;
    this.touchDevice = touchDevice;
    const hdr = renderer.extensions.has('EXT_color_buffer_float');
    const type = hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.sceneTarget = new THREE.WebGLRenderTarget(1, 1, { type });
    this.sceneTarget.samples = touchDevice ? 0 : Math.min(2, renderer.capabilities.maxSamples);
    this.bloomA = new THREE.WebGLRenderTarget(1, 1, { type, depthBuffer: false });
    this.bloomB = this.bloomA.clone();
    this.blur = new THREE.ShaderMaterial({
      vertexShader, depthTest: false, depthWrite: false, toneMapped: false,
      uniforms: { image: { value: null }, direction: { value: new THREE.Vector2() },
        extract: { value: 1 }, threshold: { value: hdr ? 1.15 : 0.8 } },
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform sampler2D image;
        uniform vec2 direction;
        uniform float extract;
        uniform float threshold;
        vec3 sampleLight(vec2 uv) {
          vec3 c = texture2D(image, uv).rgb;
          float brightness = max(c.r, max(c.g, c.b));
          float gate = max(0.0, brightness - threshold) / max(brightness, 0.0001);
          return mix(c, c * gate, extract);
        }
        void main() {
          vec3 c = sampleLight(vUv) * 0.227027;
          c += sampleLight(vUv + direction * 1.384615) * 0.316216;
          c += sampleLight(vUv - direction * 1.384615) * 0.316216;
          c += sampleLight(vUv + direction * 3.230769) * 0.070270;
          c += sampleLight(vUv - direction * 3.230769) * 0.070270;
          gl_FragColor = vec4(c, 1.0);
        }
      `,
    });
    this.output = new THREE.ShaderMaterial({
      vertexShader, depthTest: false, depthWrite: false,
      uniforms: { image: { value: this.sceneTarget.texture }, bloom: { value: this.bloomB.texture },
        strength: { value: 0.28 }, vignette: { value: 0.14 } },
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform sampler2D image;
        uniform sampler2D bloom;
        uniform float strength;
        uniform float vignette;
        void main() {
          vec3 c = texture2D(image, vUv).rgb + texture2D(bloom, vUv).rgb * strength;
          vec2 p = (vUv - 0.5) * 2.0;
          c *= 1.0 - smoothstep(0.35, 1.5, dot(p, p)) * vignette;
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.quad = new FullScreenQuad(this.blur);
    this.size = new THREE.Vector2();
  }

  setSize() {
    this.renderer.getDrawingBufferSize(this.size);
    // Limit offscreen memory on high-DPI and large displays.
    const scale = Math.min(1, (this.touchDevice ? 1920 : 2560) / Math.max(this.size.x, this.size.y));
    const width = Math.max(1, Math.round(this.size.x * scale));
    const height = Math.max(1, Math.round(this.size.y * scale));
    this.sceneTarget.setSize(width, height);
    this.bloomA.setSize(Math.max(1, Math.ceil(width / 4)), Math.max(1, Math.ceil(height / 4)));
    this.bloomB.setSize(this.bloomA.width, this.bloomA.height);
  }

  render(scene, camera, enabled = true) {
    const renderer = this.renderer;
    if (!enabled) { renderer.render(scene, camera); return; }
    const autoReset = renderer.info.autoReset;
    const target = renderer.getRenderTarget();
    renderer.info.autoReset = false;
    renderer.info.reset();
    try {
      // Three.js keeps render targets linear and applies tone mapping only at output.
      renderer.setRenderTarget(this.sceneTarget);
      renderer.render(scene, camera);
      this.quad.material = this.blur;
      this.blur.uniforms.image.value = this.sceneTarget.texture;
      this.blur.uniforms.extract.value = 1;
      this.blur.uniforms.direction.value.set(1 / this.bloomA.width, 0);
      renderer.setRenderTarget(this.bloomA);
      this.quad.render(renderer);
      this.blur.uniforms.image.value = this.bloomA.texture;
      this.blur.uniforms.extract.value = 0;
      this.blur.uniforms.direction.value.set(0, 1 / this.bloomA.height);
      renderer.setRenderTarget(this.bloomB);
      this.quad.render(renderer);
      this.quad.material = this.output;
      renderer.setRenderTarget(target);
      this.quad.render(renderer);
    } finally {
      renderer.setRenderTarget(target);
      renderer.info.autoReset = autoReset;
    }
  }

  dispose() {
    this.sceneTarget.dispose(); this.bloomA.dispose(); this.bloomB.dispose();
    this.blur.dispose(); this.output.dispose(); this.quad.dispose();
  }
}
