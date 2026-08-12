// CORE AURA — CODE
// The mesh-hugging inverted-hull outline. This is real 3D geometry (a cloned
// shell per body mesh, pushed outward along vertex normals), which is why it
// correctly tracks any rotation/pose of the model — unlike the flat Layer 1/2/3
// canvas billboards. See layers/core-aura-apply.js for how the shell
// material/meshes actually get created and attached to the loaded model.
const SHELL = {
    enabled: true,
    pushAmount: 0.005,
    color: '#ff0000',
    opacity: 1,
    // Main bump layer — layered spatial noise displaces the outline outward on top
    // of the base push, animated over time. Spatially driven by the mesh's own
    // vertex positions (not screen-space), so the bumps stay attached to the body
    // surface and travel correctly with it as it rotates.
    noiseAmp: 0.01,
    noiseFreq: 1,
    noiseSpeed: 5,
    spikiness: 8,
    color2: '#ffffff',
    // Mid-layer color for the 3-stop stroke→mid→tip blend: `color` is the stroke
    // itself (right at the base push, no bump), `color3` is the layer just below
    // the stroke, `color2` is the layer below that / the outer bump tips.
    color3: '#ff00aa',
    pulseSpeed: 0,
    pulseAmp: 0,
    // Which direction the noise pattern travels across the surface: 'left'/'right'
    // slide sideways; 'converge' folds left and right onto the same coordinate so
    // both sides travel inward while also rising, meeting at the top-center. Has its
    // own dedicated speed (not tied to noiseSpeed/warpSpeed) so it can never be
    // accidentally silenced by another slider.
    flowDirection: 'converge',
    flowSpeed: 0.25,
    // SECOND BUMP LAYER: an independent noise layer at its own size/speed, drifting
    // upward over time — a second, separately-tunable set of bumps layered on top
    // of the main one above.
    warpAmp: 0,
    warpFreq: 0.05,
    warpSpeed: 0,
    // RANDOM PATCHES: quantizes the surface into discrete blocky cells, each with
    // its own flat random height — genuinely uneven sizes next to each other
    // (hard edges between cells), not smooth blended noise.
    chaosAmp: 0.00378,
    chaosFreq: 10.89,
    chaosSpeed: 5,
    // WIDTH / ROUNDNESS: shape controls for the main bump layer above — see the
    // shader comments for exactly what each does.
    bumpWidth: 0.50148,
    bumpRoundness: 0.4,
    // BLOTCHES: large organic random regions, positive bulges out / negative
    // carves in. Defaults to 0 (no effect) so it doesn't change the current look
    // until raised. distortFreq is low (big blotches) by default — raise it for
    // many small blotches instead of a few large ones.
    distortAmp: 0,
    distortFreq: 0.2,
    distortSpeed: 0.5,
    // DISSOLVE: fragment-level holes (a real discard, not shape/geometry) at
    // random moving locations -- reveals what is behind instead of texturing the
    // surface. Defaults to 0 so it's off until raised.
    dissolveAmp: 0,
    dissolveFreq: 0.5,
    dissolveSpeed: 0.5,
    // A per-reload/reroll offset baked into the sample coordinate — hit "Randomize
    // Shape" to get a differently-arranged (but equally coherent) pattern without
    // touching any other slider.
    randomSeed: 0,
    // Periodically jumps the main bump layer to a whole new random arrangement
    // (a new random offset every 1/bumpRandomizeSpeed seconds) so bumps read as
    // rising from different, unpredictable locations instead of always the same
    // anatomical spots. 0 = off (bumps only drift via Sideways Drift, as before).
    bumpRandomizeSpeed: 0,
    // Periodic spike system — an unused-by-default capability of this shader
    // (periodicSpikeAmp stays at 0 so it has zero effect and Core Aura's
    // look/behavior is unchanged); kept in case a future spiky look is wanted.
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
    // Remaining shape-control fields — all zero/neutral so they have no effect here.
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
    gradientEdgeColor: '#ffffff'
};
const SHELL_FLOW_MODES = { left: 0, right: 1, converge: 2 };

// Shared shader source for any "mesh-hugging" material — the toon outline and any
// additional hugging aura layers (like NEW AURA LAYER 1 below) all use this same
// vertex/fragment logic, just with their own independent uniforms objects and their
// own pushAmount/noise scale, so a thin outline and a thick flame shell are really
// the same technique at different settings.
const HUGGING_AURA_VERTEX_SHADER = `
            uniform float pushAmount;
            uniform float noiseAmp;
            uniform float noiseFreq;
            uniform float noiseSpeed;
            uniform float spikiness;
            uniform float time;
            uniform int flowMode;
            uniform float flowSpeed;
            uniform float warpAmp;
            uniform float warpFreq;
            uniform float warpSpeed;
            uniform float chaosAmp;
            uniform float chaosFreq;
            uniform float chaosSpeed;
            uniform float randomSeed;
            uniform float bumpRandomizeSpeed;
            uniform float bumpWidth;
            uniform float bumpRoundness;
            uniform float distortAmp;
            uniform float distortFreq;
            uniform float distortSpeed;
            // PERIODIC SPIKES — the same spike-profile mechanism CONFIG.layer1 uses on the
            // 2D canvas (spikeCount/Sharpness/Bulge/Coverage/Skew/TipWidth/Roundness), ported
            // to 3D and driven by the vertex's angle around the character's own vertical axis
            // (in world space, so it forms one continuous ring across every body mesh instead
            // of a separate pattern per mesh). Defaults to periodicSpikeAmp = 0 wherever this
            // shader is used for the Core Aura, so that material's look is unchanged.
            uniform float periodicSpikeCount;
            uniform float periodicSpikeSharpness;
            uniform float periodicSpikeBulge;
            uniform float periodicSpikeCoverage;
            uniform float periodicSpikeSkew;
            uniform float periodicSpikeTipWidth;
            uniform float periodicSpikeRoundness;
            uniform float periodicSpikeAmp;
            uniform float periodicSpikeChaos;
            uniform float periodicSpikeRotSpeed;
            // The rest of CONFIG.layer1's shape controls, ported to 3D. All default to
            // no-op values (0, or 1 where a multiplier) for the Core Aura so its look
            // stays unchanged — see the SHELL config object in JS.
            uniform float subSpikes;
            uniform float subSpikeLength;
            uniform float jaggednessVariance;
            uniform float angleBias;
            uniform float asymmetryAngle;
            uniform float spikeCurve;
            uniform float widthApex;
            uniform float widthUpper;
            uniform float yPosUpper;
            uniform float widthCore;
            uniform float yPosCore;
            uniform float widthLower;
            uniform float yPosLower;
            uniform float widthBase;
            uniform float widthTransitionCurve;
            uniform float widthSmoothness;
            uniform float baseFlare;
            uniform float bottomRounding;
            uniform float topStretch;
            uniform float bottomSquash;
            uniform float timeOffset;
            uniform float fluidity;
            uniform float wavinessFreq;
            uniform float wavinessAmp;
            uniform float flutterSpeed;
            uniform float flutterAmp;
            uniform float erosionAmp;
            uniform float erosionFreq;
            uniform float modelGroundY;
            uniform float modelHeight;
            varying float vNoise;
            varying vec3 vWorldPos;

            float hashNoise(vec3 p) {
                return sin(p.x * 12.9898 + p.y * 78.233 + p.z * 37.719) * 0.5 + 0.5;
            }
            // A second, deliberately uncorrelated hash (different magic constants) so
            // the chaos layer never lines up with the main spike pattern above.
            float hashNoise2(vec3 p) {
                return sin(p.x * 39.346 + p.y * 11.135 + p.z * 83.155) * 0.5 + 0.5;
            }

            // Direct GLSL port of the JS getWidthAtPhase()/CONFIG.layer1 width envelope: a
            // 5-point piecewise curve (apex/upper/core/lower/base) sculpting a width
            // multiplier by height phase (0 = top/head, 1 = bottom/feet, matching layer1's
            // yPhase convention). Points are defensively sorted since the y-position sliders
            // can be set out of order.
            float getWidthAtPhase(float phase, float wApex, float wUpper, float yUpper, float wCore, float yCore, float wLower, float yLower, float wBase, float curveP, float smoothFlag) {
                float y0 = 0.0; float w0 = wApex;
                float y1 = clamp(yUpper, 0.001, 0.999); float w1 = wUpper;
                float y2 = clamp(yCore, 0.001, 0.999); float w2 = wCore;
                float y3 = clamp(yLower, 0.001, 0.999); float w3 = wLower;
                float y4 = 1.0; float w4 = wBase;

                if (y1 > y2) { float ty = y1; y1 = y2; y2 = ty; float tw = w1; w1 = w2; w2 = tw; }
                if (y2 > y3) { float ty = y2; y2 = y3; y3 = ty; float tw = w2; w2 = w3; w3 = tw; }
                if (y1 > y2) { float ty = y1; y1 = y2; y2 = ty; float tw = w1; w1 = w2; w2 = tw; }

                float py = clamp(phase, 0.0, 1.0);
                float t;
                float rW;
                if (py <= y1) {
                    t = (y1 - y0) > 0.0001 ? (py - y0) / (y1 - y0) : 0.0;
                    t = pow(clamp(t, 0.0, 1.0), curveP);
                    if (smoothFlag > 0.5) t = t * t * (3.0 - 2.0 * t);
                    rW = mix(w0, w1, t);
                } else if (py <= y2) {
                    t = (y2 - y1) > 0.0001 ? (py - y1) / (y2 - y1) : 0.0;
                    t = pow(clamp(t, 0.0, 1.0), curveP);
                    if (smoothFlag > 0.5) t = t * t * (3.0 - 2.0 * t);
                    rW = mix(w1, w2, t);
                } else if (py <= y3) {
                    t = (y3 - y2) > 0.0001 ? (py - y2) / (y3 - y2) : 0.0;
                    t = pow(clamp(t, 0.0, 1.0), curveP);
                    if (smoothFlag > 0.5) t = t * t * (3.0 - 2.0 * t);
                    rW = mix(w2, w3, t);
                } else {
                    t = (y4 - y3) > 0.0001 ? (py - y3) / (y4 - y3) : 0.0;
                    t = pow(clamp(t, 0.0, 1.0), curveP);
                    if (smoothFlag > 0.5) t = t * t * (3.0 - 2.0 * t);
                    rW = mix(w3, w4, t);
                }
                return rW;
            }

            // Direct GLSL port of the JS getSpikeProfile()/CONFIG.layer1 spike math: a
            // periodic triangular pulse repeated count times per full turn, reshaped by
            // bulge (plateau fraction) and sharpness (taper exponent), optionally rounded.
            float spikeProfile(float angle, float count, float skew, float sharpness, float bulge, float coverage, float tipWidth, float roundness) {
                float TAU = 6.28318530718;
                float phase = mod((angle * count) / TAU, 1.0);
                if (phase < 0.0) phase += 1.0;
                if (phase > coverage) return 0.0;
                float localPhase = phase / coverage;

                float peak = 0.5 + skew * 0.45;
                float t;
                if (localPhase < peak) {
                    t = localPhase / peak;
                } else {
                    t = 1.0 - ((localPhase - peak) / (1.0 - peak));
                }

                if (t > (1.0 - tipWidth)) {
                    t = 1.0;
                } else {
                    t = t / max(0.0001, 1.0 - tipWidth);
                }

                float plateau = clamp(bulge, 0.0, 0.95);
                float taperT;
                if (t > (1.0 - plateau)) {
                    taperT = 1.0;
                } else {
                    taperT = t / max(0.0001, 1.0 - plateau);
                }

                float sharpExponent = 0.35 + max(0.0, sharpness) * 4.0;
                float profile = pow(clamp(taperT, 0.0, 1.0), sharpExponent);

                if (roundness > 0.0) {
                    float roundedProfile = sin(taperT * 1.5707963);
                    profile = profile * (1.0 - roundness) + roundedProfile * roundness;
                }
                return profile;
            }

            void main() {
                // FLOW: shifts the coordinate the noise is sampled at over time, so the
                // spike pattern actually travels across the surface instead of just
                // flickering in place. left/right slide the sample point sideways;
                // converge folds left/right onto the same coordinate (abs) so both sides
                // travel inward together, combined with an upward shift, so energy
                // appears to rise from both sides and meet at the top-center.
                vec3 flowPos = position + vec3(randomSeed, randomSeed * 1.7, randomSeed * 0.6);
                if (flowMode == 0) {
                    flowPos.x += time * flowSpeed;
                } else if (flowMode == 1) {
                    flowPos.x -= time * flowSpeed;
                } else {
                    flowPos.x = abs(position.x) + time * flowSpeed * 0.6;
                    flowPos.y = position.y - time * flowSpeed * 0.6;
                }

                // RANDOM RESPAWN: without this, the main bump noise below is a fixed
                // function of vertex position — flow only slides that fixed pattern
                // sideways/upward, so bumps always rise from the same anatomical spots
                // (e.g. always the same shoulder/hip locations), just drifting predictably.
                // This adds a large per-interval random offset to the sample coordinate —
                // a new random offset picked every 1/bumpRandomizeSpeed seconds (same
                // "reshuffle at a steady cadence" trick the Random Dissipation/chaos layer
                // already uses below) — so the bump pattern periodically jumps to an
                // entirely different arrangement, reading as bumps rising from new random
                // locations instead of always the same ones. 0 = off (exact original
                // behavior, no offset).
                vec3 respawnOffset = vec3(0.0);
                if (bumpRandomizeSpeed > 0.0) {
                    float respawnSeed = floor(time * bumpRandomizeSpeed);
                    respawnOffset = vec3(
                        hashNoise(vec3(respawnSeed, 11.3, 5.1)) * 40.0,
                        hashNoise(vec3(respawnSeed, 47.7, 8.4)) * 40.0,
                        hashNoise(vec3(respawnSeed, 91.1, 2.6)) * 40.0
                    );
                }
                vec3 warpedPos = flowPos + respawnOffset;

                // Three-octave layered noise (cheap fBm), so it reads as a coherent
                // flame/energy texture riding on the surface rather than per-vertex static.
                float n = 0.0;
                float amp = 1.0;
                float freq = noiseFreq;
                for (int i = 0; i < 3; i++) {
                    n += hashNoise(warpedPos * freq + float(i) * 17.0) * amp;
                    freq *= 1.9;
                    amp *= 0.5;
                }
                n /= 1.75;

                // BLOTCHES (was "Distortion" — a coordinate-warp that just blurred the
                // main noise and didn't read as anything distinct). This is a large,
                // low-frequency noise field, thresholded with smoothstep so it forms
                // irregular rounded ISLANDS rather than a grid (Random Patches, below) or
                // a swirl — genuine organic blotches. Added directly to the final
                // displacement rather than shaping the main bump, so it visibly reshapes
                // the silhouette instead of just texturing it. Amount can go negative to
                // carve the blotches IN (gaps/erosion) instead of bulging OUT.
                float blotchNoise = 0.0;
                {
                    float bAmp = 1.0;
                    float bFreq = distortFreq;
                    for (int i = 0; i < 2; i++) {
                        blotchNoise += hashNoise(flowPos * bFreq + time * distortSpeed * 0.3 + float(i) * 23.0) * bAmp;
                        bFreq *= 2.1;
                        bAmp *= 0.5;
                    }
                    blotchNoise /= 1.5;
                }
                float blotch = smoothstep(0.55, 0.85, blotchNoise) * distortAmp;

                // WIDTH: remaps the noise so only values above a threshold produce any
                // bump at all — at bumpWidth=1 (default) every value counts, same as
                // before; lower values raise the threshold, so fewer/narrower bumps show
                // through and more of the surface stays flat in between (wide gaps,
                // narrow bumps) instead of the whole surface being covered in texture.
                float nWide = clamp((n - (1.0 - bumpWidth)) / max(0.001, bumpWidth), 0.0, 1.0);

                // SPIKINESS: pow() reshapes the noise into sharp isolated peaks (spikes/
                // flame tongues) at high values, or a gentle rolling wave at low values.
                float shaped = pow(nWide, spikiness);

                // ROUNDNESS: blends the pow()-shaped profile toward a smooth sine curve,
                // which caps off at the top instead of tapering to a point — 0 = whatever
                // Spikiness produced, 1 = fully rounded regardless of Spikiness.
                if (bumpRoundness > 0.0) {
                    float roundedProfile = sin(nWide * 1.5707963);
                    shaped = shaped * (1.0 - bumpRoundness) + roundedProfile * bumpRoundness;
                }
                vNoise = shaped;

                // BUMP LAYER (was "Distortion"/"Flame"): a second, independent smooth
                // noise layer, sampled at its own size and drifting upward over time.
                // Kept deliberately soft (low exponent, not the sharp pow() the base
                // spike layer uses) so it reads as rolling/rounded bumps rather than
                // spikes — the earlier version chained a hash-of-a-hash into a sin()
                // phase per point, which is not spatially smooth and produced jagged,
                // spike-like artifacts instead of soft motion. This is plain single-
                // layer value noise, nothing fancier.
                float bumpSample = hashNoise(flowPos * warpFreq + vec3(0.0, -time * warpSpeed, 0.0));
                float flame = pow(clamp(bumpSample, 0.0, 1.0), 1.6) * warpAmp;

                // RANDOMNESS: was "Chaos" — a smoothly-drifting second noise layer that
                // still blended continuously into its neighbors, so it never actually
                // looked "random," just like more texture. Replaced with a cell-based
                // random field: floor() quantizes the surface into discrete blocks, each
                // getting its own flat random height with a hard edge against its
                // neighbor (genuinely different sizes next to each other, not a smooth
                // gradient), and chaosSpeed reshuffles which random layout is showing at
                // a steady cadence — a new random arrangement every ~1/chaosSpeed
                // seconds — instead of continuously drifting.
                vec3 randomCell = floor(flowPos * chaosFreq) + floor(time * chaosSpeed) * 13.7;
                float randomVariance = hashNoise(randomCell) * chaosAmp;

                float chaos = flame + randomVariance + blotch;

                // PERIODIC SPIKES: computed from the vertex's WORLD-space angle around the
                // character's vertical (Y) axis — using world space (not this mesh's own
                // local space) means every body mesh (torso, arms, hair, boots, ...) reads
                // the same continuous angle, so the count spikes form one coherent ring
                // around the whole character instead of a separate broken pattern per mesh.
                float layerTime = time + timeOffset;
                vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;

                // HEIGHT PHASE: 0 at the top of the model (head), 1 at the bottom (feet) —
                // matches CONFIG.layer1's yPhase convention exactly, so the width envelope
                // and top/bottom controls below sculpt the same regions layer1's do.
                float heightPhase = clamp(1.0 - (worldPos.y - modelGroundY) / max(0.0001, modelHeight), 0.0, 1.0);
                bool isTop = heightPhase < 0.5;

                float spikeAngle = atan(worldPos.z, worldPos.x) + layerTime * periodicSpikeRotSpeed + angleBias + asymmetryAngle;
                spikeAngle += sin(spikeAngle * 12.0) * periodicSpikeChaos * 0.1;

                float mainSpikeProfile = spikeProfile(
                    spikeAngle, periodicSpikeCount, periodicSpikeSkew, periodicSpikeSharpness,
                    periodicSpikeBulge, periodicSpikeCoverage, periodicSpikeTipWidth, periodicSpikeRoundness
                );

                // SUB-SPIKES: a finer, faster secondary spike pattern riding on top of (and
                // scaled by) the main spikes — the same fractal-detail idea as layer1's
                // subSpikes/subSpikeLength.
                float subSpikeProfile = 0.0;
                if (subSpikes > 0.0) {
                    float rawSub = spikeProfile(
                        spikeAngle, periodicSpikeCount * subSpikes, periodicSpikeSkew, periodicSpikeSharpness * 0.5,
                        1.0, 1.0, 0.0, periodicSpikeRoundness
                    );
                    subSpikeProfile = rawSub * subSpikeLength * mainSpikeProfile;
                }

                float spikeSum = mainSpikeProfile + subSpikeProfile;

                // WIDTH ENVELOPE: the 5-point apex/upper/core/lower/base sculpting curve,
                // multiplying the spike amplitude by height — lets the shape be fuller at
                // the chest and taper at the legs (or any custom profile), like layer1.
                float widthMod = getWidthAtPhase(
                    heightPhase, widthApex, widthUpper, yPosUpper, widthCore, yPosCore,
                    widthLower, yPosLower, widthBase, widthTransitionCurve, widthSmoothness
                );
                if (heightPhase > 0.8) {
                    float flareT = (heightPhase - 0.8) / 0.2;
                    widthMod += pow(flareT, 2.0) * baseFlare;
                }

                // TOP STRETCH / BOTTOM SQUASH / BOTTOM ROUNDING: since this shell can only
                // exist on the body's own surface (it can't extend past the mesh like the 2D
                // canvas flame can above the head), these act as an amplitude multiplier by
                // region instead of true geometric extension — taller values near the top
                // read as the flame "reaching") while bottomRounding suppresses spikes near
                // the very bottom, matching layer1's base-suppressor behavior.
                float regionAmp = isTop ? topStretch : bottomSquash;
                if (!isTop && bottomRounding > 0.0) {
                    float distFromBottomApex = abs(heightPhase - 1.0);
                    float suppression = min(1.0, distFromBottomApex / 0.35);
                    spikeSum *= ((1.0 - bottomRounding) + bottomRounding * suppression);
                }

                float spike = spikeSum * periodicSpikeAmp * widthMod * max(0.0, regionAmp);

                // JAGGEDNESS: a static (non-flickering) per-vertex hash, unlike the 2D
                // canvas's per-frame Math.random() — a per-frame random re-roll would look
                // like flickering static on a 3D surface rather than a rough edge texture.
                float jaggedness = hashNoise(worldPos * 40.0) * jaggednessVariance;

                // FLUIDITY / FLUTTER: extra traveling sine waves layered on the angle,
                // matching layer1's wavinessFreq/Amp and flutterSpeed/Amp terms.
                float fluid = sin(spikeAngle * wavinessFreq + layerTime * fluidity) * wavinessAmp;
                float flutter = sin(spikeAngle * 100.0 + layerTime * flutterSpeed) * flutterAmp;

                // SPIKE CURVE: bends the tips by adding a height-weighted term, echoing
                // layer1's curveModifier (top-hemisphere-only bend).
                float curveTerm = isTop ? abs(0.5 - heightPhase) * 2.0 * spikeCurve * spike : 0.0;

                if (!isTop) {
                    fluid *= (0.2 + bottomRounding * 0.5);
                    jaggedness *= (1.0 - bottomRounding * 0.6);
                }

                // EROSION: randomly carves the spike back down where a secondary wave dips
                // below its midline — same technique as the 2D layers' erosion.
                float erosionNoiseVal = sin(spikeAngle * erosionFreq + layerTime * 2.0) * 0.5 + 0.5;
                float erosion = erosionNoiseVal < 0.5 ? (0.5 - erosionNoiseVal) * erosionAmp : 0.0;

                // Note: jaggedness/fluid/flutter/erosion/baseFlare are all configured in the
                // same small world-unit scale as pushAmount/periodicSpikeAmp directly (not
                // layer1's canvas-pixel scale), so they combine here with no rescaling.

                float periodicSpike = spike + jaggedness + fluid + flutter + curveTerm - erosion;
                vNoise = clamp(max(vNoise, spikeSum * 0.6), 0.0, 1.0);

                vec3 displaced = position + normal * (pushAmount + shaped * noiseAmp + chaos + periodicSpike);

                vWorldPos = worldPos;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
            }
        `;
const HUGGING_AURA_FRAGMENT_SHADER = `
            uniform vec3 uColor;
            uniform vec3 uColor2;
            uniform vec3 uColor3;
            uniform float uOpacity;
            uniform float pulseSpeed;
            uniform float pulseAmp;
            uniform float time;
            uniform float opacityFalloff;
            uniform float opacityGradientPower;
            uniform float flickerSpeed;
            uniform float flickerIntensity;
            uniform float useGradient;
            uniform vec3 gradientCoreColor;
            uniform vec3 gradientEdgeColor;
            uniform float dissolveAmp;
            uniform float dissolveFreq;
            uniform float dissolveSpeed;
            varying float vNoise;
            varying vec3 vWorldPos;

            // A cheap deterministic pseudo-random value from screen position + time, used
            // only for the flicker term below (a per-frame Math.random() equivalent).
            float screenRandom(vec2 co, float t) {
                return fract(sin(dot(co, vec2(12.9898, 78.233)) + t * 43.0) * 43758.5453);
            }

            // Cheap sine-based rainbow — no HSV conversion needed, just three sine waves
            // 120 degrees out of phase.
            // Same hash as the vertex shader's hashNoise() — duplicated because vertex
            // and fragment shaders are separate programs and can't share GLSL functions.
            float hashNoiseFrag(vec3 p) {
                return sin(p.x * 12.9898 + p.y * 78.233 + p.z * 37.719) * 0.5 + 0.5;
            }

            void main() {
                // DISSOLVE: punches actual holes in the surface (a real discard, not just
                // fading alpha) at random moving world-space locations — reveals whatever
                // is behind (the character model, or empty space) rather than shaping or
                // texturing the outline itself. Categorically different from every effect
                // above: this changes what's VISIBLE per-pixel, not the geometry's shape,
                // so it can't be described as "another noise bump" — it reads as a
                // hologram glitching in and out of existence, or a Thanos-snap dissolve.
                if (dissolveAmp > 0.0) {
                    float dissolveNoise = hashNoiseFrag(vWorldPos * dissolveFreq + vec3(time * dissolveSpeed * 0.3));
                    if (dissolveNoise < dissolveAmp) discard;
                }

                // Blend across THREE colors (not two) using the same noise value that drove
                // the spike/bump displacement: uColor right at the stroke itself (vNoise=0,
                // no bump), uColor3 for the layer just below the stroke (vNoise=0.5), uColor2
                // for the layer below that / at the outer tips (vNoise=1). Two half-range
                // mixes chained together, so hotter/taller bumps shift through all three
                // colors in order rather than jumping straight from base to tip. useGradient
                // still swaps in gradientCore/EdgeColor as a plain 2-stop pair instead (that
                // toggle is unrelated to this 3-stop stroke/mid/tip system).
                vec3 col;
                if (useGradient > 0.5) {
                    col = mix(gradientCoreColor, gradientEdgeColor, vNoise);
                } else if (vNoise < 0.5) {
                    col = mix(uColor, uColor3, vNoise * 2.0);
                } else {
                    col = mix(uColor3, uColor2, (vNoise - 0.5) * 2.0);
                }
                float pulse = 1.0 + sin(time * pulseSpeed) * pulseAmp;

                // OPACITY FALLOFF: one unified control instead of separate center/edge
                // opacity values. Positive = solid at center (low vNoise, near the body),
                // fading toward transparent at the edge (high vNoise, spike tips). Negative
                // = the reverse (hollow center, solid edge). Zero = flat, uniform opacity.
                float alpha = uOpacity;
                if (abs(opacityFalloff) > 0.001) {
                    float g = pow(vNoise, opacityGradientPower);
                    float centerOp = opacityFalloff > 0.0 ? uOpacity : uOpacity * (1.0 + opacityFalloff);
                    float edgeOp = opacityFalloff > 0.0 ? uOpacity * (1.0 - opacityFalloff) : uOpacity;
                    alpha = mix(centerOp, edgeOp, g);
                }

                // FLICKER: randomly dims per-pixel at flickerSpeed's rate — matching
                // layer1's flickerIntensity * random * sin(time*flickerSpeed) term.
                if (flickerIntensity > 0.0) {
                    float r = screenRandom(gl_FragCoord.xy, floor(time * max(0.001, flickerSpeed)));
                    alpha *= (1.0 - r * flickerIntensity * abs(sin(time * flickerSpeed)));
                }

                gl_FragColor = vec4(col * pulse, max(0.0, alpha));
            }
        `;
// Builds a uniforms object matching a config object's fields (must share the same
// property names as HUGGING_AURA_VERTEX/FRAGMENT_SHADER's uniforms).
function buildHuggingAuraUniforms(cfg) {
    return {
        pushAmount: { value: cfg.pushAmount },
        noiseAmp: { value: cfg.noiseAmp },
        noiseFreq: { value: cfg.noiseFreq },
        noiseSpeed: { value: cfg.noiseSpeed },
        spikiness: { value: cfg.spikiness },
        time: { value: 0 },
        flowMode: { value: SHELL_FLOW_MODES[cfg.flowDirection] },
        flowSpeed: { value: cfg.flowSpeed },
        warpAmp: { value: cfg.warpAmp },
        warpFreq: { value: cfg.warpFreq },
        warpSpeed: { value: cfg.warpSpeed },
        chaosAmp: { value: cfg.chaosAmp },
        chaosFreq: { value: cfg.chaosFreq },
        chaosSpeed: { value: cfg.chaosSpeed },
        randomSeed: { value: cfg.randomSeed },
        bumpRandomizeSpeed: { value: cfg.bumpRandomizeSpeed },
        bumpWidth: { value: cfg.bumpWidth },
        bumpRoundness: { value: cfg.bumpRoundness },
        distortAmp: { value: cfg.distortAmp },
        distortFreq: { value: cfg.distortFreq },
        distortSpeed: { value: cfg.distortSpeed },
        dissolveAmp: { value: cfg.dissolveAmp },
        dissolveFreq: { value: cfg.dissolveFreq },
        dissolveSpeed: { value: cfg.dissolveSpeed },
        periodicSpikeCount: { value: cfg.periodicSpikeCount },
        periodicSpikeSharpness: { value: cfg.periodicSpikeSharpness },
        periodicSpikeBulge: { value: cfg.periodicSpikeBulge },
        periodicSpikeCoverage: { value: cfg.periodicSpikeCoverage },
        periodicSpikeSkew: { value: cfg.periodicSpikeSkew },
        periodicSpikeTipWidth: { value: cfg.periodicSpikeTipWidth },
        periodicSpikeRoundness: { value: cfg.periodicSpikeRoundness },
        periodicSpikeAmp: { value: cfg.periodicSpikeAmp },
        periodicSpikeChaos: { value: cfg.periodicSpikeChaos },
        periodicSpikeRotSpeed: { value: cfg.periodicSpikeRotSpeed },
        subSpikes: { value: cfg.subSpikes },
        subSpikeLength: { value: cfg.subSpikeLength },
        jaggednessVariance: { value: cfg.jaggednessVariance },
        angleBias: { value: cfg.angleBias },
        asymmetryAngle: { value: cfg.asymmetryAngle },
        spikeCurve: { value: cfg.spikeCurve },
        widthApex: { value: cfg.widthApex },
        widthUpper: { value: cfg.widthUpper },
        yPosUpper: { value: cfg.yPosUpper },
        widthCore: { value: cfg.widthCore },
        yPosCore: { value: cfg.yPosCore },
        widthLower: { value: cfg.widthLower },
        yPosLower: { value: cfg.yPosLower },
        widthBase: { value: cfg.widthBase },
        widthTransitionCurve: { value: cfg.widthTransitionCurve },
        widthSmoothness: { value: cfg.widthSmoothness ? 1 : 0 },
        baseFlare: { value: cfg.baseFlare },
        bottomRounding: { value: cfg.bottomRounding },
        topStretch: { value: cfg.topStretch },
        bottomSquash: { value: cfg.bottomSquash },
        timeOffset: { value: cfg.timeOffset },
        fluidity: { value: cfg.fluidity },
        wavinessFreq: { value: cfg.wavinessFreq },
        wavinessAmp: { value: cfg.wavinessAmp },
        flutterSpeed: { value: cfg.flutterSpeed },
        flutterAmp: { value: cfg.flutterAmp },
        erosionAmp: { value: cfg.erosionAmp },
        erosionFreq: { value: cfg.erosionFreq },
        modelGroundY: { value: 0 },
        modelHeight: { value: 1 },
        uColor: { value: new THREE.Color(cfg.color) },
        uColor2: { value: new THREE.Color(cfg.color2) },
        uColor3: { value: new THREE.Color(cfg.color3) },
        uOpacity: { value: cfg.opacity },
        pulseSpeed: { value: cfg.pulseSpeed },
        pulseAmp: { value: cfg.pulseAmp },
        opacityFalloff: { value: cfg.opacityFalloff },
        opacityGradientPower: { value: cfg.opacityGradientPower },
        flickerSpeed: { value: cfg.flickerSpeed },
        flickerIntensity: { value: cfg.flickerIntensity },
        useGradient: { value: cfg.useGradient ? 1 : 0 },
        gradientCoreColor: { value: new THREE.Color(cfg.gradientCoreColor) },
        gradientEdgeColor: { value: new THREE.Color(cfg.gradientEdgeColor) }
    };
}
// Syncs a uniforms object's live values from its config object every frame.
function syncHuggingAuraUniforms(cfg, uniforms, time) {
    uniforms.pushAmount.value = cfg.pushAmount;
    uniforms.noiseAmp.value = cfg.noiseAmp;
    uniforms.noiseFreq.value = cfg.noiseFreq;
    uniforms.noiseSpeed.value = cfg.noiseSpeed;
    uniforms.spikiness.value = cfg.spikiness;
    uniforms.flowMode.value = SHELL_FLOW_MODES[cfg.flowDirection];
    uniforms.flowSpeed.value = cfg.flowSpeed;
    uniforms.warpAmp.value = cfg.warpAmp;
    uniforms.warpFreq.value = cfg.warpFreq;
    uniforms.warpSpeed.value = cfg.warpSpeed;
    uniforms.chaosAmp.value = cfg.chaosAmp;
    uniforms.chaosFreq.value = cfg.chaosFreq;
    uniforms.chaosSpeed.value = cfg.chaosSpeed;
    uniforms.randomSeed.value = cfg.randomSeed;
    uniforms.bumpRandomizeSpeed.value = cfg.bumpRandomizeSpeed;
    uniforms.bumpWidth.value = cfg.bumpWidth;
    uniforms.bumpRoundness.value = cfg.bumpRoundness;
    uniforms.distortAmp.value = cfg.distortAmp;
    uniforms.distortFreq.value = cfg.distortFreq;
    uniforms.distortSpeed.value = cfg.distortSpeed;
    uniforms.dissolveAmp.value = cfg.dissolveAmp;
    uniforms.dissolveFreq.value = cfg.dissolveFreq;
    uniforms.dissolveSpeed.value = cfg.dissolveSpeed;
    uniforms.periodicSpikeCount.value = cfg.periodicSpikeCount;
    uniforms.periodicSpikeSharpness.value = cfg.periodicSpikeSharpness;
    uniforms.periodicSpikeBulge.value = cfg.periodicSpikeBulge;
    uniforms.periodicSpikeCoverage.value = cfg.periodicSpikeCoverage;
    uniforms.periodicSpikeSkew.value = cfg.periodicSpikeSkew;
    uniforms.periodicSpikeTipWidth.value = cfg.periodicSpikeTipWidth;
    uniforms.periodicSpikeRoundness.value = cfg.periodicSpikeRoundness;
    uniforms.periodicSpikeAmp.value = cfg.periodicSpikeAmp;
    uniforms.periodicSpikeChaos.value = cfg.periodicSpikeChaos;
    uniforms.periodicSpikeRotSpeed.value = cfg.periodicSpikeRotSpeed;
    uniforms.subSpikes.value = cfg.subSpikes;
    uniforms.subSpikeLength.value = cfg.subSpikeLength;
    uniforms.jaggednessVariance.value = cfg.jaggednessVariance;
    uniforms.angleBias.value = cfg.angleBias;
    uniforms.asymmetryAngle.value = cfg.asymmetryAngle;
    uniforms.spikeCurve.value = cfg.spikeCurve;
    uniforms.widthApex.value = cfg.widthApex;
    uniforms.widthUpper.value = cfg.widthUpper;
    uniforms.yPosUpper.value = cfg.yPosUpper;
    uniforms.widthCore.value = cfg.widthCore;
    uniforms.yPosCore.value = cfg.yPosCore;
    uniforms.widthLower.value = cfg.widthLower;
    uniforms.yPosLower.value = cfg.yPosLower;
    uniforms.widthBase.value = cfg.widthBase;
    uniforms.widthTransitionCurve.value = cfg.widthTransitionCurve;
    uniforms.widthSmoothness.value = cfg.widthSmoothness ? 1 : 0;
    uniforms.baseFlare.value = cfg.baseFlare;
    uniforms.bottomRounding.value = cfg.bottomRounding;
    uniforms.topStretch.value = cfg.topStretch;
    uniforms.bottomSquash.value = cfg.bottomSquash;
    uniforms.timeOffset.value = cfg.timeOffset;
    uniforms.fluidity.value = cfg.fluidity;
    uniforms.wavinessFreq.value = cfg.wavinessFreq;
    uniforms.wavinessAmp.value = cfg.wavinessAmp;
    uniforms.flutterSpeed.value = cfg.flutterSpeed;
    uniforms.flutterAmp.value = cfg.flutterAmp;
    uniforms.erosionAmp.value = cfg.erosionAmp;
    uniforms.erosionFreq.value = cfg.erosionFreq;
    uniforms.modelGroundY.value = modelGroundY;
    uniforms.modelHeight.value = TARGET_HEIGHT;
    uniforms.time.value = time;
    uniforms.uColor.value.set(cfg.color);
    uniforms.uColor2.value.set(cfg.color2);
    uniforms.uColor3.value.set(cfg.color3);
    uniforms.uOpacity.value = cfg.opacity;
    uniforms.pulseSpeed.value = cfg.pulseSpeed;
    uniforms.pulseAmp.value = cfg.pulseAmp;
    uniforms.opacityFalloff.value = cfg.opacityFalloff;
    uniforms.opacityGradientPower.value = cfg.opacityGradientPower;
    uniforms.flickerSpeed.value = cfg.flickerSpeed;
    uniforms.flickerIntensity.value = cfg.flickerIntensity;
    uniforms.useGradient.value = cfg.useGradient ? 1 : 0;
    uniforms.gradientCoreColor.value.set(cfg.gradientCoreColor);
    uniforms.gradientEdgeColor.value.set(cfg.gradientEdgeColor);
}

// Builds the full control set (thickness/color/spike/warp/chaos/flow) for any
// "mesh-hugging" material — used for the Core Aura (see layers/core-aura-apply.js).
function buildHuggingAuraGui(folderTitle, cfg, pushLabel, pushRange, includePeriodicSpikes) {
    const f = gui.addFolder(folderTitle);
    f.add(cfg, 'enabled').name('Enable');
    f.add(cfg, 'pushAmount', pushRange[0], pushRange[1]).name(pushLabel);
    f.addColor(cfg, 'color').name('Color 1 (stroke)');
    f.addColor(cfg, 'color3').name('Color 2 (below stroke)');
    f.addColor(cfg, 'color2').name('Color 3 (below that / tips)');
    f.add(cfg, 'opacity', 0, 1).name('Opacity');

    // Plain, literal labels below — each says exactly what it moves, not what
    // "look" it's supposed to produce. Combine them yourself to find a look,
    // rather than trusting a named effect (e.g. "Flame") to already be it.
    const fFx = f.addFolder('Bump Layer (main)');
    fFx.add(cfg, 'noiseAmp', 0, 0.3).name('Bump Height');
    fFx.add(cfg, 'noiseFreq', 0.5, 40).name('Bump Size (low=few big, high=many small)');
    fFx.add(cfg, 'noiseSpeed', 0, 10).name('Bump Shimmer Speed');
    fFx.add(cfg, 'spikiness', 0.2, 8).name('Bump Sharpness (low=round, high=thin spikes)');
    fFx.add(cfg, 'bumpWidth', 0.02, 4).name('Bump Width (low=narrow+gaps, high=thick/solid coverage)');
    fFx.add(cfg, 'bumpRoundness', 0, 1).name('Bump Roundness (caps the top off, ignores Sharpness)');
    fFx.add(cfg, 'flowDirection', { 'Flow Left': 'left', 'Flow Right': 'right', 'Converge Upward (L+R → Center)': 'converge' }).name('Sideways Drift Direction');
    fFx.add(cfg, 'flowSpeed', 0, 8).name('Sideways Drift Speed');
    fFx.add(cfg, 'pulseSpeed', 0, 10).name('Whole-Outline Pulse Speed (grow/shrink)');
    fFx.add(cfg, 'pulseAmp', 0, 1).name('Whole-Outline Pulse Amount');
    fFx.add(cfg, 'bumpRandomizeSpeed', 0, 2).name('Random Respawn Speed (jump bumps to new spots)');

    fFx.close();

    // SECOND BUMP LAYER: an independent, softer noise layer riding on top of the
    // main one, drifting upward — combine with the main layer for more complex
    // rolling/flame-like surface motion.
    const fWarp = f.addFolder('Second Bump Layer (soft, drifts upward)');
    fWarp.add(cfg, 'warpAmp', 0, 0.05).name('Amount');
    fWarp.add(cfg, 'warpFreq', 0.05, 5).name('Size (low=few big, high=many small)');
    fWarp.add(cfg, 'warpSpeed', 0, 10).name('Upward Drift Speed');
    fWarp.close();

    // RANDOM DISSIPATION: cell-based random field that reshuffles which cells are
    // "lit" at a steady cadence — genuinely random patches popping in and out of
    // existence over time (not a smooth drifting gradient), plus large organic
    // blotches and true fragment-level holes (actual transparency, not just
    // displacement) for parts of the outline visibly vanishing and reappearing.
    const fChaos = f.addFolder('Random Dissipation');
    fChaos.add(cfg, 'chaosAmp', 0, 0.03).name('Random Cells: Amount');
    fChaos.add(cfg, 'chaosFreq', 1, 100).name('Random Cells: Size (low=few big, high=many small)');
    fChaos.add(cfg, 'chaosSpeed', 0, 30).name('Random Cells: Reshuffle Speed');
    fChaos.add(cfg, 'distortAmp', -0.03, 0.03).name('Blotches: Amount (neg = carve in)');
    fChaos.add(cfg, 'distortFreq', 0.2, 10).name('Blotches: Size (low=few big, high=many small)');
    fChaos.add(cfg, 'distortSpeed', 0, 5).name('Blotches: Drift Speed');
    fChaos.add(cfg, 'dissolveAmp', 0, 1).name('Fragment Holes: Amount (real transparency)');
    fChaos.add(cfg, 'dissolveFreq', 0.5, 20).name('Fragment Holes: Size');
    fChaos.add(cfg, 'dissolveSpeed', 0, 10).name('Fragment Holes: Movement Speed');
    fChaos.close();

    // TRANSLUCENT GLOW: dense/opaque near the body fading to translucent haze at
    // the outer edge, with a color wash from a pale core hue to a saturated edge
    // hue — the "soft plasma hugging the silhouette" look (as opposed to a flat
    // single-color line), plus a subtle per-pixel flicker/shimmer.
    const fGlow = f.addFolder('Translucent Glow (Opacity & Color Gradient)');
    fGlow.add(cfg, 'opacityFalloff', -1, 1).name('Opacity Falloff (+ = solid body → transparent edge)');
    fGlow.add(cfg, 'opacityGradientPower', 0.1, 5).name('Falloff Curve');
    fGlow.add(cfg, 'useGradient').name('Use Gradient Colors (core→edge, not base/tip)');
    fGlow.addColor(cfg, 'gradientCoreColor').name('Gradient Core Color');
    fGlow.addColor(cfg, 'gradientEdgeColor').name('Gradient Edge Color');
    fGlow.add(cfg, 'flickerSpeed', 0, 20).name('Flicker Speed');
    fGlow.add(cfg, 'flickerIntensity', 0, 1).name('Flicker Intensity');
    fGlow.close();

    // Layer1's actual spike mechanism (spikeCount/Sharpness/Bulge/Coverage/Skew/
    // TipWidth/Roundness), ported to 3D — only exposed for layers that use it
    // meaningfully (kept at zero-effect defaults elsewhere, e.g. Core Aura).
    if (includePeriodicSpikes) {
        const fPeriodic = f.addFolder('Layer1-Style Spikes (periodic, count-based)');
        fPeriodic.add(cfg, 'periodicSpikeCount', 1, 40).step(1).name('Spike Count');
        fPeriodic.add(cfg, 'periodicSpikeAmp', 0, 0.6).name('Spike Height');
        fPeriodic.add(cfg, 'periodicSpikeSharpness', 0, 3).name('Tip Sharpness (Soft ↔ Pointed)');
        fPeriodic.add(cfg, 'periodicSpikeBulge', 0, 1).name('Spike Fullness (Needle ↔ Fat/Blunt)');
        fPeriodic.add(cfg, 'periodicSpikeCoverage', 0.01, 1).name('Spike Thickness (Thin ↔ Solid/Merged)');
        fPeriodic.add(cfg, 'periodicSpikeSkew', -0.99, 0.99).name('Spike Angle/Skew');
        fPeriodic.add(cfg, 'periodicSpikeTipWidth', 0, 0.99).name('Tip Width (Bluntness)');
        fPeriodic.add(cfg, 'periodicSpikeRoundness', 0, 1).name('Spike Roundness (Pointed ↔ Blobby)');
        fPeriodic.add(cfg, 'periodicSpikeChaos', 0, 10).name('Spike Chaos (Irregular)');
        fPeriodic.add(cfg, 'periodicSpikeRotSpeed', -5, 5).name('Rotation Speed (sign = direction)');
        fPeriodic.add(cfg, 'angleBias', -Math.PI, Math.PI).name('Angle Bias (rotate whole pattern)');
        fPeriodic.add(cfg, 'asymmetryAngle', -1, 1).name('Asymmetry (wind lean)');
        fPeriodic.add(cfg, 'timeOffset', 0, 60).name('Time Offset (phase)');
        fPeriodic.close();

        const fSub = f.addFolder('Sub-Spikes & Detail');
        fSub.add(cfg, 'subSpikes', 0, 10).step(1).name('Fractal Sub-Spikes');
        fSub.add(cfg, 'subSpikeLength', 0, 150).name('Sub-Spike Length');
        fSub.add(cfg, 'jaggednessVariance', 0, 0.1).name('Micro Jaggedness');
        fSub.add(cfg, 'spikeCurve', -2, 2).name('Spike Curve (Bend)');
        fSub.close();

        const fWidth = f.addFolder('Width Envelope (5-Point Sculpting)');
        fWidth.add(cfg, 'widthApex', 0, 20).name('Width: Apex (Top Tip)');
        fWidth.add(cfg, 'widthUpper', 0, 20).name('Width: Upper (Chest)');
        fWidth.add(cfg, 'yPosUpper', 0.01, 0.99).name('Y-Pos: Upper (Chest)');
        fWidth.add(cfg, 'widthCore', 0, 20).name('Width: Core (Waist)');
        fWidth.add(cfg, 'yPosCore', 0.01, 0.99).name('Y-Pos: Core (Waist)');
        fWidth.add(cfg, 'widthLower', 0, 20).name('Width: Lower (Legs)');
        fWidth.add(cfg, 'yPosLower', 0.01, 0.99).name('Y-Pos: Lower (Legs)');
        fWidth.add(cfg, 'widthBase', 0, 20).name('Width: Base (Floor)');
        fWidth.add(cfg, 'widthTransitionCurve', 0.1, 10).name('Width Falloff Curve');
        fWidth.add(cfg, 'widthSmoothness').name('Smooth Transitions');
        fWidth.add(cfg, 'baseFlare', 0, 0.1).name('Floor Flare Spread');
        fWidth.close();

        const fVertical = f.addFolder('Top/Bottom Shaping');
        fVertical.add(cfg, 'topStretch', 0, 6).name('Top Region Amplitude');
        fVertical.add(cfg, 'bottomSquash', 0, 6).name('Bottom Region Amplitude');
        fVertical.add(cfg, 'bottomRounding', 0, 1).name('🎁 Round Base (Droplet profile)');
        fVertical.close();

        const fMotion2 = f.addFolder('Fluidity, Flutter & Erosion');
        fMotion2.add(cfg, 'fluidity', 0, 20).name('Fluidity');
        fMotion2.add(cfg, 'wavinessFreq', 0, 20).name('Waviness Frequency');
        fMotion2.add(cfg, 'wavinessAmp', 0, 0.05).name('Waviness Amount');
        fMotion2.add(cfg, 'flutterSpeed', 0, 50).name('Flutter Speed');
        fMotion2.add(cfg, 'flutterAmp', 0, 0.05).name('Flutter Amount');
        fMotion2.add(cfg, 'erosionAmp', 0, 0.05).name('Edge Erosion Amount');
        fMotion2.add(cfg, 'erosionFreq', 0.1, 30).name('Edge Erosion Frequency');
        fMotion2.close();
    }

    f.close();
    return f;
}
