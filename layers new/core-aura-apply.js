// CORE AURA — APPLY TO 3D MODEL
// How SHELL (core-aura-code.js, same folder) becomes real geometry on the loaded
// character and a GUI panel. The actual per-body-mesh shell creation happens
// inside the GLTF load callback in the main HTML file (it needs bodyMeshes,
// which only exist once the model has loaded) — that code uses
// `shellMaterial`/`shellMeshes`/`SHELL` declared here. The per-frame sync
// call stays in the main animate() loop alongside every other system's
// per-frame update, since that loop is the shared render orchestrator, not
// any one layer's own code.
//
// This shader is DEDICATED to Core Aura, not the shared
// HUGGING_AURA_VERTEX_SHADER/FRAGMENT_SHADER in core-aura-code.js (those are
// unchanged and still fully featured — flex-shape-aura-code.js (same folder), the
// 2D DOM-element aura tool, still uses them with its own full config).
//
// AURA CLOUD SHAPE: built to match a specific visual reference (Jiren-style
// Dragon Ball aura art) — a soft, billowing cloud/flame silhouette bulging
// unevenly off the body, bigger around the shoulders/head, white/light near
// the body fading to a saturated color at the tips, with the actual soft
// blurred edge quality coming from the Bloom pass in core-aura-editor.html
// (geometry alone can't produce that blur, however it's shaped). The bulge
// itself is a single low-frequency 3D value-noise field (see fbm3 below),
// deliberately NOT the old high-octave/spiky noise system that got deleted —
// low frequency is what makes it read as a few big rounded blobs instead of
// dense fine texture. Still real geometry displaced along the body's own
// (skinned, correctly-scaled) vertex normals, so it's still exactly as
// attached to the body and correct through rotation as the plain hug was.
const CORE_AURA_VERTEX_SHADER = `
    uniform float pushAmount;
    uniform float densityScale;
    uniform float cloudAmp;
    uniform float cloudFreq;
    uniform float cloudSpeed;
    uniform float topBias;
    uniform float bottomBias;
    uniform int flowMode; // 0 = plain vertical rise, 1 = converge (both sides flow up + inward toward top-center)
    uniform float flowSpeed;
    uniform float time;
    uniform float modelGroundY;
    uniform float modelHeight;
    uniform mat4 auraAnchorInverse;
    uniform float riseFadeAmp;
    uniform float driftAmp;
    uniform float flameSharpness;
    #include <skinning_pars_vertex>

    varying float vCloud;
    // How far along its own rise-and-fade cycle this vertex currently is (1 =
    // fully present, 0 = fully dissipated) — computed once here, reused
    // identically for both the geometric shrink below AND the fragment
    // shader's alpha, so the two can never visually disagree with each other.
    varying float vRiseEnvelope;

    float hash3(vec3 p) {
        return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    }
    // Trilinear value noise — deliberately simple/cheap (no gradient noise),
    // smoothstep-interpolated so it has no visible grid artifacts at the low
    // frequencies this is actually used at.
    float valueNoise3(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float n000 = hash3(i + vec3(0.0, 0.0, 0.0));
        float n100 = hash3(i + vec3(1.0, 0.0, 0.0));
        float n010 = hash3(i + vec3(0.0, 1.0, 0.0));
        float n110 = hash3(i + vec3(1.0, 1.0, 0.0));
        float n001 = hash3(i + vec3(0.0, 0.0, 1.0));
        float n101 = hash3(i + vec3(1.0, 0.0, 1.0));
        float n011 = hash3(i + vec3(0.0, 1.0, 1.0));
        float n111 = hash3(i + vec3(1.0, 1.0, 1.0));
        float nx00 = mix(n000, n100, f.x);
        float nx10 = mix(n010, n110, f.x);
        float nx01 = mix(n001, n101, f.x);
        float nx11 = mix(n011, n111, f.x);
        float nxy0 = mix(nx00, nx10, f.y);
        float nxy1 = mix(nx01, nx11, f.y);
        return mix(nxy0, nxy1, f.z);
    }
    // Three octaves, but starting from a caller-controlled LOW base frequency
    // (cloudFreq) — this is what makes it read as a handful of big rounded
    // blobs instead of a dense fine texture (the old, deleted bump system's
    // problem was always starting from a high base frequency).
    float fbm3(vec3 p) {
        float sum = 0.0;
        float amp = 0.55;
        float freq = 1.0;
        for (int i = 0; i < 3; i++) {
            sum += valueNoise3(p * freq) * amp;
            freq *= 2.05;
            amp *= 0.5;
        }
        return sum;
    }

    void main() {
        vec3 transformed = vec3(position);
        vec3 objectNormal = vec3(normal);
        #include <skinbase_vertex>
        #include <skinning_vertex>
        #include <skinnormal_vertex>
        objectNormal = normalize(objectNormal);

        vec3 worldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        // Re-expressed in auraAnchor's OWN local frame (rotation and position
        // undone) rather than raw world space — auraAnchor is what the
        // left-click-drag rotation actually spins, so a plain worldPos.y/worldPos.x
        // reading drifts out from under "up" and "left/right relative to the
        // character" the moment the character gets rotated or dragged. This stays
        // correct regardless: modelGroundY (a JS global from
        // core-aura-editor.html) is already expressed in this exact same local
        // frame, so it can compare directly against charPos.y with no further
        // conversion.
        vec3 charPos = (auraAnchorInverse * vec4(worldPos, 1.0)).xyz;

        // 0 at the head, 1 at the feet — matches the deleted shared shader's own
        // heightPhase convention, kept for consistency if this is ever compared
        // against it again.
        float heightFrac = clamp(1.0 - (charPos.y - modelGroundY) / max(0.0001, modelHeight), 0.0, 1.0);

        // Per-location offset shared by Rise & Fade and Lateral Drift below —
        // offsets different parts of the body to different phases/directions
        // so both effects read as many independent wisps behaving
        // asynchronously around the body, not one uniform ring/sway in sync.
        float stagger = fbm3(vec3(charPos.x, charPos.z, 0.0) * 0.6) * 3.0;

        // RISE & FADE (kept permanently on, per confirmed feedback — this is
        // the one that actually landed) — divides the vertical axis into
        // repeating bands and continuously scrolls them UPWARD over time (the
        // classic "scrolling flame" shader trick: subtract time*speed from the
        // height coordinate before wrapping with fract). Each band cycles
        // through a phase 0->1 as it travels: born faint near the bottom of its
        // band, quickly grows solid, then spends most of its cycle fading back
        // out before the pattern wraps and the next band arrives — read
        // together over time this is continuous upward-traveling motion that
        // dissipates as it goes. Band height/speed were their own sliders
        // originally; removed after feedback that they didn't add anything
        // worth keeping — now fixed at the values that were actually approved.
        float riseEnvelope = 1.0;
        if (riseFadeAmp > 0.0) {
            float riseCoord = charPos.y / 0.8 - time * 1.5 + stagger;
            float risePhase = fract(riseCoord);
            float rawEnvelope = smoothstep(0.0, 0.12, risePhase) * (1.0 - smoothstep(0.15, 1.0, risePhase));
            riseEnvelope = mix(1.0, rawEnvelope, riseFadeAmp);
        }
        vRiseEnvelope = riseEnvelope;

        // LATERAL DRIFT — a new, different idea (not a rename of the removed
        // sliders): as the aura rises it meanders slowly side to side instead
        // of traveling in a perfectly straight line, like real smoke catching
        // shifting air currents rather than a rigid column. Uses the SAME
        // per-location stagger as Rise & Fade above so a given wisp's drift
        // direction stays consistent with its own rise cycle instead of
        // reading as a separate, unrelated sway.
        vec3 driftOffset = vec3(0.0);
        if (driftAmp > 0.0) {
            float driftPhase = charPos.y * 1.1 + stagger * 2.0 + time * 0.6;
            driftOffset = vec3(sin(driftPhase), 0.0, cos(driftPhase * 0.7)) * driftAmp * cloudAmp * (1.0 - heightFrac) * 1.5;
        }

        vec3 flowPos = charPos;
        if (flowMode == 1) {
            // abs() folds the left and right sides onto the SAME coordinate, so
            // both read the identical (mirrored) noise pattern; advancing that
            // shared coordinate with time makes the "already-sampled" region grow
            // outward from center over time, which — sampled the way the eye
            // reads it — looks exactly like both sides flowing INWARD toward the
            // center as they also rise, meeting at the top-middle.
            flowPos.x = abs(charPos.x) + time * flowSpeed * 0.5;
        }
        flowPos.y -= time * cloudSpeed;

        float n = fbm3(flowPos * cloudFreq);
        // Remaps noise so most of the surface bulges out to SOME degree, with
        // genuine organic peaks and a few flat/receding valleys — a cloud
        // silhouette, not symmetric in/out static.
        float cloudShapeRound = clamp(n * 1.3 - 0.15, 0.0, 1.0);
        // FLAME SHARPNESS — raises the round cloud shape to a power > 1, which
        // pulls most of the surface down toward the body while leaving only
        // the actual peaks reaching far out — narrower, more pointed "flame
        // tongue" tips instead of broad round blobs ("fire coming to a point").
        // flameSharpness = 1 is the exact old round-blob shape.
        float cloudShape = pow(cloudShapeRound, max(1.0, flameSharpness));
        vCloud = cloudShape;

        // heightFrac=0 at the head -> full topBias; heightFrac=1 at the feet -> 1.0
        // (no extra bias) — the aura reads as more active near the
        // shoulders/head and tapers out toward the feet, like the reference art.
        float topAmp = mix(topBias, 1.0, heightFrac);
        // BOTTOM BIAS — the mirror-image adjustment for the LOWER legs
        // specifically (calves and below), not a whole-body gradient like
        // topBias above. smoothstep(0.72, 0.98, heightFrac) stays at 0 for
        // everything from the torso up through the thighs/knees (untouched),
        // then ramps to 1 across roughly the calves down to the very feet —
        // bottomBias=1 there is a no-op (matches the exact old look);
        // anything less shrinks just that lower region.
        float bottomBlend = smoothstep(0.72, 0.98, heightFrac);
        float bottomAmp = mix(1.0, bottomBias, bottomBlend);
        float cloud = cloudShape * cloudAmp * topAmp * bottomAmp * densityScale;

        cloud *= riseEnvelope;

        vec3 displaced = transformed + objectNormal * (pushAmount * densityScale + cloud) + driftOffset;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
    }
`;
const CORE_AURA_FRAGMENT_SHADER = `
    uniform vec3 uColor;
    uniform vec3 uColorEdge;
    uniform vec3 uSmokeColor;
    uniform float smokeAmount;
    uniform float uOpacity;
    varying float vCloud;
    varying float vRiseEnvelope;

    void main() {
        // White/light near the body (vCloud low, little/no bulge) fading to the
        // saturated edge color out at the bulge tips (vCloud high) — the
        // reference art's core-to-edge color wash.
        vec3 col = mix(uColor, uColorEdge, vCloud);
        // SMOKE TINT — as a wisp gets further along its own Rise & Fade cycle
        // (vRiseEnvelope falling from 1 toward 0), its color drifts toward
        // uSmokeColor — the same flame-colored energy reads as turning into
        // smoke as it dissipates, instead of just the flame color fading out
        // at a constant hue. Inert whenever Rise & Fade itself is off
        // (vRiseEnvelope stays 1, so this mix is always 0 in that case).
        col = mix(col, uSmokeColor, (1.0 - vRiseEnvelope) * smokeAmount);
        float alpha = uOpacity * mix(1.0, 0.8, vCloud);
        // Same rise-and-fade envelope the vertex shader used to shrink the
        // geometry — applying it to alpha too means a dissipating wisp
        // visually fades AND shrinks together, not just one or the other.
        alpha *= vRiseEnvelope;
        gl_FragColor = vec4(col, alpha);
    }
`;

const CORE_AURA_FLOW_MODES = { vertical: 0, converge: 1 };

function buildCoreAuraUniforms(cfg) {
    return {
        pushAmount: { value: cfg.pushAmount },
        // Per-mesh, not per-character — set once per shell (not here) by
        // core-aura-editor.html's attachAuraShells(). 1.0 = no correction.
        densityScale: { value: 1.0 },
        cloudAmp: { value: cfg.cloudAmp },
        cloudFreq: { value: cfg.cloudFreq },
        cloudSpeed: { value: cfg.cloudSpeed },
        topBias: { value: cfg.topBias },
        bottomBias: { value: cfg.bottomBias },
        flowMode: { value: CORE_AURA_FLOW_MODES[cfg.flowDirection] },
        flowSpeed: { value: cfg.flowSpeed },
        time: { value: 0 },
        modelGroundY: { value: 0 },
        modelHeight: { value: 1 },
        auraAnchorInverse: { value: new THREE.Matrix4() },
        uColor: { value: new THREE.Color(cfg.color) },
        uColorEdge: { value: new THREE.Color(cfg.colorEdge) },
        uSmokeColor: { value: new THREE.Color(cfg.smokeColor) },
        smokeAmount: { value: cfg.smokeAmount },
        uOpacity: { value: cfg.opacity },
        riseFadeAmp: { value: cfg.riseFadeAmp },
        driftAmp: { value: cfg.driftAmp },
        flameSharpness: { value: cfg.flameSharpness }
    };
}
function syncCoreAuraUniforms(cfg, uniforms, time) {
    uniforms.pushAmount.value = cfg.pushAmount;
    uniforms.cloudAmp.value = cfg.cloudAmp;
    uniforms.cloudFreq.value = cfg.cloudFreq;
    uniforms.cloudSpeed.value = cfg.cloudSpeed;
    uniforms.topBias.value = cfg.topBias;
    uniforms.bottomBias.value = cfg.bottomBias;
    uniforms.flowMode.value = CORE_AURA_FLOW_MODES[cfg.flowDirection];
    uniforms.flowSpeed.value = cfg.flowSpeed;
    uniforms.time.value = time || 0;
    // modelGroundY/TARGET_HEIGHT/auraAnchor are core-aura-editor.html globals
    // (same cross-script-tag convention the rest of this project already
    // uses) — guarded here so this file alone never throws if loaded
    // somewhere they don't exist. auraAnchor's matrixWorld is force-updated
    // first since this runs before the render call that would normally
    // refresh it, and drag-rotation mutates auraAnchor.rotation directly —
    // without this the inverse would lag a frame behind the actual rotation.
    uniforms.modelGroundY.value = (typeof modelGroundY !== 'undefined') ? modelGroundY : 0;
    uniforms.modelHeight.value = (typeof TARGET_HEIGHT !== 'undefined') ? TARGET_HEIGHT : 1;
    if (typeof auraAnchor !== 'undefined') {
        auraAnchor.updateMatrixWorld();
        uniforms.auraAnchorInverse.value.copy(auraAnchor.matrixWorld).invert();
    }
    uniforms.uColor.value.set(cfg.color);
    uniforms.uColorEdge.value.set(cfg.colorEdge);
    uniforms.uSmokeColor.value.set(cfg.smokeColor);
    uniforms.smokeAmount.value = cfg.smokeAmount;
    uniforms.uOpacity.value = cfg.opacity;
    uniforms.riseFadeAmp.value = cfg.riseFadeAmp;
    uniforms.driftAmp.value = cfg.driftAmp;
    uniforms.flameSharpness.value = cfg.flameSharpness;
    // densityScale intentionally untouched here — see buildCoreAuraUniforms.
}

const shellUniforms = buildCoreAuraUniforms(SHELL);
const shellMaterial = new THREE.ShaderMaterial({
    uniforms: shellUniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    // STENCIL MASK: only draw where NO part of the character has already been
    // rendered (see the matching stencilWrite/Ref/ZPass set on every body mesh's own
    // material below). Without this, each separate body mesh (torso, belt, boots,
    // hair, ...) gets its own independent outline, so seams between parts show up as
    // unwanted internal lines. Testing against a shared "has any body part drawn
    // here" stencil mask instead means the outline can only ever appear in the
    // background region just outside the character's combined silhouette.
    stencilWrite: true,
    stencilRef: 1,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilZPass: THREE.KeepStencilOp,
    stencilFail: THREE.KeepStencilOp,
    stencilZFail: THREE.KeepStencilOp,
    vertexShader: CORE_AURA_VERTEX_SHADER,
    fragmentShader: CORE_AURA_FRAGMENT_SHADER
});
// Lets three.js define USE_SKINNING (and upload bone matrices) for whichever shells
// get built as THREE.SkinnedMesh — see the matching #include chunks in the vertex
// shader above. No effect on shells built as plain THREE.Mesh (static bodies).
shellMaterial.skinning = true;
const shellMeshes = [];

function applyCoreAuraGui() {
    const f = gui.addFolder('Core Aura');
    f.add(SHELL, 'enabled').name('Enable');
    // Range kept wide (0.0005-0.15, not the original tool's tighter 0.02 cap) —
    // the newer, more detailed rigged character imports need visibly more push
    // than the original simple test dummy to read as one clean, consistent line
    // rather than getting buried in fine surface detail. No onChange handlers
    // needed anywhere in this function — core-aura-editor.html's animate()
    // loop calls syncCoreAuraUniforms every frame (on the template AND every
    // per-mesh clone), the same pattern the rest of this project already
    // uses, which also means the "Reset to Tuned Defaults" button picks
    // these up for free without needing its own separate sync call.
    f.add(SHELL, 'pushAmount', 0.0005, 0.15).name('Outline Thickness (thin hug)');
    f.addColor(SHELL, 'color').name('Color (core / near body)');
    f.addColor(SHELL, 'colorEdge').name('Color (edge / bulge tips)');
    f.add(SHELL, 'opacity', 0, 1).name('Opacity');

    const fCloud = f.addFolder('Aura Cloud Shape');
    fCloud.add(SHELL, 'cloudAmp', 0, 1.5).name('Size (how far it bulges out)');
    // Raised from 3 to 12 — "higher amounts" of detail (many small blobs
    // instead of a few big ones) needs a much higher frequency ceiling than
    // the original range allowed.
    fCloud.add(SHELL, 'cloudFreq', 0.05, 12).name('Detail (low=few big blobs, high=many small)');
    // Raised from 2 to 15 — same idea, more headroom for fast drift.
    fCloud.add(SHELL, 'cloudSpeed', 0, 15).name('Drift/Breathing Speed');
    fCloud.add(SHELL, 'topBias', 0.2, 4).name('Top Bias (bigger near head/shoulders)');
    fCloud.add(SHELL, 'bottomBias', 0.2, 4).name('Bottom Bias (smaller near calves/feet)');
    fCloud.add(SHELL, 'flowDirection', { 'Plain Vertical Rise': 'vertical', 'Converge (both sides up & inward to top-center)': 'converge' }).name('Flow Direction');
    fCloud.add(SHELL, 'flowSpeed', 0, 15).name('Flow Speed (converge mode)');
    fCloud.add(SHELL, 'flameSharpness', 1, 6).name('Flame Sharpness (1=round, higher=pointed tips)');

    const fRise = f.addFolder('Rise & Fade (rises like fire, then dissipates into smoke)');
    fRise.add(SHELL, 'riseFadeAmp', 0, 1).name('Amount');
    fRise.add(SHELL, 'driftAmp', 0, 1).name('Lateral Drift (0 = off, meanders side to side)');
    fRise.addColor(SHELL, 'smokeColor').name('Smoke Color');
    fRise.add(SHELL, 'smokeAmount', 0, 1).name('Smoke Tint Amount');

    return f;
}
