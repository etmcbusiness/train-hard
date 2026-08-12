# Adding the aura to a new box/button

1. Copy this folder (`_template/`) to a new folder named after the thing
   you're targeting, e.g. `Shape Aura/My New Button/`.
2. Edit that folder's `preset.json` however you like (colors, thickness,
   etc.) — same fields as every other preset here.
3. Add one line to `SHAPE_AURA_TARGETS` in `index.html` (search for that
   name) pointing at the new element's CSS selector and this folder's
   `preset.json` path.

That's it — the shared engine in `engine/` and the canvas already handle
everything else. Every button reuses the same engine; only the preset
folder is per-button.

Note: `Profile Photo/` doesn't follow this template — it's cardio-level-
driven (one `Profile Photo - Level N.json` file per level, see
`PROFILE_PHOTO_AURA_LEVEL_FILES` in index.html) instead of a single flat
`preset.json`. Use this template for anything that should just always look
the same, regardless of level.
