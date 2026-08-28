// PRESET APPLY — swaps a saved preset (the same JSON this project's
// "EXPORT PRESET CODE" button produces: { name, layerType, label, CONFIG,
// MODEL, MODEL_GLOW, SHELL, BLOOM, auraAnchor }) into the live config
// objects on ANY host site, updating only whichever of those objects actually exist there.
// Safe to call with a partial preset (e.g. one that only touches SHELL's
// colors) on a host that hasn't ported every layer — missing pieces are just
// skipped, not errors.
//
// Usage on the host site:
//   const FIRE_PRESET = { SHELL: { color: '#ff4400', color2: '#ffcc00', ... }, ... };
//   applyPreset(FIRE_PRESET);
//
// To generate a preset: open this project, type a name into "Preset Name"
// and pick a "Preset Layer Type" in the GUI, tune the look, click
// "EXPORT PRESET CODE", copy the JSON out of the textarea. `name`/`layerType`
// are just labels baked into the JSON for organizing multiple saved presets —
// export still dumps the whole current state regardless of which layer type
// you picked (it doesn't filter what's included).
//
// NAMED PRESET LIBRARY: register presets under "Layer Type - Name" and look
// them up by those two parts instead of juggling separate JS variables per
// preset — see registerPreset()/applyNamedPreset()/listPresetNames() below.
function applyPreset(preset) {
    if (!preset) return;

    // Plain flat config objects — shallow-merge each field into the live
    // object of the same name, if that object exists on this page. A shallow
    // merge (not wholesale replacement) means fields the preset doesn't
    // mention are left exactly as they were, and any host-only fields on the
    // live object (e.g. CONFIG.exportConfig, a function) survive untouched.
    const flatTargets = {
        SHELL: typeof SHELL !== 'undefined' ? SHELL : null,
        MODEL: typeof MODEL !== 'undefined' ? MODEL : null,
        MODEL_GLOW: typeof MODEL_GLOW !== 'undefined' ? MODEL_GLOW : null,
        BLOOM: typeof BLOOM !== 'undefined' ? BLOOM : null
    };
    Object.keys(flatTargets).forEach(key => {
        if (flatTargets[key] && preset[key]) Object.assign(flatTargets[key], preset[key]);
    });

    // CONFIG is nested one level deeper (currently just CONFIG.global) — merge
    // each section individually instead of overwriting CONFIG wholesale, for
    // the same "don't clobber fields the preset doesn't mention" reason as above.
    if (typeof CONFIG !== 'undefined' && preset.CONFIG) {
        Object.keys(preset.CONFIG).forEach(section => {
            const incoming = preset.CONFIG[section];
            if (incoming && typeof incoming === 'object' && CONFIG[section] && typeof CONFIG[section] === 'object') {
                Object.assign(CONFIG[section], incoming);
            } else if (incoming !== undefined && typeof incoming !== 'object') {
                CONFIG[section] = incoming;
            }
        });
    }

    // auraAnchor is a live THREE.Object3D transform (position/rotation), not
    // a plain data object — apply its fields directly instead of Object.assign,
    // which would silently fail to update a THREE.Vector3's x/y/z via a plain
    // object copy.
    if (typeof auraAnchor !== 'undefined' && preset.auraAnchor) {
        if (preset.auraAnchor.position) {
            auraAnchor.position.set(
                preset.auraAnchor.position.x,
                preset.auraAnchor.position.y,
                preset.auraAnchor.position.z
            );
        }
        if (preset.auraAnchor.rotationY !== undefined) {
            auraAnchor.rotation.y = preset.auraAnchor.rotationY;
        }
    }

    // If a lil-gui panel is present on the host site (dev/tuning only — see
    // README-INTEGRATION.md point 5), refresh its displayed values so the
    // sliders visibly reflect the newly-applied preset instead of showing
    // stale numbers until manually touched.
    if (typeof gui !== 'undefined' && gui.controllersRecursive) {
        gui.controllersRecursive().forEach(c => c.updateDisplay());
    }
}

// NAMED PRESET LIBRARY — organizes saved presets two levels deep, by
// layerType then name (e.g. PRESET_LIBRARY['Core Aura']['Fire']), so a
// host site can build a "Layer Type -> Preset Name" picker (two dropdowns,
// or a single combined list) instead of hardcoding a separate JS variable
// per preset.
const PRESET_LIBRARY = {};

// Files a preset under its own layerType/name (read straight off the JSON
// exported by this project's "EXPORT PRESET CODE" button — no need to pass
// them separately). Falls back to 'Untitled'/'Unnamed' if the preset predates
// this naming feature and has no layerType/name fields.
function registerPreset(preset) {
    if (!preset) return;
    const layerType = preset.layerType || 'Untitled';
    const name = preset.name || 'Unnamed';
    if (!PRESET_LIBRARY[layerType]) PRESET_LIBRARY[layerType] = {};
    PRESET_LIBRARY[layerType][name] = preset;
}

// Looks up a preset by its "Layer Type - Name" and applies it via
// applyPreset(). Returns false (and leaves the current look untouched) if no
// such preset was registered, instead of throwing.
function applyNamedPreset(layerType, name) {
    const preset = PRESET_LIBRARY[layerType] && PRESET_LIBRARY[layerType][name];
    if (!preset) {
        console.warn(`No preset registered for "${layerType} - ${name}". Call registerPreset() first.`);
        return false;
    }
    applyPreset(preset);
    return true;
}

// Lists registered preset names — pass a layerType to list just that
// category's names, or call with no arguments to list every "Layer Type -
// Name" combination currently registered (handy for building a dropdown).
function listPresetNames(layerType) {
    if (layerType) return Object.keys(PRESET_LIBRARY[layerType] || {});
    const all = [];
    Object.keys(PRESET_LIBRARY).forEach(lt => {
        Object.keys(PRESET_LIBRARY[lt]).forEach(name => all.push(`${lt} - ${name}`));
    });
    return all;
}
