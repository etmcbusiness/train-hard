// CORE AURA BLOOM — the post-process glow pass. WITHOUT this file, Core Aura
// still renders (the shell geometry, colors, noise, rise & fade all work) but
// looks like a flat, crisp, glow-less outline — the soft blurred "energy"
// look depends entirely on this separate render pass, not on anything in
// core-aura-code.js/core-aura-apply.js. If an aura you set up looks like a
// thin uniform outline with no glow at all, THIS FILE is almost certainly
// the piece that's missing — see AURA-LEVELS-INSTALL.md.
//
// Hand-rolled (not three.js's EffectComposer/UnrealBloomPass addons — this
// project only uses core THREE classes). Classic 3-pass bloom: bright-pass
// (keep only pixels above a brightness threshold) -> separable Gaussian blur
// (horizontal then vertical) -> additive composite back onto the crisp
// original. Every pass is just a fullscreen textured quad; the quad's own
// vertex shader writes clip-space position directly from its local (-1..1)
// coordinates, so it doesn't need (and ignores) whatever camera
// renderWithBloom() is called with.
//
// WHAT MUST ALREADY EXIST when this file loads (as globals, same
// alias-or-parameterize convention as every other layer here — see
// README-INTEGRATION.md point 2): `THREE`, `renderer` (a THREE.WebGLRenderer
// — stencil buffer must NOT be explicitly disabled, it's on by default),
// `scene`, `camera`. `characterModel` and `shellMeshes` are only READ inside
// renderWithBloom(), which isn't called until your render loop starts —
// so they just need to exist as globals by THEN, not when this file loads
// (see the cross-<script>-tag lazy-reference pattern in
// README-INTEGRATION.md / this project's own load order).
const BLOOM = {
    enabled: true,
    threshold: 0.25,
    strength: 0.75,
    radius: 1.5,
    resolutionScale: 0.5, // bloom passes render at this fraction of canvas size — cheaper, and the downsample itself contributes softness
    // Which rendered objects feed the bright-pass/glow: 'both' (default, no
    // extra render cost), 'body' (only the character model glows — aura shells
    // are excluded from the bright-pass source), or 'aura' (only the aura
    // shells glow — the body is excluded). See renderWithBloom()'s masked pass.
    source: 'aura'
};
const bloomQuadGeometry = new THREE.PlaneGeometry(2, 2);
const bloomQuadScene = new THREE.Scene();
const BLOOM_QUAD_VERTEX_SHADER = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
    }
`;
const bloomBrightMaterial = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, threshold: { value: BLOOM.threshold } },
    vertexShader: BLOOM_QUAD_VERTEX_SHADER,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float threshold;
        varying vec2 vUv;
        void main() {
            vec4 color = texture2D(tDiffuse, vUv);
            float brightness = max(color.r, max(color.g, color.b));
            float contrib = smoothstep(threshold, threshold + 0.25, brightness);
            gl_FragColor = vec4(color.rgb * contrib, color.a * contrib);
        }
    `
});
const bloomBlurMaterial = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, direction: { value: new THREE.Vector2(1, 0) } },
    vertexShader: BLOOM_QUAD_VERTEX_SHADER,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 direction; // texel step * blur radius, pre-scaled on the JS side
        varying vec2 vUv;
        void main() {
            vec4 sum = vec4(0.0);
            sum += texture2D(tDiffuse, vUv - 4.0 * direction) * 0.0162162162;
            sum += texture2D(tDiffuse, vUv - 3.0 * direction) * 0.0540540541;
            sum += texture2D(tDiffuse, vUv - 2.0 * direction) * 0.1216216216;
            sum += texture2D(tDiffuse, vUv - 1.0 * direction) * 0.1945945946;
            sum += texture2D(tDiffuse, vUv)                  * 0.2270270270;
            sum += texture2D(tDiffuse, vUv + 1.0 * direction) * 0.1945945946;
            sum += texture2D(tDiffuse, vUv + 2.0 * direction) * 0.1216216216;
            sum += texture2D(tDiffuse, vUv + 3.0 * direction) * 0.0540540541;
            sum += texture2D(tDiffuse, vUv + 4.0 * direction) * 0.0162162162;
            gl_FragColor = sum;
        }
    `
});
const bloomCompositeMaterial = new THREE.ShaderMaterial({
    uniforms: { tScene: { value: null }, tBloom: { value: null }, strength: { value: BLOOM.strength } },
    vertexShader: BLOOM_QUAD_VERTEX_SHADER,
    fragmentShader: `
        uniform sampler2D tScene;
        uniform sampler2D tBloom;
        uniform float strength;
        varying vec2 vUv;
        void main() {
            vec4 scene = texture2D(tScene, vUv);
            vec4 bloom = texture2D(tBloom, vUv);
            gl_FragColor = vec4(scene.rgb + bloom.rgb * strength, max(scene.a, bloom.a * strength));
        }
    `,
    transparent: true
});
const bloomQuad = new THREE.Mesh(bloomQuadGeometry, bloomBrightMaterial);
bloomQuadScene.add(bloomQuad);

const rtOptions = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat };
// stencilBuffer defaults to false on WebGLRenderTarget (unlike the main
// canvas, which gets one automatically) — the Core Aura outline's masking
// trick depends on a real stencil buffer, so the target it actually
// renders the scene into needs one explicitly or that masking silently
// breaks. The bright-pass/blur targets only ever render flat fullscreen
// quads, no stencil test involved, so they don't need one.
let bloomSceneRT = new THREE.WebGLRenderTarget(1, 1, Object.assign({ stencilBuffer: true }, rtOptions));
// Same size/format as bloomSceneRT (full-res, stencil-enabled) — only used
// when BLOOM.source isn't 'both', to render a SECOND copy of the scene with
// either the body or the aura shells swapped to solid black (see
// bloomMaskBlackMaterial below and renderWithBloom()), so the bright-pass can
// sample from that instead and only the chosen group contributes to the glow.
let bloomMaskRT = new THREE.WebGLRenderTarget(1, 1, Object.assign({ stencilBuffer: true }, rtOptions));
let bloomBrightRT = new THREE.WebGLRenderTarget(1, 1, rtOptions);
let bloomBlurRT_A = new THREE.WebGLRenderTarget(1, 1, rtOptions);
let bloomBlurRT_B = new THREE.WebGLRenderTarget(1, 1, rtOptions);

// Swapped in for whichever group (body meshes or aura shells) should be
// EXCLUDED from the bright-pass source during a selective-bloom masked pass.
// Solid black so it contributes nothing to the bright-pass regardless of
// lighting; skinning:true so it still deforms correctly if swapped onto a
// SkinnedMesh (matches shellMaterial's own skinning flag). Also carries
// the SAME stencilWrite/Ref/Always/Replace settings every body mesh's real
// material has (see core-aura-INTEGRATION.md's shell-creation loop) — the
// aura shell's own material tests that stencil bit (NotEqual, ref 1) to mask
// itself against the body's silhouette, so if this override material dropped
// those stencil writes when standing in for a body mesh, the shell would
// lose its masking and render unclipped in that one masked pass, throwing
// off the glow it produces.
const bloomMaskBlackMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
bloomMaskBlackMaterial.skinning = true;
bloomMaskBlackMaterial.stencilWrite = true;
bloomMaskBlackMaterial.stencilRef = 1;
bloomMaskBlackMaterial.stencilFunc = THREE.AlwaysStencilFunc;
bloomMaskBlackMaterial.stencilZPass = THREE.ReplaceStencilOp;

function resizeBloomTargets() {
    const w = renderer.domElement.width, h = renderer.domElement.height;
    const bw = Math.max(1, Math.round(w * BLOOM.resolutionScale));
    const bh = Math.max(1, Math.round(h * BLOOM.resolutionScale));
    bloomSceneRT.setSize(w, h);
    bloomMaskRT.setSize(w, h);
    bloomBrightRT.setSize(bw, bh);
    bloomBlurRT_A.setSize(bw, bh);
    bloomBlurRT_B.setSize(bw, bh);
}
resizeBloomTargets();

// Renders `scene`/`camera` with bloom applied, ending with the composited
// result on the actual screen (render target null). Call this INSTEAD OF a
// plain renderer.render(scene, camera) in your render loop — see
// AURA-LEVELS-INSTALL.md for the exact render-loop wiring.
function renderWithBloom() {
    if (!BLOOM.enabled) {
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        return;
    }

    renderer.setRenderTarget(bloomSceneRT);
    renderer.render(scene, camera);

    // Bright-pass source: the full scene by default, or — if BLOOM.source
    // restricts the glow to just the body or just the aura — a second render
    // with the OTHER group's materials swapped to solid black first. Swapping
    // materials rather than toggling .visible matters because every shell mesh
    // is a CHILD of its body mesh — three.js's renderer skips a whole subtree
    // once a parent fails its own .visible check, so hiding the body would
    // hide its shell children too. Material assignment has no such
    // parent/child inheritance, so swapping it only affects the object it's
    // set on. Needs `characterModel` and `shellMeshes` to exist as globals —
    // see the file-top comment.
    let brightSourceTexture = bloomSceneRT.texture;
    if (BLOOM.source !== 'both') {
        const swapBody = BLOOM.source === 'aura';
        const swapped = [];
        if (swapBody) {
            const shellSet = new Set(typeof shellMeshes !== 'undefined' ? shellMeshes : []);
            if (typeof characterModel !== 'undefined' && characterModel) {
                characterModel.traverse((o) => {
                    if (o.isMesh && !shellSet.has(o)) {
                        swapped.push([o, o.material]);
                        o.material = bloomMaskBlackMaterial;
                    }
                });
            }
        } else if (typeof shellMeshes !== 'undefined') {
            shellMeshes.forEach((s) => {
                swapped.push([s, s.material]);
                s.material = bloomMaskBlackMaterial;
            });
        }
        renderer.setRenderTarget(bloomMaskRT);
        renderer.render(scene, camera);
        brightSourceTexture = bloomMaskRT.texture;
        swapped.forEach(([o, mat]) => { o.material = mat; });
    }

    bloomBrightMaterial.uniforms.tDiffuse.value = brightSourceTexture;
    bloomBrightMaterial.uniforms.threshold.value = BLOOM.threshold;
    bloomQuad.material = bloomBrightMaterial;
    renderer.setRenderTarget(bloomBrightRT);
    renderer.render(bloomQuadScene, camera);

    const texelX = 1 / bloomBrightRT.width, texelY = 1 / bloomBrightRT.height;
    bloomQuad.material = bloomBlurMaterial;

    bloomBlurMaterial.uniforms.tDiffuse.value = bloomBrightRT.texture;
    bloomBlurMaterial.uniforms.direction.value.set(texelX * BLOOM.radius, 0);
    renderer.setRenderTarget(bloomBlurRT_A);
    renderer.render(bloomQuadScene, camera);

    bloomBlurMaterial.uniforms.tDiffuse.value = bloomBlurRT_A.texture;
    bloomBlurMaterial.uniforms.direction.value.set(0, texelY * BLOOM.radius);
    renderer.setRenderTarget(bloomBlurRT_B);
    renderer.render(bloomQuadScene, camera);

    bloomCompositeMaterial.uniforms.tScene.value = bloomSceneRT.texture;
    bloomCompositeMaterial.uniforms.tBloom.value = bloomBlurRT_B.texture;
    bloomCompositeMaterial.uniforms.strength.value = BLOOM.strength;
    bloomQuad.material = bloomCompositeMaterial;
    renderer.setRenderTarget(null);
    renderer.render(bloomQuadScene, camera);
}

// Optional — only if the host site has a lil-gui `gui` instance and wants
// live tuning controls, same convention as applyCoreAuraGui(). Skip this
// entirely if shipping fixed values instead.
function buildBloomGui() {
    const fBloom = gui.addFolder('Bloom / Glow');
    fBloom.add(BLOOM, 'enabled').name('Enabled');
    fBloom.add(BLOOM, 'threshold', 0, 2).name('Brightness Threshold');
    fBloom.add(BLOOM, 'strength', 0, 4).name('Strength');
    fBloom.add(BLOOM, 'radius', 0.1, 6).name('Blur Radius / Softness');
    fBloom.add(BLOOM, 'source', { 'Model + Aura': 'both', 'Body Only': 'body', 'Aura Only': 'aura' }).name('Applies To');
    return fBloom;
}
