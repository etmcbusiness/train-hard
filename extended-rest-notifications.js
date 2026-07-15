// ═══════════════════════════════════════════════════════════════════
// EXTENDED REST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════
//
// During an active training session, if too much time passes between
// completed sets, the app escalates through a series of nudges:
//
//   1. At X seconds idle           -> random sound from
//                                      assets/sounds/no-time-to-rest/
//   2. At X + (X * 0.5) seconds    -> random sound from
//                                      assets/sounds/no-time-to-rest/stage-2/
//   3. At that + (X * 0.5) more    -> random sound from
//                                      assets/sounds/no-time-to-rest/stage-2/stage-3/
//   4. At X * 3 seconds total      -> a prompt asking the user to
//                                      Finish or Cancel the workout
//
// Every stage is driven off the single X value below — change it here and
// every stage's timing scales with it automatically. X is always in SECONDS.
//
// Example: X = 60 gives stage times of 60s, 90s, 120s, and a final
// finish-or-cancel prompt at 180s.
//
// The clock resets to 0 every time the user completes a set, so this only
// fires after a genuinely long, unbroken idle stretch.
//
// Sound folders: drop numbered mp3 files (1.mp3, 2.mp3, 3.mp3, ...) into
// each folder — no other registration needed, see index.html's
// RANDOM_FOLDERS/loadRandomFolder for how they're picked up.

export const EXTENDED_REST_X_SECONDS = 30;

export const EXTENDED_REST_STAGE_1_SEC = EXTENDED_REST_X_SECONDS;
export const EXTENDED_REST_STAGE_2_SEC = EXTENDED_REST_X_SECONDS * 1.5;
export const EXTENDED_REST_STAGE_3_SEC = EXTENDED_REST_X_SECONDS * 2;
export const EXTENDED_REST_ASK_SEC = EXTENDED_REST_X_SECONDS * 3;
