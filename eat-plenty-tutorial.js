// ═══════════════════════════════════════════════════════════
// EAT PLENTY TUTORIAL — isolated in its own file so future feature work in
// eat-plenty.html can update/extend the walkthrough without hunting through
// the whole app script. To add a step for a new feature: add an entry to
// TUTORIAL_STEPS below (title, body, optional tab/target/avoid/textAtBottom
// — see positionTutorialTarget()'s comment for what each does).
//
// A classic script (not type="module"), loaded via <script src="...">
// after eat-plenty.html's own main script. Both are classic scripts, so
// they share one global scope in both directions — this file freely
// references showTab/sb/cloudSession/tutorialActive/checkMissedYesterday
// from the main script, and the main script freely calls back into
// checkForTutorial()/startTutorial() from here, all by bare name, with no
// import/export or window.* bridging needed.
//
// Visual styling lives in tutorial.css (shared with index.html's own
// tutorial) — see that file for the look, this one for the behavior.
// ═══════════════════════════════════════════════════════════

const TUTORIAL_STEPS = [
  {
    title: 'Welcome to Eat Plenty!',
    body: "Let's track your nutrition.",
  },
  // ── Goals tab ──
  {
    title: 'Goals',
    body: 'Set up Bulk, Cut, or Maintain here and get auto-calculated calorie and macro targets.',
    tab: 'profile',
    target: '.nav-btn[data-tab="profile"]',
  },
  {
    title: 'Editing Your Goals',
    body: 'Tap Edit to set your goal type, intensity, target weight, and duration — your targets recalculate automatically.',
    tab: 'profile',
    target: '#ep-goals-edit-btn',
  },
  // ── Recipes tab ──
  {
    title: 'Recipes',
    body: 'Save your own custom foods here to reuse anytime you log a meal.',
    tab: 'recipes',
    target: '.nav-btn[data-tab="recipes"]',
  },
  {
    title: 'Creating a Custom Food',
    body: 'Tap + Create Food to save a food with its own macros, ready to add to any meal in seconds.',
    tab: 'recipes',
    target: '#ep-recipes-create-btn',
  },
  // ── Eat Plenty tab (the main daily log) ──
  {
    title: 'Eat Plenty',
    body: "This is your daily log — today's calories and macros at a glance, with every meal listed below.",
    tab: 'eatplenty',
    target: '.nav-btn[data-tab="eatplenty"]',
  },
  {
    title: 'Calories & Macros',
    body: 'Your calorie total and Protein/Carbs/Fat rings update live as you log food throughout the day.',
    tab: 'eatplenty',
    target: '#ep-rings',
  },
  {
    title: 'Logging Food',
    body: 'Tap + Add on any meal to log food three ways: Quick Add (type macros directly), Search Food, or Scan Barcode.',
    tab: 'eatplenty',
    target: '.ep-meal-add-btn',
  },
  // ── Weight tab ──
  {
    title: 'Weight',
    body: 'Log your weight here and watch your trend over time.',
    tab: 'weight',
    target: '.nav-btn[data-tab="weight"]',
  },
  {
    title: 'Logging Your Weight',
    body: "Enter your weight anytime — it's saved to your history and charted right below.",
    tab: 'weight',
    target: '#ep-weight-input',
  },
  // ── Stats tab ──
  {
    title: 'Stats',
    body: 'See your 7-day averages for calories and macros here.',
    tab: 'stats',
    target: '.nav-btn[data-tab="stats"]',
  },
  // ── Finale ──
  {
    title: "That's Eat Plenty!",
    body: 'Come back to the Goals tab anytime to replay this tutorial.',
  },
];

let tutorialStepIndex = 0;
// Guards the app's own "hey, log this" nudges (missed-yesterday modal,
// weight-today numpad prompt) so they never pop up on top of a tutorial
// step and steal focus/cover the text.
let tutorialActive = false;

function positionTutorialBoxAtBottom() {
  const box = document.getElementById('tutorial-box');
  box.style.top = 'auto';
  box.style.bottom = 'calc(env(safe-area-inset-bottom) + 96px)';
  box.style.transform = 'translateX(-50%)';
}

// Points the glowing ring + bouncing arrow at a real on-screen element for
// the current step, and places the text on the far side of the arrow so
// it never sits on top of the thing it's explaining.
//
// `avoidSelector` is an optional wider container to clear the text from —
// e.g. the target might be one item in a stack of several; ringing just
// that one item but only clearing the text past *its* edge would still
// land the text on top of a sibling right next to it. The ring/arrow
// always point at the exact target; only the text's clearance uses the
// wider rect when one is given.
//
// `textAtBottom` decouples the text from the ring/arrow entirely, anchoring
// it to the safe bottom-of-screen spot used for no-target steps — for a
// target inside a short, densely-packed panel where there isn't enough
// clearance on either side to grow the text away from it without
// overlapping something else. The ring/arrow still land precisely on the
// real target.
function positionTutorialTarget(selector, avoidSelector, textAtBottom) {
  const highlight = document.getElementById('tutorial-highlight');
  const arrow = document.getElementById('tutorial-arrow');
  const el = selector ? document.querySelector(selector) : null;
  const r = el ? el.getBoundingClientRect() : null;
  // A selector that resolves to a hidden element reports an all-zero rect —
  // treat that the same as no target at all instead of drawing a
  // degenerate ring in the corner.
  if (!el || (r.width === 0 && r.height === 0)) {
    highlight.style.display = 'none';
    arrow.style.display = 'none';
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

function renderTutorialStep() {
  const body = document.getElementById('tutorial-step-body');
  const backBtn = document.getElementById('tutorial-back-btn');
  const nextBtn = document.getElementById('tutorial-next-btn');
  const step = TUTORIAL_STEPS[tutorialStepIndex];
  if (step.tab) showTab(step.tab);
  body.innerHTML = `
    <div class="tutorial-step-title">${step.title}</div>
    ${step.body ? `<div class="tutorial-step-text">${step.body}</div>` : ''}
  `;
  backBtn.style.display = tutorialStepIndex === 0 ? 'none' : '';
  nextBtn.textContent = tutorialStepIndex === TUTORIAL_STEPS.length - 1 ? 'Done' : 'Next';
  positionTutorialTarget(step.target, step.avoid, step.textAtBottom);
}

function startTutorial() {
  tutorialActive = true;
  tutorialStepIndex = 0;
  showTab('profile');
  renderTutorialStep();
  document.getElementById('tutorial-overlay').classList.add('open');
}
function closeTutorial() {
  tutorialActive = false;
  document.getElementById('tutorial-overlay').classList.remove('open');
  positionTutorialTarget(null);
}
// Set by index.html's own tutorial right before it navigates here (see
// TUTORIAL_RESUME_KEY / navigateToEatPlenty in index.html's tutorial.js) —
// its mere presence means we arrived as part of that tour, not a normal
// standalone visit, and it already holds the step index to resume at over
// there. Only read here, never written — index.html owns clearing it on
// return.
const TUTORIAL_RESUME_KEY = 'trainhard_tutorial_resume';
const TUTORIAL_SUPPRESS_KEY = 'trainhard_tutorial_suppress_once';
const arrivedViaTutorialHandoff = localStorage.getItem(TUTORIAL_RESUME_KEY) !== null;

function tutorialGoNext() {
  if (tutorialStepIndex >= TUTORIAL_STEPS.length - 1) {
    if (arrivedViaTutorialHandoff) { location.href = 'index.html'; return; }
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

// Auto-plays on every open for anyone not signed in (mirrors index.html's
// checkForTutorial) — never for a signed-in user, always replayable via
// the Tutorial button on the Goals tab regardless of sign-in state.
async function checkForTutorial() {
  // Arriving via index.html's own tutorial always runs this tutorial too,
  // regardless of sign-in state — the user (or the auto-play) already
  // opted into seeing the whole tour, so this leg shouldn't get skipped
  // just because they happen to be signed in.
  if (arrivedViaTutorialHandoff) { startTutorial(); return true; }
  if (!sb) return false; // Supabase CDN failed to load — degrade silently, same as the rest of cloud sync
  const { data: { session } } = await sb.auth.getSession();
  if (session) return false;
  startTutorial();
  return true;
}

document.getElementById('ep-tutorial-btn').addEventListener('click', startTutorial);
document.getElementById('tutorial-exit-btn').addEventListener('click', () => {
  if (arrivedViaTutorialHandoff) {
    localStorage.removeItem(TUTORIAL_RESUME_KEY);
    localStorage.setItem(TUTORIAL_SUPPRESS_KEY, '1');
    location.href = 'index.html';
    return;
  }
  closeTutorial();
});
document.getElementById('tutorial-back-btn').addEventListener('click', tutorialGoBack);
document.getElementById('tutorial-next-btn').addEventListener('click', tutorialGoNext);
document.getElementById('tutorial-overlay').addEventListener('click', (e) => {
  if (e.target.closest('#tutorial-exit-btn, #tutorial-back-btn, #tutorial-next-btn')) return;
  tutorialGoNext();
});
