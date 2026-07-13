// TOON OUTLINE — APPLY
// Creates the real THREE.js objects (uniforms, ShaderMaterial, and the
// shellMeshes array that per-mesh shell clones get pushed into). The host
// (index.html) attaches one shell clone per body mesh at load time and calls
// syncHuggingAuraUniforms(SHELL, shellUniforms, time) once per frame from its
// own render loop — see README-INTEGRATION.md point 6.
import * as THREE from 'three';
import { SHELL, HUGGING_AURA_VERTEX_SHADER, HUGGING_AURA_FRAGMENT_SHADER, buildHuggingAuraUniforms } from './toon-outline-code.js';

export const shellUniforms = buildHuggingAuraUniforms(SHELL);
export const shellMaterial = new THREE.ShaderMaterial({
  uniforms: shellUniforms,
  transparent: true,
  depthWrite: false,
  side: THREE.BackSide,
  stencilWrite: true,
  stencilRef: 1,
  stencilFunc: THREE.NotEqualStencilFunc,
  stencilZPass: THREE.KeepStencilOp,
  stencilFail: THREE.KeepStencilOp,
  stencilZFail: THREE.KeepStencilOp,
  vertexShader: HUGGING_AURA_VERTEX_SHADER,
  fragmentShader: HUGGING_AURA_FRAGMENT_SHADER
});
export const shellMeshes = [];
