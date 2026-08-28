// ============================================================================
// FLEXABLE SHAPE AURA — the full-featured hugging-aura shader, driving a 2D
// DOM element
//
// This does NOT reimplement the aura's noise/shading math — it loads
// core-aura-code.js's shared HUGGING_AURA_VERTEX_SHADER/FRAGMENT_SHADER and
// buildHuggingAuraUniforms/buildHuggingAuraGui/sync as-is, and runs them on a
// small WebGL scene of its own: an orthographic camera whose units are
// literal CSS pixels, and one flat, FILLED, rounded-rect mesh per target
// element (built from roundedRectPoint()'s ring of points, fan-triangulated
// from a center vertex). The vertex shader pushes every vertex outward along
// its normal by pushAmount + noise*noiseAmp + ..., completely unaware it
// isn't running on a 3D body. Its OWN config (FLEX_AURA_DEFAULTS, below) is
// a full standalone copy of every field that shader/those functions read —
// it used to be derived live from core-aura-code.js's SHELL object, but
// SHELL was stripped down to a handful of fields when the 3D character aura
// was rebuilt from scratch, so this file no longer depends on SHELL's shape
// at all (this is now the only place that shader's full noise/spike/glow
// capability is actually exercised).
//
// MASKING: the 3D scene uses a stencil buffer so the shell only shows up
// where it pokes out past the real character's silhouette. There's no
// stencil buffer here — instead the canvas sits BEHIND the real DOM element
// in z-order (see the host page's CSS), so the element's own opaque
// background naturally covers the inner, unwanted part of the pushed-out
// shell. Same effect, ordinary DOM compositing instead of a stencil test.
//
// See flex-shape-aura-INTEGRATION.md for what the host page needs to
// provide (a canvas, load order, CSS z-index) and README-INTEGRATION.md for
// the shared "one THREE instance" / global-name notes both layers follow.
// ============================================================================

// SHELL's shader reads these two globals (see syncHuggingAuraUniforms in
// core-aura-code.js) to sculpt the periodic-spike/width-envelope system by
// height-phase. Core Aura keeps periodicSpikeAmp at 0, so heightPhase never
// actually affects anything here — these just need to exist. Skip declaring
// these if the host page already has its own modelGroundY/TARGET_HEIGHT
// from also running the 3D Core Aura (they're shared/reused as-is, not
// namespaced, matching core-aura-code.js's own global-variable convention).
let modelGroundY = 0;
let TARGET_HEIGHT = 1;

// ---- rounded-rect perimeter parametrization --------------------------------
// Returns {x, y, nx, ny} in local coordinates centered on the rect (0,0 =
// center), for perimeter parameter t in [0,1) — walks top, top-right arc,
// right, bottom-right arc, bottom, bottom-left arc, left, top-left arc, each
// segment's share of t proportional to its arc length.
function roundedRectPoint(t, w, h, r) {
    const halfW = w / 2, halfH = h / 2;
    r = Math.max(0, Math.min(r, halfW, halfH));
    const cx = halfW - r, cy = halfH - r;
    const straightW = Math.max(0, w - 2 * r);
    const straightH = Math.max(0, h - 2 * r);
    const arcLen = (Math.PI / 2) * r;
    const perim = 2 * straightW + 2 * straightH + 4 * arcLen || 1;

    let d = ((t % 1) + 1) % 1 * perim;
    const segs = [
        ['top', straightW], ['tr', arcLen], ['right', straightH], ['br', arcLen],
        ['bottom', straightW], ['bl', arcLen], ['left', straightH], ['tl', arcLen]
    ];
    for (let i = 0; i < segs.length; i++) {
        const [type, len] = segs[i];
        if (d <= len || i === segs.length - 1) {
            const local = len > 0 ? d / len : 0;
            return segPoint(type, local, halfW, halfH, cx, cy, r);
        }
        d -= len;
    }
}
function segPoint(type, local, halfW, halfH, cx, cy, r) {
    switch (type) {
        case 'top':    return { x: -cx + local * 2 * cx, y: -halfH, nx: 0, ny: -1 };
        case 'right':  return { x: halfW, y: -cy + local * 2 * cy, nx: 1, ny: 0 };
        case 'bottom': return { x: cx - local * 2 * cx, y: halfH, nx: 0, ny: 1 };
        case 'left':   return { x: -halfW, y: cy - local * 2 * cy, nx: -1, ny: 0 };
        case 'tr': { const a = -Math.PI / 2 + local * (Math.PI / 2); return arcPoint(cx, -cy, r, a); }
        case 'br': { const a = 0 + local * (Math.PI / 2);            return arcPoint(cx, cy, r, a); }
        case 'bl': { const a = Math.PI / 2 + local * (Math.PI / 2);  return arcPoint(-cx, cy, r, a); }
        case 'tl': { const a = Math.PI + local * (Math.PI / 2);      return arcPoint(-cx, -cy, r, a); }
    }
}
function arcPoint(ccx, ccy, r, angle) {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    return { x: ccx + r * cos, y: ccy + r * sin, nx: cos, ny: sin };
}

// ---- triangle perimeter parametrization ------------------------------------
// Isoceles triangle inscribed in the bounding box: apex at top-center, base
// corners at bottom-left/bottom-right. If you use this shape on the host
// site, give the target element a matching
// `clip-path: polygon(50% 0%, 100% 100%, 0% 100%)` so its own opaque shape
// lines up exactly with what this generates (required for the "canvas sits
// behind the DOM element" masking trick to hide the right part of the
// shell). Each of the 3 straight edges gets a t-share proportional to its
// own length, and its outward normal is the constant perpendicular of its
// edge vector (dy,-dx) — consistently outward because apex->right->left->apex
// is a fixed winding order.
function trianglePoint(t, w, h) {
    const halfW = w / 2, halfH = h / 2;
    const apex = { x: 0, y: -halfH }, right = { x: halfW, y: halfH }, left = { x: -halfW, y: halfH };
    const edges = [{ a: apex, b: right }, { a: right, b: left }, { a: left, b: apex }];
    const lens = edges.map(e => Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y) || 1);
    const perim = lens[0] + lens[1] + lens[2] || 1;

    let d = ((t % 1) + 1) % 1 * perim;
    for (let i = 0; i < edges.length; i++) {
        if (d <= lens[i] || i === edges.length - 1) {
            const local = d / lens[i];
            const e = edges[i];
            const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
            const len = lens[i];
            return { x: e.a.x + dx * local, y: e.a.y + dy * local, nx: dy / len, ny: -dx / len };
        }
        d -= lens[i];
    }
}

// ---- one shared WebGL scene, one orthographic camera in literal CSS-pixel
// units (world X/Y == screen X/Y, origin top-left, matching
// getBoundingClientRect) ----------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('flex-aura-canvas'), alpha: true, antialias: true });
renderer.setClearColor(0x000000, 0);
const scene = new THREE.Scene();
// near/far are DISTANCES from the camera along its view direction (not raw
// world-Z values) — camera sits at z=100 looking toward -Z (Three.js default
// camera orientation), meshes live at z=0, i.e. 100 units away, so near must
// be < 100 and far > 100.
const camera = new THREE.OrthographicCamera(0, window.innerWidth, 0, window.innerHeight, 0.1, 1000);
camera.position.z = 100;
function resizeFlexAuraRenderer() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.right = window.innerWidth;
    camera.bottom = window.innerHeight;
    camera.updateProjectionMatrix();
}
resizeFlexAuraRenderer();
window.addEventListener('resize', resizeFlexAuraRenderer);

const FLEX_AURAS = [];
const flexAuraClock = new THREE.Clock();

// Every field here used to be inherited live from SHELL (Object.assign({},
// SHELL, {...})) — Core Aura's own config in core-aura-code.js. SHELL was
// stripped down to just {enabled, pushAmount, color, opacity} when the 3D
// character aura was rebuilt from scratch, so this file now carries its OWN
// full copy of every field HUGGING_AURA_VERTEX_SHADER/FRAGMENT_SHADER and
// buildHuggingAuraUniforms/buildHuggingAuraGui actually read (those shared
// functions/shaders in core-aura-code.js are UNCHANGED — this is the only
// consumer still using their full capability) — plus the handful of 2D-only
// mesh settings (auraScale/segments/cornerRadius) that have no 3D
// counterpart. One world-unit-per-pixel reference: an element whose own
// (width+height)/2 equals FLEX_TARGET_SIZE*<its auraScale> reads at
// "standard" thickness/bump density. Used by resolveAuraScale() below to
// auto-derive a scale from each target's OWN size — the exact same
// normalization idea as the 3D layer's TARGET_HEIGHT (see
// README-INTEGRATION.md's "Scale mismatch" section): there, any raw model
// height gets rescaled so these numbers always apply consistently; here, any
// element size gets its own auraScale derived so the same numbers apply
// consistently too, with NO per-box manual tuning required. 0.3 was picked
// to reproduce roughly the same look this project's demo shapes (~90-340px)
// had under the old fixed auraScale:450.
const FLEX_TARGET_SIZE = 0.3;

// auraScale is 'auto' by default (per-element, see above) — pass a number
// via createFlexAura's overrides to fix it manually instead, or use
// auraScaleMultiplier to scale the auto value up/down uniformly without
// losing the auto-fit-to-size behavior (1 = unchanged, 2 = twice as thick
// on every element, etc.).
const FLEX_AURA_DEFAULTS = {
    enabled: true,
    pushAmount: 0.005,
    color: '#ff0000',
    opacity: 1,
    noiseAmp: 0.01,
    noiseFreq: 1,
    noiseSpeed: 5,
    spikiness: 8,
    color2: '#ffffff',
    color3: '#ff00aa',
    pulseSpeed: 0,
    pulseAmp: 0,
    flowDirection: 'converge',
    flowSpeed: 0.25,
    warpAmp: 0,
    warpFreq: 0.05,
    warpSpeed: 0,
    chaosAmp: 0.00378,
    chaosFreq: 10.89,
    chaosSpeed: 5,
    bumpWidth: 0.50148,
    bumpRoundness: 0.4,
    distortAmp: 0,
    distortFreq: 0.2,
    distortSpeed: 0.5,
    dissolveAmp: 0,
    dissolveFreq: 0.5,
    dissolveSpeed: 0.5,
    randomSeed: 0,
    bumpRandomizeSpeed: 0,
    periodicSpikeCount: 2,
    periodicSpikeSharpness: 1,
    periodicSpikeBulge: 0.6,
    periodicSpikeCoverage: 1,
    periodicSpikeSkew: -0.9,
    periodicSpikeTipWidth: 0,
    periodicSpikeRoundness: 0,
    periodicSpikeAmp: 0,
    periodicSpikeChaos: 0,
    periodicSpikeRotSpeed: 0,
    subSpikes: 0,
    subSpikeLength: 0,
    jaggednessVariance: 0,
    angleBias: 0,
    asymmetryAngle: 0,
    spikeCurve: 0,
    widthApex: 1,
    widthUpper: 1,
    yPosUpper: 0.25,
    widthCore: 1,
    yPosCore: 0.5,
    widthLower: 1,
    yPosLower: 0.75,
    widthBase: 1,
    widthTransitionCurve: 1,
    widthSmoothness: false,
    baseFlare: 0,
    bottomRounding: 0,
    topStretch: 1,
    bottomSquash: 1,
    timeOffset: 0,
    fluidity: 0,
    wavinessFreq: 1,
    wavinessAmp: 0,
    flutterSpeed: 0,
    flutterAmp: 0,
    erosionAmp: 0,
    erosionFreq: 1,
    opacityFalloff: -0.4,
    opacityGradientPower: 1,
    flickerSpeed: 0,
    flickerIntensity: 0,
    useGradient: false,
    gradientCoreColor: '#ffffff',
    gradientEdgeColor: '#ffffff',
    auraScale: 'auto',
    auraScaleMultiplier: 1,
    segments: 96,
    cornerRadius: 0,
    // 'auto' = rounded-rect from the element's own getBoundingClientRect +
    // CSS border-radius (a plain rect, a rounded rect, or — at radius =
    // half the smaller side, e.g. border-radius:50% on a square — a true
    // circle, all for free from the same code path). 'triangle' switches to
    // trianglePoint() instead, for elements that aren't rect-shaped at all.
    shape: 'auto'
};

// Resolves cfg.auraScale for this frame: a number is used as-is (manual
// override, ignores auraScaleMultiplier entirely since you've already
// picked an exact value); 'auto' derives one from the target's own current
// size, then applies auraScaleMultiplier as a uniform artistic adjustment
// on top.
function resolveAuraScale(cfg, rect) {
    if (typeof cfg.auraScale === 'number') return cfg.auraScale;
    const avgSize = (rect.width + rect.height) / 2;
    const auto = avgSize > 0 ? avgSize / FLEX_TARGET_SIZE : 450;
    return auto * (cfg.auraScaleMultiplier || 1);
}

// Call once per target element: createFlexAura(document.querySelector('#myButton'), { ...overrides })
// Returns { config, destroy() } — config is a live clone of FLEX_AURA_DEFAULTS.
// Mutate its fields directly at any time and the next frame picks it up.
// destroy() removes it and frees its
// geometry/material.
function createFlexAura(targetEl, overrides) {
    const config = Object.assign({}, FLEX_AURA_DEFAULTS, overrides || {});
    const uniforms = buildHuggingAuraUniforms(config);
    const material = new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        vertexShader: HUGGING_AURA_VERTEX_SHADER,
        fragmentShader: HUGGING_AURA_FRAGMENT_SHADER
    });
    const geometry = new THREE.BufferGeometry();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 1;
    scene.add(mesh);

    const aura = { targetEl, config, uniforms, material, geometry, mesh };
    FLEX_AURAS.push(aura);
    return {
        config,
        destroy() {
            scene.remove(mesh);
            geometry.dispose();
            material.dispose();
            const i = FLEX_AURAS.indexOf(aura);
            if (i >= 0) FLEX_AURAS.splice(i, 1);
        }
    };
}

// Rebuilds one aura's mesh geometry (position/normal buffers, fan-
// triangulated from a center vertex) from its target element's CURRENT
// bounding box — raw vertex coordinates are the box's pixels DIVIDED by the
// resolved auraScale (so the shader's noise, which samples raw `position`
// directly, sees a small, human-mesh-like coordinate range), and the mesh's
// own scale is set to that SAME auraScale so the final on-screen size still
// matches the element's real pixel footprint exactly (auraScale cancels out
// of the base size — it only changes how many world-units the shape spans,
// i.e. how the noise/displacement read, same role camera zoom plays in the
// 3D scene). Recomputed every frame (via resolveAuraScale), not cached —
// picks up the element's current size automatically if it resizes/reflows.
function rebuildFlexAuraGeometry(aura) {
    const cfg = aura.config;
    const rect = aura.targetEl.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) { aura.mesh.visible = false; return; }

    const cs = getComputedStyle(aura.targetEl);
    const autoRadius = parseFloat(cs.borderTopLeftRadius) || 0;
    const radiusPx = cfg.cornerRadius > 0 ? cfg.cornerRadius : autoRadius;

    const s = resolveAuraScale(cfg, rect);
    const rawW = rect.width / s, rawH = rect.height / s, rawR = radiusPx / s;
    const pointAt = cfg.shape === 'triangle'
        ? (t) => trianglePoint(t, rawW, rawH)
        : (t) => roundedRectPoint(t, rawW, rawH, rawR);

    const n = Math.max(8, Math.round(cfg.segments));
    const vertCount = n + 2; // ring points + center
    const positions = new Float32Array(vertCount * 3);
    const normals = new Float32Array(vertCount * 3);
    const indices = new Uint16Array(n * 3);

    positions[0] = 0; positions[1] = 0; positions[2] = 0;
    normals[0] = 0; normals[1] = 0; normals[2] = 0;
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        const p = pointAt(t);
        const vi = (i + 1) * 3;
        // roundedRectPoint already returns y-down coordinates (top edge = -halfH,
        // "up"), and the camera below (top:0, bottom:height) is likewise set up
        // y-down to match CSS — so local Y is used as-is, no sign flip needed.
        positions[vi] = p.x; positions[vi + 1] = p.y; positions[vi + 2] = 0;
        normals[vi] = p.nx; normals[vi + 1] = p.ny; normals[vi + 2] = 0;
    }
    for (let i = 0; i < n; i++) {
        indices[i * 3] = 0;
        indices[i * 3 + 1] = i + 1;
        indices[i * 3 + 2] = i + 2;
    }

    aura.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    aura.geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    aura.geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    aura.geometry.attributes.position.needsUpdate = true;
    aura.geometry.attributes.normal.needsUpdate = true;

    // Camera has top=0 (matching CSS's y-down convention), so mesh.position
    // in (screenX, screenY) lands exactly where the element's own center is.
    aura.mesh.position.set(rect.left + rect.width / 2, rect.top + rect.height / 2, 0);
    aura.mesh.scale.set(s, s, 1);
    aura.mesh.visible = cfg.enabled;
}

function flexAuraLoop() {
    const time = flexAuraClock.getElapsedTime();
    for (const aura of FLEX_AURAS) {
        if (!aura.config.enabled) { aura.mesh.visible = false; continue; }
        rebuildFlexAuraGeometry(aura);
        syncHuggingAuraUniforms(aura.config, aura.uniforms, time);
    }
    renderer.render(scene, camera);
    requestAnimationFrame(flexAuraLoop);
}
requestAnimationFrame(flexAuraLoop);
