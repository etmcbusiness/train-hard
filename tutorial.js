// ═══════════════════════════════════════════════════════════
// TRAIN HARD TUTORIAL — isolated in its own file so future feature work in
// index.html can update/extend the walkthrough without hunting through the
// whole app script. To add a step for a new feature: add an entry to
// TUTORIAL_STEPS below (title, body, optional tab/target/avoid/textAtBottom/
// onEnter — see positionTutorialTarget()'s comment for what target/avoid/
// textAtBottom do, and the "Create an Account" step for an onEnter example).
//
// WHY THIS FILE NEEDS A BRIDGE (read before touching initTrainHardTutorial):
// index.html's own script is `type="module"`. A module's top-level
// declarations are private to that module — invisible to any other script,
// classic or module — so this file (a plain classic script) cannot reach
// into index.html's goToTab/meshMap/etc. by bare name no matter when it
// runs. index.html therefore calls initTrainHardTutorial({...}) once, near
// the end of its own script, handing over the handful of live
// functions/values this file needs. The reverse direction needs no such
// bridge: a classic script's top-level declarations (this whole file) ARE
// visible to a later module by bare name, so index.html just calls
// checkForTutorial() / checkForTutorialResume() / startTutorial() directly
// — no window.* plumbing needed for that direction.
//
// If a FUTURE tutorial step needs some other live app function/value, add
// it to the destructuring in initTrainHardTutorial() below AND to the
// object index.html passes in (search index.html for initTrainHardTutorial
// to find that call).
//
// Visual styling lives in tutorial.css (shared with eat-plenty.html's own
// tutorial) — see that file for the look, this one for the behavior.
// Eat Plenty's tutorial is a separate, fully self-contained file
// (eat-plenty-tutorial.js) since it's a different document/script scope
// with no module boundary to bridge — see that file's own header comment.
// ═══════════════════════════════════════════════════════════

const TUTORIAL_STEPS = [
  {
    title: "Welcome! Let's Train Hard",
    body: '',
  },
  // ── Profile tab — every Profile-tab step happens here before moving on ──
  {
    title: 'Profile',
    body: "This is your Profile — home base. Your 3D character reflects your training, leveling up and glowing as you put in work.",
    tab: 'profile',
    target: '.nav-btn[data-tab="profile"]',
  },
  {
    title: 'Customize Your Avatar',
    body: "Tap Avatar to switch your character between Male and Female models, pick a Training Room background, and customize the app's UI color theme.",
    tab: 'profile',
    target: '#avatar-btn',
    avoid: '#profile-btns',
  },
  {
    title: 'Your Character Levels Up',
    body: 'As you train each muscle, its color changes through 5 levels — from untrained to fully leveled. Here they all are at once:',
    tab: 'profile',
    target: null,
    demoMuscles: true,
  },
  {
    title: 'Cardio Aura',
    body: "Logging cardio also gives your character a glowing aura — the more you do, the stronger it gets. Here's a preview:",
    tab: 'profile',
    target: null,
    demoAura: true,
  },
  {
    title: 'Friends',
    body: 'Tap Friends to add people by username and see their training level at a glance.',
    tab: 'profile',
    target: '#friends-btn',
    avoid: '#profile-btns-right',
  },
  {
    title: 'Challenges',
    body: "Tap Challenges to create or join one with a friend, then track who's making faster progress.",
    tab: 'profile',
    target: '#challenges-btn',
    avoid: '#profile-btns-right',
  },
  {
    title: 'Eat Plenty',
    body: "Let's take a look — tap Next to open Eat Plenty and see its own tutorial. You'll come right back here after.",
    tab: 'profile',
    target: '#eat-plenty-btn',
    avoid: '#profile-btns-right',
    navigateToEatPlenty: true,
  },
  // ── History tab ──
  {
    title: 'History',
    body: 'Every completed workout is saved here. Swipe left on one to edit it, add notes, or turn it into a template.',
    tab: 'history',
    target: '.nav-btn[data-tab="history"]',
  },
  {
    title: 'Editing Past Workouts',
    body: "Come back to History anytime — swipe left on a workout to edit its sets, jot down notes, or save it as a template.",
    tab: 'history',
    target: null,
  },
  // ── Train tab ──
  {
    title: 'Train',
    body: 'Start a workout here — either freestyle or from a saved template — and log your sets as you go.',
    tab: 'train',
    target: '.nav-btn[data-tab="train"]',
  },
  {
    title: 'Templates vs. Freestyle',
    body: 'Build a template ahead of time to reuse later, or just hit Start Training and add exercises as you go.',
    tab: 'train',
    target: '#prestart-box',
  },
  // ── Exercises tab ──
  {
    title: 'Exercises',
    body: 'Your full exercise library lives here — browse, edit, or add new ones anytime.',
    tab: 'exercises',
    target: '.nav-btn[data-tab="exercises"]',
  },
  {
    title: 'Adding an Exercise',
    body: 'Tap "New Exercise" to add your own — pick a muscle group, category, and name it whatever you like.',
    tab: 'exercises',
    target: '#new-ex-btn',
  },
  // ── Stats tab ──
  {
    title: 'Stats',
    body: 'Track your progress here — personalized goals, body measurements, exercise stats, and weekly goals.',
    tab: 'stats',
    target: '.nav-btn[data-tab="stats"]',
  },
  {
    title: 'Personalized Goals',
    body: 'Tap Personalized Goals to see your level and training breakdown for every muscle — tap any muscle for details, or mark ones as a Focus to track them front and center.',
    tab: 'stats',
    target: '#stats-menu-goals',
    avoid: '#stats-menu-box',
  },
  {
    title: 'Weekly Goals',
    body: "Tap Weekly Goals to adjust your weekly sets per muscle — raise a goal to focus on a weak spot, or ease off one that's already strong.",
    tab: 'stats',
    target: '#stats-menu-weekly-goals',
    avoid: '#stats-menu-box',
    textAtBottom: true,
  },
  // ── Finale — back to Profile to actually create an account ──
  {
    title: 'Replay This Tutorial Anytime',
    body: 'Come back to Profile → More → Tutorial whenever you want to see this walkthrough again.',
    tab: 'profile',
    target: '#profile-menu-btn',
    avoid: '#profile-btns',
  },
  {
    title: 'Create an Account',
    body: 'Fill this in to create a free account — it saves your progress to the cloud and syncs across all your devices.',
    tab: 'profile',
    target: '#acct-signup-btn',
    textAtBottom: true,
    // Only meaningful for a signed-out user (the normal case) — a signed-in
    // user replaying the tutorial has nothing to sign up for, so leave their
    // actual profile view alone rather than yanking them into a stale form.
    // Receives live app state via `ctx` (see renderTutorialStep) rather than
    // closing over index.html's own `cloudSession` directly, since a plain
    // closure here couldn't see a module-scoped variable anyway (see the
    // file-level comment above) — and reading it fresh via ctx also means
    // this never goes stale between sign-in/out and this step showing.
    onEnter: (ctx) => {
      if (ctx.isSignedIn) return;
      document.getElementById('profile-menu-overlay').classList.add('open');
      document.getElementById('acct-login-form').style.display = 'none';
      document.getElementById('acct-signup-form').style.display = 'block';
    },
  },
];

let tutorialStepIndex = 0;
let tutorialAuraDemoActive = false;
let tutorialMuscleDemoActive = false;

// Populated by initTrainHardTutorial() — see the file-level comment above.
let goToTab, getCardioLevel, updateCoreAuraForLevel, meshMap, LEVEL_COLORS, updateModel, supabase, getCloudSession;
function initTrainHardTutorial(deps) {
  ({ goToTab, getCardioLevel, updateCoreAuraForLevel, meshMap, LEVEL_COLORS, updateModel, supabase, getCloudSession } = deps);
}

// Points the glowing ring + bouncing arrow (see #tutorial-highlight/
// #tutorial-arrow) at a real on-screen element for the current step, and
// places the text on the far side of the arrow so it never sits on top of
// the thing it's explaining. Prefers placing the arrow above the target
// pointing down, but flips below pointing up when there isn't room above
// (e.g. the top-left profile buttons) — same idea as an adaptive tooltip.
//
// `avoidSelector` is an optional wider container to clear the text from —
// e.g. the target might be one button in a stack of several (Weekly Goals
// inside the Stats menu list, Avatar inside the top-left profile-buttons
// column); ringing just that one button but only clearing the text past
// *its* edge would still land the text on top of the sibling button right
// next to it. The ring/arrow always point at the exact target; only the
// text's clearance uses the wider rect when one is given.
function positionTutorialBoxAtBottom() {
  const box = document.getElementById('tutorial-box');
  box.style.top = 'auto';
  box.style.bottom = 'calc(env(safe-area-inset-bottom) + 96px)';
  box.style.transform = 'translateX(-50%)';
}

// `textAtBottom` decouples the text from the ring/arrow entirely, anchoring
// it to the same safe bottom-of-screen spot as a no-target step — for a
// target that sits inside a short, densely-packed panel (e.g. the sign-up
// form: a small fixed-height header above it, more account buttons packed
// right below it) where there just isn't enough clearance on either side of
// the target itself to grow the text away from it without overlapping
// something else. The ring/arrow still land precisely on the real target.
function positionTutorialTarget(selector, avoidSelector, textAtBottom) {
  const highlight = document.getElementById('tutorial-highlight');
  const arrow = document.getElementById('tutorial-arrow');
  const el = selector ? document.querySelector(selector) : null;
  const r = el ? el.getBoundingClientRect() : null;
  // A selector that resolves to a hidden element (e.g. the signup form's
  // button when a step's onEnter didn't apply because the user turned out
  // to already be signed in) reports an all-zero rect — treat that the same
  // as no target at all instead of drawing a degenerate ring in the corner.
  if (!el || (r.width === 0 && r.height === 0)) {
    highlight.style.display = 'none';
    arrow.style.display = 'none';
    // No specific target (e.g. steps about the character itself) — anchor
    // near the bottom of the screen so the text never covers the character
    // or top-of-screen buttons.
    positionTutorialBoxAtBottom();
    return;
  }
  const pad = 6;
  highlight.style.display = 'block';
  highlight.style.left = (r.left - pad) + 'px';
  highlight.style.top = (r.top - pad) + 'px';
  highlight.style.width = (r.width + pad * 2) + 'px';
  highlight.style.height = (r.height + pad * 2) + 'px';

  const gap = 10;
  const arrowSize = 26;
  const pointDown = r.top >= (window.innerHeight - r.bottom);
  arrow.textContent = pointDown ? '▼' : '▲';
  arrow.style.display = 'block';
  arrow.style.left = (r.left + r.width / 2) + 'px';
  arrow.style.top = pointDown
    ? (r.top - pad - gap - arrowSize) + 'px'
    : (r.bottom + pad + gap) + 'px';

  if (textAtBottom) {
    positionTutorialBoxAtBottom();
    return;
  }

  // The text sits on the far side of the arrow from the target — never on
  // top of it — anchored with `top` or `bottom` (not a computed height) so
  // it grows away from the target regardless of how much text a step has.
  const box = document.getElementById('tutorial-box');
  const avoidEl = avoidSelector ? document.querySelector(avoidSelector) : null;
  const ar = avoidEl ? avoidEl.getBoundingClientRect() : r;
  const textGap = 16;
  box.style.transform = 'translateX(-50%)';
  if (pointDown) {
    box.style.top = 'auto';
    box.style.bottom = (window.innerHeight - ar.top + pad + textGap) + 'px';
  } else {
    box.style.bottom = 'auto';
    box.style.top = (ar.bottom + pad + textGap) + 'px';
  }
}

// "Cardio Aura" previews the strongest Core Aura preset regardless of the
// user's real cardio level, for as long as that step stays on screen — see
// updateCoreAuraForLevel()/CORE_AURA_LEVEL_PRESETS in index.html.
// clearTutorialAuraDemo runs on every step change/close (not on a timer) so
// moving on or exiting always reverts it, and it never lingers past the
// step it belongs to.
function tutorialDemoAura() {
  tutorialAuraDemoActive = true;
  updateCoreAuraForLevel(5);
}
function clearTutorialAuraDemo() {
  if (!tutorialAuraDemoActive) return;
  tutorialAuraDemoActive = false;
  updateCoreAuraForLevel(getCardioLevel());
}

// "Your Character Levels Up" forces 5 different muscles to 5 different
// levels at once (Level 1 = untrained/no glow, same as updateModel()'s own
// rule) so every color is visible on screen together, regardless of the
// user's real training — one muscle per body region so they're easy to
// spot on the model. Reverts by just calling the real updateModel(), same
// "lasts the whole step" lifecycle as the Cardio Aura demo above.
const TUTORIAL_MUSCLE_LEVEL_DEMO = [
  { muscle: 'Biceps',      level: 1 },
  { muscle: 'Chest',       level: 2 },
  { muscle: 'Abs',         level: 3 },
  { muscle: 'Quads',       level: 4 },
  { muscle: 'Front Delts', level: 5 },
];
function tutorialDemoMuscleLevels() {
  tutorialMuscleDemoActive = true;
  TUTORIAL_MUSCLE_LEVEL_DEMO.forEach(({ muscle, level }) => {
    const meshes = meshMap[muscle];
    if (!meshes) return;
    meshes.forEach(mesh => {
      if (level === 1) {
        mesh.material.emissive.set(0x000000);
      } else {
        mesh.material.emissive.set(LEVEL_COLORS[level]);
        mesh.material.emissiveIntensity = 0.55;
      }
    });
  });
}
function clearTutorialMuscleDemo() {
  if (!tutorialMuscleDemoActive) return;
  tutorialMuscleDemoActive = false;
  updateModel(); // recolors every muscle back to its real current level
}

function renderTutorialStep() {
  clearTutorialAuraDemo();
  clearTutorialMuscleDemo();
  // Reset the one side-effect a step can have (the finale opens the Profile
  // menu to the sign-up form) before applying whichever step we're actually
  // rendering — so navigating Back off that step, or exiting, doesn't leave
  // it stuck open over whatever tab we move to next.
  document.getElementById('profile-menu-overlay').classList.remove('open');
  const body = document.getElementById('tutorial-step-body');
  const backBtn = document.getElementById('tutorial-back-btn');
  const nextBtn = document.getElementById('tutorial-next-btn');
  if (!TUTORIAL_STEPS.length) {
    body.innerHTML = `<div class="profile-overlay-signedout">Tutorial coming soon.</div>`;
    backBtn.style.display = 'none';
    nextBtn.textContent = 'Done';
    positionTutorialTarget(null);
    return;
  }
  const step = TUTORIAL_STEPS[tutorialStepIndex];
  if (step.tab) goToTab(step.tab);
  if (step.onEnter) step.onEnter({ isSignedIn: !!getCloudSession() });
  body.innerHTML = `
    <div class="tutorial-step-title">${step.title}</div>
    ${step.body ? `<div class="tutorial-step-text">${step.body}</div>` : ''}
  `;
  backBtn.style.display = tutorialStepIndex === 0 ? 'none' : '';
  nextBtn.textContent = tutorialStepIndex === TUTORIAL_STEPS.length - 1 ? 'Done' : 'Next';
  positionTutorialTarget(step.target, step.avoid, step.textAtBottom);
  if (step.demoAura) tutorialDemoAura();
  if (step.demoMuscles) tutorialDemoMuscleLevels();
}

function startTutorial() {
  tutorialStepIndex = 0;
  goToTab('profile');
  renderTutorialStep();
  document.getElementById('tutorial-overlay').classList.add('open');
}

// Exiting always drops the user back on the plain Profile tab (the
// character screen) — whichever tab/overlay a step had opened along the
// way (History, the signup form, etc.) shouldn't still be showing once the
// tour is over.
function closeTutorial() {
  document.getElementById('tutorial-overlay').classList.remove('open');
  document.getElementById('profile-menu-overlay').classList.remove('open');
  clearTutorialAuraDemo();
  clearTutorialMuscleDemo();
  positionTutorialTarget(null);
  goToTab('profile');
}

// localStorage key used to hand the tutorial off across the navigation to
// eat-plenty.html (a separate document/script scope — see
// TUTORIAL_RESUME_KEY usage below and the mirrored constant + logic in
// eat-plenty-tutorial.js). Its value is the step index to resume at on
// return; its mere presence is what tells eat-plenty.html to run its own
// tutorial.
const TUTORIAL_RESUME_KEY = 'trainhard_tutorial_resume';
const TUTORIAL_SUPPRESS_KEY = 'trainhard_tutorial_suppress_once';

function tutorialGoNext() {
  const step = TUTORIAL_STEPS[tutorialStepIndex];
  if (step && step.navigateToEatPlenty) {
    localStorage.setItem(TUTORIAL_RESUME_KEY, String(tutorialStepIndex + 1));
    location.href = 'eat-plenty.html';
    return;
  }
  if (!TUTORIAL_STEPS.length || tutorialStepIndex >= TUTORIAL_STEPS.length - 1) {
    closeTutorial();
    return;
  }
  tutorialStepIndex++;
  renderTutorialStep();
}
function tutorialGoBack() {
  if (tutorialStepIndex === 0) return;
  tutorialStepIndex--;
  renderTutorialStep();
}

// Auto-plays on every app open for anyone not signed in — unlike the update
// popup, this is not a once-ever flag: it keeps showing on each open for as
// long as the user stays signed out, and never shows at all once they're
// signed in with an email. Always replayable on demand via
// Profile > More > Tutorial regardless of sign-in state (see tutorial-btn
// in index.html).
async function checkForTutorial() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return false;
  startTutorial();
  return true;
}

// Resumes the main tutorial right after its "Eat Plenty" step sent the user
// over to eat-plenty.html to see that app's own tutorial — see
// TUTORIAL_RESUME_KEY. Bypasses the signed-out-only gate above since this is
// a direct continuation of a flow the user (or the auto-play) already
// started, not a fresh auto-play decision. Takes priority over both
// checkForTutorial() and checkForUpdatePopup() for this one load — see
// runPostLoadPopupChecks() in index.html.
function checkForTutorialResume() {
  const raw = localStorage.getItem(TUTORIAL_RESUME_KEY);
  if (raw === null) return false;
  localStorage.removeItem(TUTORIAL_RESUME_KEY);
  const idx = parseInt(raw, 10);
  if (!Number.isInteger(idx) || idx < 0 || idx >= TUTORIAL_STEPS.length) return false;
  startTutorial();
  tutorialStepIndex = idx;
  renderTutorialStep();
  return true;
}

document.getElementById('tutorial-btn').addEventListener('click', () => {
  document.getElementById('profile-menu-overlay').classList.remove('open');
  startTutorial();
});
document.getElementById('tutorial-exit-btn').addEventListener('click', closeTutorial);
document.getElementById('tutorial-back-btn').addEventListener('click', tutorialGoBack);
document.getElementById('tutorial-next-btn').addEventListener('click', tutorialGoNext);
// Tapping anywhere else in the overlay (the invisible backdrop, or the text
// itself) acts like Next — only tutorial-exit-btn actually ends the tour.
document.getElementById('tutorial-overlay').addEventListener('click', (e) => {
  if (e.target.closest('#tutorial-exit-btn, #tutorial-back-btn, #tutorial-next-btn')) return;
  tutorialGoNext();
});
