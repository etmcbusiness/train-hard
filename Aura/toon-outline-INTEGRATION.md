# Integrating: Toon Outline

Files: `toon-outline-code.js` + `toon-outline-apply.js`.
Read `README-INTEGRATION.md` first.

## What it needs to exist already on the host site
- `THREE` — the host's own Three.js instance.
- The host's loaded character model, as a `THREE.Object3D` you can `traverse()`.
- `modelGroundY` (a number: world-Y where the character's feet touch the
  ground) and `TARGET_HEIGHT` (a number: the character's total height in
  scene units) — both are read inside `syncHuggingAuraUniforms` for the
  shader's height-phase math. Compute these from the host model's own
  bounding box (`new THREE.Box3().setFromObject(hostModel)`).

## Steps
1. Load `toon-outline-code.js` as-is — it only defines `SHELL`,
   `SHELL_FLOW_MODES`, the two shader strings, `buildHuggingAuraUniforms`,
   `syncHuggingAuraUniforms`, `buildHuggingAuraGui`. No side effects.
2. Load `toon-outline-apply.js` as-is — creates `shellUniforms`,
   `shellMaterial`, `shellMeshes` (an empty array to be filled in step 3).
3. **Write new integration code** (this part doesn't exist as a standalone
   function in the original project — it's inline in a GLTF-loader callback)
   to collect body meshes and build a shell for each one:
   ```js
   const bodyMeshes = [];
   hostModel.traverse(obj => {
       if (obj.isMesh && obj.geometry && obj.geometry.attributes.position) {
           bodyMeshes.push(obj);
       }
   });
   bodyMeshes.forEach(obj => {
       // Mark the stencil buffer wherever this body mesh renders, so the
       // shell material's stencil test (already set in shellMaterial) knows
       // where NOT to draw (suppresses seams between separate meshes).
       obj.material.stencilWrite = true;
       obj.material.stencilRef = 1;
       obj.material.stencilFunc = THREE.AlwaysStencilFunc;
       obj.material.stencilZPass = THREE.ReplaceStencilOp;
       obj.material.needsUpdate = true;
       if (!obj.geometry.attributes.normal) obj.geometry.computeVertexNormals();

       const shell = new THREE.Mesh(obj.geometry, shellMaterial);
       shell.visible = SHELL.enabled;
       obj.add(shell);
       shellMeshes.push(shell);
   });
   ```
   **Do this AFTER the host model is fully loaded and added to its scene**
   (mirrors the original project's GLTF `onLoad` callback timing).
4. Call `applyToonOutlineGui()` once, after your `gui` (lil-gui instance)
   exists, if you want live tuning controls on the host site. Skip this
   entirely if you're shipping fixed tuned values instead (see
   README-INTEGRATION.md point 5).
5. Every frame, in the host's own render loop:
   ```js
   syncHuggingAuraUniforms(SHELL, shellUniforms, time); // `time` = elapsed seconds
   shellMeshes.forEach(s => { s.visible = SHELL.enabled; });
   ```

## Gotchas specific to this layer
- **Stencil buffer conflicts.** This uses `stencilRef: 1` for both the body
  meshes (write) and the shell material (test != 1). If the host renderer's
  `WebGLRenderer` doesn't have a stencil buffer enabled, or something else on
  the host site already uses stencil testing, this will misbehave. Check the
  host's `new THREE.WebGLRenderer({...})` call — it needs `stencil: true`
  (this is Three.js's default, but confirm it wasn't explicitly disabled).
- **`pushAmount` is scaled to THIS project's model** (tuned around
  `TARGET_HEIGHT = 6.6` scene units). If the host model is a very different
  scale, the outline will look far too thick or too thin — re-tune
  `SHELL.pushAmount` (default GUI range was `0.0005–0.02`) for the host
  model's actual scale before judging the look.
- **Never merge mesh collection and shell creation into one traversal pass**
  — calling `obj.add(shell)` inside the same `traverse()` callback that's
  still iterating will re-visit the newly added shell (it also passes the
  `isMesh` check) and recurse forever. Keep the two-pass structure shown
  above (collect into `bodyMeshes` first, create shells in a separate
  `.forEach()` after).
