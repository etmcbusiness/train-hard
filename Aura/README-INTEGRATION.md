# Integrating these layers into another Three.js project

This folder was extracted from a single-file aura/outline editor
(`gemini-code-1783293950302.html`). Each visual system has a paired
`*-code.js` (its own config/logic, no side effects) and `*-apply.js` (the
calls that create real THREE.js objects, add them to a scene, and build a
lil-gui folder for it). Alongside each pair is a `*-INTEGRATION.md` file with
system-specific porting steps — read that file before touching that system's
code.

**Read this file first, then the specific `*-INTEGRATION.md` for whichever
layer you're porting.**

## Scale mismatch — do this BEFORE touching any layer's numbers

Every layer's tuned defaults (`SHELL.pushAmount`, `SHELL.noiseAmp`,
`ENERGY_PARTICLES.riseSpeed`, Smoke/Sparks' rise/respawn thresholds, etc.) are
**absolute world-space numbers**, not relative to the model. They were all
tuned assuming the character is `TARGET_HEIGHT = 6.6` scene units tall. If the
host model is loaded at its native GLB scale (commonly close to 1 unit tall,
or anything else), every one of those numbers will be proportionally wrong —
outlines too thin/thick, particles never reaching their respawn threshold,
etc. **Do not hand-rescale individual fields.** Instead, normalize the
model's own scale once at load time, exactly like the original project does
(`gemini-code-1783293950302.html`, inside its `gltfLoader.load(...)`
callback) — then every number in every layer file works completely unchanged:

```js
const TARGET_HEIGHT = 6.6; // must match the value these layers were tuned against — don't change this

const rawBox = new THREE.Box3().setFromObject(hostModel);
const rawHeight = rawBox.max.y - rawBox.min.y;
const autoScale = rawHeight > 0 ? TARGET_HEIGHT / rawHeight : 1;
hostModel.scale.setScalar(autoScale);

// Re-measure AFTER scaling/rotating (an axis-aligned box isn't rotation-invariant)
const scaledBox = new THREE.Box3().setFromObject(hostModel);
const modelGroundY = -scaledBox.min.y; // feet at y=0
hostModel.position.y = modelGroundY;
```

This is the one and only fix needed regardless of the host model's native
size — a 0.98-unit-tall model and a 180-unit-tall model both end up rendered
at exactly 6.6 units tall, so `SHELL.pushAmount = 0.005` (and every other
tuned constant across every layer) looks identical on either. Do this once,
before creating the Toon Outline shell / Energy Particles / Smoke / Sparks —
they all read `modelGroundY` and `TARGET_HEIGHT`, which must reflect the
*scaled* model, not the raw GLB.

If for some reason you truly cannot rescale the host model itself (e.g. its
size is load-bearing for physics/collision elsewhere in the host app), the
fallback is manual per-field rescaling — multiply every amplitude-type field
(`pushAmount`, `noiseAmp`, `warpAmp`, `chaosAmp`, `distortAmp`,
`periodicSpikeAmp`, `jaggednessVariance`, `wavinessAmp`, `flutterAmp`,
`erosionAmp`, spark/smoke/energy rise speeds and spreads) by
`measuredModelHeight / TARGET_HEIGHT`, and every frequency-type field
(`noiseFreq`, `warpFreq`, `chaosFreq`, `distortFreq`, `dissolveFreq`,
`erosionFreq`) by the inverse. This is error-prone by hand — prefer the
model-normalization approach above.

## Before touching any layer

1. **One Three.js instance.** The host project already has its own `THREE`.
   Do not load a second copy — every file below assumes `THREE` is already a
   global (or is passed in), pointing at the SAME instance the host's own
   scene/renderer use. Mixing two separate THREE instances causes silent
   breakage (e.g. `instanceof THREE.Mesh` checks failing).

2. **These files assume certain names exist already**, because in the
   original project they were plain global variables shared across
   `<script>` tags. When porting, you have two options — pick one and be
   consistent for a given layer:
   - **(a) Alias, fastest:** at the top of your integration code, declare
     `const scene = hostScene; const auraAnchor = hostCharacterGroup;` etc.,
     matching the exact names the file expects (listed in each
     `*-INTEGRATION.md`). Zero changes to the copied files.
   - **(b) Parameterize, cleaner:** edit the copied file to take these as
     function arguments instead of reading them as globals. More work, but
     avoids polluting the host's global scope and makes reuse (e.g. two
     characters on screen) possible.

3. **Two files share state across systems, listed here since they don't
   belong to any single layer:**
   - `aura-canvas-layers-common.js` — required by Layer 1, Layer 2, AND
     Layer 3 together. They draw onto ONE shared canvas/texture/pair of
     billboard planes in sequence each frame (`updateAura()` calls
     `drawAuraLayer()` three times) — you cannot port just one numbered
     layer without this file, and you cannot give each layer its own
     separate canvas without rewriting `drawAuraLayer`/`updateAura`.
   - `particle-sprite-common.js` — a small soft-dot sprite texture (`pCanvas`)
     shared by Smoke and Energy Particles. Needed by either.

4. **`CONFIG` is a shared namespace, not per-layer.** `CONFIG.particles`
   holds both Smoke's and Sparks' settings together (`smokeEnabled`,
   `sparkColor`, etc., all on one object) — this was a deliberate choice in
   the original project to avoid breaking a preset-JSON format already in
   use; don't assume splitting it further is required, just keep both
   systems reading/writing the same `CONFIG.particles` object.

5. **lil-gui is a dev/tuning panel, not something to ship to end users** by
   default. Either include lil-gui on the host site too (if you want live
   tuning there), or skip every `*-apply.js` function whose name ends in
   `Gui` and just hardcode the final tuned values from the `*-code.js`
   config object directly.

6. **Per-frame update calls** — whichever systems you port, call their
   update function once per frame from the host's own render loop (not a
   new separate loop):
   - Toon Outline: `syncHuggingAuraUniforms(SHELL, shellUniforms, time)` +
     `shellMeshes.forEach(s => s.visible = SHELL.enabled)`
   - Layer 1/2/3: `updateAura(time)` (draws all three that are `visible`)
   - Smoke / Sparks / Energy Particles: see each one's own
     `*-INTEGRATION.md` — these are small inline position-update loops in
     the original `animate()`, not yet factored into standalone functions.
