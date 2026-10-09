import * as THREE from 'three';
import { makeRng } from '../core/rng.js';

export function makeFrostTexture() {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  const rng = makeRng(7319);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const at = (y * size + x) * 4;
    const grain = 238 + Math.floor(rng() * 17);
    const vein = Math.sin(x * 0.11 + Math.sin(y * 0.09) * 1.8);
    const shade = Math.abs(vein) < 0.045 ? 12 : 0;
    data[at] = grain - shade;
    data[at + 1] = Math.min(255, grain + 3) - shade;
    data[at + 2] = Math.min(255, grain + 7) - shade;
    data[at + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.repeat.set(3, 3);
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/** A shared animated flame shader: bright core, soft edges, no extra lights. */
export function makeFlameMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      #include <fog_pars_fragment>
      void main() {
        float flicker = sin(vUv.x * 18.8496 + vUv.y * 8.0 - uTime * 7.0);
        float tongues = sin(vUv.x * 31.4159 - uTime * 4.0 + flicker);
        float heat = clamp(1.0 - vUv.y + flicker * 0.12, 0.0, 1.0);
        vec3 color = mix(vec3(1.6, 0.12, 0.015), vec3(2.2, 1.4, 0.3), heat);
        float alpha = (1.0 - smoothstep(0.45, 1.0, vUv.y)) * (0.6 + tongues * 0.16);
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
}
