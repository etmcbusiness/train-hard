# Aura Levels — complete install guide (for another AI/assistant working on a different project)

**Follow every step below IN ORDER. Do not skip Step 2 — it's the single
most common reason an installed aura ends up "thin and barely visible."**
This doc is fully self-contained: everything you need, including the exact
current settings for all 5 levels, is inlined below. You should not need to
open any other file to get this working.

All 5 levels exist and are ready to use:

| Level | Look |
|---|---|
| 1 | Off (no aura) |
| 2 | Gold/amber flame rising into pale blue smoke |
| 3 | Red/crimson flame rising into orange smoke |
| 4 | Cyan/blue flame rising into near-white smoke |
| 5 | Purple flame rising into dark purple smoke |

Levels 2-5 only differ in `SHELL.color`/`SHELL.colorEdge`/`SHELL.smokeColor`
— every other setting (shape, motion, bloom) is identical across all of them.

## What you're installing

A 3D outline/energy-shell effect that hugs a character model's real geometry
(not a flat 2D sprite/decal) plus a glow post-process pass. Two independent
pieces — **both are required**, or the result will look wrong in one of two
specific ways:

| Missing piece | What you'll see |
|---|---|
| Model scale not normalized (Step 2) | Aura renders **thin and barely visible** (or way too thick) — the shell's push/noise numbers are absolute world-space units tuned for a 6.6-unit-tall character; any other scale makes them proportionally wrong. |
| Bloom pass not installed (Step 5) | Aura renders as a **flat, crisp, glow-less outline** — no soft blur/glow at all. |

## Files to copy

Copy these 4 files from `layers new/` in this project into the target project,
exactly as-is, no edits:

- `core-aura-code.js`
- `core-aura-apply.js`
- `core-aura-bloom.js`
- `preset-apply.js`

(Ignore `flex-shape-aura-code.js`/`flex-shape-aura-INTEGRATION.md` if
present — that's a separate, unrelated system for 2D DOM elements.)

## Step 1 — load the files, in this order

```html
<script src="core-aura-code.js"></script>
<script src="core-aura-apply.js"></script>
<script src="core-aura-bloom.js"></script>
<script src="preset-apply.js"></script>
```

These must load AFTER your own `THREE`, `renderer`, `scene`, and `camera`
already exist (as real global variables — see "host site prerequisites"
below), because `core-aura-bloom.js` builds its render targets immediately
when it loads. `renderer` must NOT have its stencil buffer explicitly
disabled (`stencil: true` is Three.js's own default — just don't pass
`stencil: false` when constructing `WebGLRenderer`).

## Step 2 — normalize the character model's scale (DO NOT SKIP)

Every tuned number in `SHELL` (`pushAmount`, `cloudAmp`, etc.) is an
**absolute world-space size**, tuned assuming the character is exactly
**6.6 scene units tall**. If your model is loaded at any other height —
which it almost certainly is, since GLB imports commonly land close to
1-2 units tall — those numbers will be proportionally wrong. This is the
single most common cause of "the aura is thin and barely visible" (model
ended up taller than 6.6 units, so a 0.0075-unit push became relatively
tiny) or "the aura is way too thick/blobby" (model ended up shorter than
6.6 units).

Run this once, right after your character model finishes loading (before
building the shell in Step 3):

```js
const TARGET_HEIGHT = 6.6; // must match this exact value — every SHELL number was tuned against it

const rawBox = new THREE.Box3().setFromObject(characterModel);
const rawHeight = rawBox.max.y - rawBox.min.y;
const autoScale = rawHeight > 0 ? TARGET_HEIGHT / rawHeight : 1;
characterModel.scale.setScalar(autoScale);

// Re-measure AFTER scaling (and after any rotation you apply) — an
// axis-aligned box isn't rotation-invariant, and the pre-scale box is stale.
const scaledBox = new THREE.Box3().setFromObject(characterModel);
const modelGroundY = -scaledBox.min.y; // feet at y=0
characterModel.position.y = modelGroundY;
```

If you genuinely cannot rescale the model itself (its size is load-bearing
elsewhere, e.g. physics), the fallback is manual per-field rescaling —
multiply every amplitude field (`pushAmount`, `cloudAmp`, `driftAmp`) by
`measuredModelHeight / 6.6`, and every frequency field (`cloudFreq`) by the
inverse. This is error-prone by hand; prefer scaling the model.

## Step 3 — build the shell

**Do this AFTER the model is loaded, scaled (Step 2), and added to the
scene.** Collect body meshes first, THEN create shells in a separate pass —
never merge the two into one `traverse()` call, since adding a shell mid-
traversal makes `traverse()` re-visit it (it also passes the `isMesh` check)
and recurse forever.

```js
const shellMeshes = []; // already declared by core-aura-apply.js — don't redeclare, just use it

const bodyMeshes = [];
characterModel.traverse(obj => {
    if (obj.isMesh && obj.geometry && obj.geometry.attributes.position) {
        bodyMeshes.push(obj);
    }
});

bodyMeshes.forEach(obj => {
    // Marks the stencil buffer wherever this body mesh renders, so the
    // shell material's own stencil test (already set up inside
    // core-aura-apply.js's shellMaterial) knows where NOT to draw —
    // suppresses seams between separate body meshes.
    obj.material.stencilWrite = true;
    obj.material.stencilRef = 1;
    obj.material.stencilFunc = THREE.AlwaysStencilFunc;
    obj.material.stencilZPass = THREE.ReplaceStencilOp;
    obj.material.needsUpdate = true;
    if (!obj.geometry.attributes.normal) obj.geometry.computeVertexNormals();

    const shell = new THREE.Mesh(obj.geometry, shellMaterial); // shellMaterial comes from core-aura-apply.js
    shell.visible = SHELL.enabled;
    obj.add(shell);
    shellMeshes.push(shell);
});
```

## Step 4 — apply a level

Pick ONE block below and pass it to `applyPreset(...)` — these are the exact
current tuned values for every level, no file lookup needed:

**Level 1 (off):**
```js
applyPreset({ "SHELL": { "enabled": false }, "BLOOM": { "enabled": false } });
```

**Level 2 (gold):**
```js
applyPreset({
    "SHELL": {
        "enabled": true, "pushAmount": 0.0075,
        "color": "#FFF3B0", "colorEdge": "#ffd23f", "smokeColor": "#B3E5FC",
        "opacity": 1, "cloudAmp": 0.05, "cloudFreq": 7, "cloudSpeed": 0.45,
        "topBias": 1.75, "bottomBias": 0.5092, "flowDirection": "vertical",
        "flowSpeed": 0, "flameSharpness": 5, "riseFadeAmp": 0.75,
        "driftAmp": 0, "smokeAmount": 1
    },
    "BLOOM": { "enabled": true, "threshold": 0.25, "strength": 0.75, "radius": 1.5, "resolutionScale": 0.5, "source": "aura" }
});
```

**Level 3 (red):** same as Level 2 but:
```js
"color": "#c2003a", "colorEdge": "#dc143c", "smokeColor": "#ff6d38"
```

**Level 4 (cyan/blue):** same as Level 2 but:
```js
"color": "#00bfff", "colorEdge": "#0047ab", "smokeColor": "#f0ffff"
```

**Level 5 (purple):** same as Level 2 but:
```js
"color": "#6a0dad", "colorEdge": "#8b008b", "smokeColor": "#2e0057"
```

`BLOOM` is identical across levels 2-5 (only shown once above) — every field
in the Level 2 block that isn't a color is also identical across 3/4/5, only
the three color fields swap.

## Step 5 — the render loop

Every frame, call `renderWithBloom()` **instead of** a plain
`renderer.render(scene, camera)` — it's a drop-in replacement that renders
through the full bloom pipeline (or falls straight through to a normal
render if `BLOOM.enabled` is false):

```js
function animate() {
    requestAnimationFrame(animate);
    const time = clock.getElapsedTime(); // any running THREE.Clock — plain elapsed seconds

    syncCoreAuraUniforms(SHELL, shellUniforms, time);
    shellMeshes.forEach(s => { s.visible = SHELL.enabled; });

    renderWithBloom(); // NOT renderer.render(scene, camera) — see core-aura-bloom.js
}
animate();
```

## Host site prerequisites (must exist before Step 1)

- `THREE` — your own single Three.js instance. Don't load a second copy.
- `scene`, `camera`, `renderer` (a `THREE.WebGLRenderer`), all real globals.
- A loaded, scene-added character model as `characterModel` (a
  `THREE.Object3D`/`THREE.Group` you can `traverse()`), rigged as
  `THREE.SkinnedMesh` if it's a skinned character (Core Aura auto-detects
  and handles skinning correctly either way).

## Troubleshooting

- **Aura is thin/barely visible or way too thick** → Step 2 (scale
  normalization) was skipped or the model was measured/scaled in the wrong
  order. Recheck: scale FIRST, rotate, THEN re-measure the box for ground-Y.
- **No glow/blur at all, just a crisp outline** → `core-aura-bloom.js` wasn't
  loaded, or `renderWithBloom()` isn't the function actually being called in
  the render loop (double-check nothing fell back to a plain
  `renderer.render(scene, camera)` call).
- **Outline looks smooth/uniform with no organic blob/flame texture** →
  `shellMaterial` (from `core-aura-apply.js`) wasn't used verbatim for the
  shell mesh — if a custom/simplified material was written instead of using
  `shellMaterial` directly, the noise/flame-sharpness shader logic never
  runs. Use `shellMaterial` exactly as exported, don't reimplement it.
- **Nothing renders at all / console errors about undefined variables** →
  check Step 1's load order — every file here assumes `THREE`,
  `scene`/`camera`/`renderer` (and, later, `characterModel`/`shellMeshes`)
  already exist as globals by the time they're actually used, not
  necessarily by the time each script tag runs.

## Where the full exported files live (in this project only)

`layers new/presets/Core Aura - Level 1.json` through `Level 5.json` — full
exports (including this project's own `MODEL`/`CONFIG`/`auraAnchor`, which
aren't meaningful on a different model, so Step 4 above only pulled out the
portable `SHELL`/`BLOOM` parts). You don't need these files for the install
above — Step 4 already has everything inlined — but they're there for
reference or if you'd rather load full JSON files rather than pasting the
trimmed blocks.

## Adding a 6th level (or replacing one) later

1. Open `core-aura-editor.html` in this project and tune the look live.
2. Set the GUI's **"Preset Name"** field to exactly `Level 6` (or whichever),
   leave **"Preset Layer Type"** as `Core Aura`.
3. Click **"⬇ Download as File"** — saves `Core Aura - Level 6.json`.
4. Move that file into `layers new/presets/` in this project.
5. To hand it to another project/AI: open the file, copy its `SHELL` and
   `BLOOM` blocks only, and add a new block to Step 4 above — or paste the
   whole file into `applyPreset(...)` as-is; `applyPreset()` only reads the
   `SHELL`/`BLOOM` keys it recognizes and ignores the rest.
