# Integrating these layers into another Three.js project

This folder was extracted from a single-file aura/outline editor
(`core-aura-editor.html`). Two visual systems are shipped here:
- **Core Aura** (the mesh-hugging toon outline on the 3D character) — see
  `core-aura-INTEGRATION.md`.
- **Flexable Shape Aura** (the same Core Aura shader, driving 2D DOM
  elements — buttons, boxes, cards — instead of a 3D body) — see
  `flex-shape-aura-INTEGRATION.md`. Extracted from
  `flexable-shape-aura.html` on 2026-08-12.

(Layer 1/2/3, Energy Particles, Smoke, and Sparks were removed from this
project entirely on 2026-07-12; if you need one of those systems again it
would have to be rebuilt from scratch, not restored from here. A second
attempt at an "Outer Aura" GLB-import Fresnel-shell system was built and
removed again on 2026-07-13 — the source GLB's mesh turned out to be missing
all Blender modifier detail, see `layers_file_split` memory for why.)

Core Aura has a paired `*-code.js` (its own config/logic, no side effects)
and `*-apply.js` (the calls that create real THREE.js objects, add them to a
scene, and build a lil-gui folder for it), PLUS a third file,
`core-aura-bloom.js` (extracted 2026-08-24 — was inline in
`core-aura-editor.html` before that, which is why earlier ports of this
project were missing it and rendered a glow-less flat outline; see
`AURA-LEVELS-INSTALL.md`). All three are required for the aura to look
correct — the bloom file is not optional polish, the reference "how it
should look" glow depends entirely on it. Flexable Shape Aura is a single
`flex-shape-aura-code.js` — it has no `*-apply.js` because "applying" it
IS the public API (`createFlexAura(element, overrides)`), not a one-time
scene-setup step to copy inline like Core Aura's body-mesh traversal.

**Read this file first, then whichever layer's own INTEGRATION.md you need.**

## Scale mismatch — do this BEFORE touching any layer's numbers

Core Aura's tuned defaults (`SHELL.pushAmount`, `SHELL.noiseAmp`, etc.) are
**absolute world-space numbers**, not relative to the model. They were all
tuned assuming the character is `TARGET_HEIGHT = 6.6` scene units tall. If the
host model is loaded at its native GLB scale (commonly close to 1 unit tall,
or anything else), every one of those numbers will be proportionally wrong —
the outline too thin/thick, etc. **Do not hand-rescale individual fields.**
Instead, normalize the model's own scale once at load time, exactly like the
original project does (`core-aura-editor.html`, inside its
`gltfLoader.load(...)` callback) — then every number in `core-aura-code.js`
works completely unchanged:

```js
const TARGET_HEIGHT = 6.6; // must match the value this layer was tuned against — don't change this

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
tuned constant) looks identical on either. Do this once, before creating the
Core Aura shell — it reads `modelGroundY` and `TARGET_HEIGHT`, which must
reflect the *scaled* model, not the raw GLB.

If for some reason you truly cannot rescale the host model itself (e.g. its
size is load-bearing for physics/collision elsewhere in the host app), the
fallback is manual per-field rescaling — multiply every amplitude-type field
(`pushAmount`, `noiseAmp`, `warpAmp`, `chaosAmp`, `distortAmp`,
`periodicSpikeAmp`, `jaggednessVariance`, `wavinessAmp`, `flutterAmp`,
`erosionAmp`) by `measuredModelHeight / TARGET_HEIGHT`, and every
frequency-type field (`noiseFreq`, `warpFreq`, `chaosFreq`, `distortFreq`,
`dissolveFreq`, `erosionFreq`) by the inverse. This is error-prone by hand —
prefer the model-normalization approach above.

## Before touching this layer

1. **One Three.js instance.** The host project already has its own `THREE`.
   Do not load a second copy — `core-aura-code.js`/`core-aura-apply.js` assume
   `THREE` is already a global (or is passed in), pointing at the SAME
   instance the host's own scene/renderer use. Mixing two separate THREE
   instances causes silent breakage (e.g. `instanceof THREE.Mesh` checks
   failing).

2. **These files assume certain names exist already**, because in the
   original project they were plain global variables shared across
   `<script>` tags. When porting, you have two options — pick one and be
   consistent:
   - **(a) Alias, fastest:** at the top of your integration code, declare
     `const scene = hostScene; const auraAnchor = hostCharacterGroup;` etc.,
     matching the exact names `core-aura-INTEGRATION.md` expects. Zero
     changes to the copied files.
   - **(b) Parameterize, cleaner:** edit the copied file to take these as
     function arguments instead of reading them as globals. More work, but
     avoids polluting the host's global scope and makes reuse (e.g. two
     characters on screen) possible.

3. **lil-gui is a dev/tuning panel, not something to ship to end users** by
   default. Either include lil-gui on the host site too (if you want live
   tuning there), or skip `applyCoreAuraGui()` and just hardcode the final
   tuned values from `core-aura-code.js`'s `SHELL` config object directly.

4. **Swapping presets (colors, shapes, whole looks) on the host site.** This
   project's "💾 EXPORT PRESET CODE" button dumps the entire current look as
   one named JSON object: `{ name, layerType, label, CONFIG, MODEL,
   MODEL_GLOW, SHELL, auraAnchor }` — `name` and `layerType` come from the
   "Preset Name" text field and "Preset Layer Type" dropdown in this
   project's GUI (set them before exporting), and `label` is just
   `"<layerType> - <name>"` for display. `preset-apply.js` provides:
   - `applyPreset(preset)` — merges the JSON into whichever config objects
     exist on the host site, safe to call with a partial preset (e.g. one
     that's only ever touched `SHELL`'s colors) since it skips anything
     missing instead of erroring.
   - `registerPreset(preset)` — files a preset into `PRESET_LIBRARY` under
     its own `layerType`/`name` (read straight off the JSON, nothing extra to
     pass).
   - `applyNamedPreset(layerType, name)` — looks up and applies a registered
     preset by its "Layer Type - Name", e.g.
     `applyNamedPreset('Core Aura', 'Fire')`.
   - `listPresetNames(layerType?)` — lists registered names (all of them, or
     just one layer type's) for building a picker UI.

   Workflow:
   1. Load `preset-apply.js` on the host site (no dependencies beyond the
      config objects it merges into already existing as globals).
   2. In this project, type a name and pick a layer type in the GUI, tune the
      look, click "EXPORT PRESET CODE", copy the JSON out of the textarea.
   3. On the host site: `registerPreset(<pasted JSON>);` for each saved
      preset (do this once, e.g. at startup, for every preset you have).
   4. To swap looks live: `applyNamedPreset('Core Aura', 'Fire')`. Call it
      from a dropdown/button built off `listPresetNames()`, on page load,
      whenever — it's just a plain function call, no special timing
      requirement beyond "after the target config objects (SHELL, MODEL,
      CONFIG, etc.) already exist."
   - Only include the sections of a preset you actually want to change — a
     preset JSON edited down to just `{ "SHELL": { "color": "#ff0000", ... } }`
     will swap colors only and leave shape/motion untouched (still give it a
     `name`/`layerType` if you want it findable via `registerPreset()`).

5. **Per-frame update call** — in the host's own render loop (not a new
   separate loop):
   ```js
   syncCoreAuraUniforms(SHELL, shellUniforms, time); // `time` = elapsed seconds
   shellMeshes.forEach(s => { s.visible = SHELL.enabled; });
   ```

6. **Applying a numbered "Level" preset** (Level 1 = off, Level 2 = the
   current tuned look, Level 3-5 = escalating intensity as they're tuned) —
   see `AURA-LEVELS-INSTALL.md` in this same folder. That doc is written to
   be handed to another AI/assistant working on a different project, so it's
   self-contained rather than assuming the reader has this file's context.
