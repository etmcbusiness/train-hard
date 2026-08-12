# Integrating: Flexable Shape Aura

File: `flex-shape-aura-code.js`.
Read `README-INTEGRATION.md` first, and `core-aura-INTEGRATION.md` — this
layer loads `core-aura-code.js` as a dependency and reuses its shader
unmodified, so everything there about `SHELL`'s numbers, colors, and shape
controls applies here too.

## What this actually is

Not a separate aura system — it's the same `HUGGING_AURA_VERTEX_SHADER` /
`HUGGING_AURA_FRAGMENT_SHADER` from `core-aura-code.js`, run on a small WebGL
scene of its own (one orthographic camera in literal CSS-pixel units) against
a flat mesh built from a DOM element's own `getBoundingClientRect()` instead
of a 3D character's body mesh. Same noise, same colors, same every field —
just a different shape feeding the same math.

## What it needs to exist already on the host page

- `THREE` — the same instance `core-aura-code.js` uses (see
  README-INTEGRATION.md point 1 — do not load a second copy of Three.js).
- `SHELL`, `HUGGING_AURA_VERTEX_SHADER`, `HUGGING_AURA_FRAGMENT_SHADER`,
  `buildHuggingAuraUniforms`, `syncHuggingAuraUniforms` — i.e.
  `core-aura-code.js` loaded first.
- A `<canvas id="flex-aura-canvas">`, positioned to cover whatever area your
  target elements live in (usually the whole viewport:
  `position: fixed; top:0; left:0; width:100vw; height:100vh; pointer-events:none;`).
- **That canvas must sit BEHIND your target elements in z-order** (a lower
  `z-index`, or earlier in the DOM with no z-index on either). The aura mesh
  is a fully-filled pushed-outward shape — like the 3D shell, only the
  sliver that pokes out past the element's own opaque background is
  supposed to be visible. If the canvas ends up in FRONT of the element
  instead, you'll see the whole filled shape, not just the rim.
- Your target element needs an actual **opaque background** for that
  masking to work — a transparent-background element (e.g. bare text with
  no box) won't hide the shell's interior, so the aura fills in as a solid
  colored badge behind it instead of a thin outline. That's fine for a
  button/card/input; for text, either give it an opaque backing box or
  expect the "glow behind the word" look instead of an outline-per-letter
  look (a true per-letter glyph-hugging outline was attempted and abandoned
  in this project — see the `flexable-shape-aura.html` conversation history
  if you want to pick that back up; it's genuinely a different, much bigger
  feature: rasterizing + tracing each glyph's actual outline, not just its
  bounding box).

## Steps

1. Load `core-aura-code.js`, then `flex-shape-aura-code.js`, in that order
   (script tags or bundler imports — `flex-shape-aura-code.js` reads
   `SHELL`/`HUGGING_AURA_*`/`buildHuggingAuraUniforms`/
   `syncHuggingAuraUniforms` as plain globals at call time, same convention
   as `core-aura-apply.js`).
2. Have the `<canvas id="flex-aura-canvas">` in the DOM before this script
   runs (it calls `document.getElementById('flex-aura-canvas')` once, at
   load time).
3. For each element you want an aura on:
   ```js
   const myAura = createFlexAura(document.querySelector('#myButton'), {
       // optional overrides — omit entirely to use the Core Aura defaults verbatim
       color: '#00ffff',
       shape: 'auto' // or 'triangle' — see core-aura-code.js's SHELL for every other field
   });
   ```
   That's it — no per-frame call needed on your end. The file starts its own
   `requestAnimationFrame` loop internally and keeps every registered aura's
   mesh synced to its target element's current `getBoundingClientRect()`
   every frame (so it tracks layout changes, window resizes, scrolling,
   etc. automatically).
4. To change settings later: `myAura.config.pushAmount = 0.01;` (or any
   other field) — mutate directly, no setter/update call needed, picked up
   next frame.
5. To remove it: `myAura.destroy();` — unregisters it and frees its
   `THREE.BufferGeometry`/`THREE.ShaderMaterial`.

## Gotchas specific to this layer

- **`auraScale` has no 3D equivalent and isn't in `SHELL`** — pixels and 3D
  world-units aren't the same kind of quantity, so this is a necessary
  2D-only conversion constant, unlike every other field (copied straight
  from `SHELL`, unmodified). **It defaults to `'auto'`**, not a fixed
  number: `resolveAuraScale()` derives it every frame from that specific
  element's own `(width+height)/2` (divided by `FLEX_TARGET_SIZE = 0.3`) —
  the exact same normalization idea as the 3D layer auto-scaling any raw
  model to `TARGET_HEIGHT` (see README-INTEGRATION.md's "Scale mismatch"
  section). This is what makes "just works on any box" true: a 16px
  checkbox and an 800px hero card each get their OWN correctly-proportioned
  scale automatically, no per-element tuning needed, and it keeps working
  if the element resizes later (recomputed every frame, not cached).
  - To nudge the thickness up/down without losing the auto-fit behavior,
    set `auraScaleMultiplier` (default `1`) — applies uniformly on top of
    the auto value, e.g. `{ auraScaleMultiplier: 1.5 }` for a visibly
    thicker outline on that one element.
  - To bypass auto-scaling entirely and pin an exact value yourself, pass a
    plain number for `auraScale` (e.g. `{ auraScale: 450 }`) — a number
    always wins over `'auto'`, and `auraScaleMultiplier` is ignored in that
    case (you've already chosen the exact value).
- **`shape: 'triangle'`** needs the target element's own visible shape to
  actually BE a triangle (e.g. CSS `clip-path: polygon(50% 0%, 100% 100%, 0% 100%)`,
  matching `trianglePoint()`'s apex-top/base-bottom layout exactly) — the
  masking trick only hides the right area if the DOM element's opaque
  silhouette matches the geometry being pushed outward. A plain rectangular
  div with `shape:'triangle'` will show a triangular halo floating
  misaligned around/through its rectangular corners.
- **Circles are just `shape:'auto'` on a square element with
  `border-radius:50%`** — no separate circle mode needed; the rounded-rect
  code clamps radius to half the smaller side automatically, which is
  exactly a circle when width===height.
- **Multiple elements share one canvas/renderer**, module-level
  (`FLEX_AURAS`, `renderer`, `scene`, `camera`). Calling
  `createFlexAura()` multiple times is the normal/expected usage — don't
  load this file more than once or you'll get duplicate renderers fighting
  over the same canvas.
- **Only reads `border-top-left-radius`** for auto corner detection — if
  your element has different radii per corner (unusual, but valid CSS),
  every corner will use the top-left value. Pass an explicit
  `cornerRadius` override if you need per-shape control instead.
- **Stacking contexts**: the canvas's z-index is compared against your
  target element's in whatever stacking context they share. If the aura
  isn't appearing (or is appearing ON TOP instead of hugging behind), the
  usual cause is the target element sitting inside an ancestor that creates
  its OWN stacking context (e.g. `transform`, `opacity < 1`, `filter`,
  `position` + `z-index` on an ancestor) — that ancestor's z-index is what
  actually gets compared against the canvas, not the element's own. Moving
  the canvas element to be a later sibling with no z-index competition, or
  giving the target's stacking-context ancestor a lower z-index than the
  canvas, resolves it.
