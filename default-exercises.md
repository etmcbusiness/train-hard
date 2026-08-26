# Default Exercises

Reference/editable copy of the exercises seeded automatically into every user's
library — the source of truth actually used by the app is the `DEFAULT_EXERCISES`
array in `index.html` (search for that name). Edit that array to change what
gets seeded; this file is for humans to review/plan against, it isn't read by
the app itself.

Every entry gets **Rest Time: 90 seconds (1:30)** and is marked with a small
☆ badge in the app (distinct from the filled ★ used for Track Exercises/PRs)
so it's identifiable and safe to delete without confusion. Deleting one is
permanent — it will not be re-added on a future visit.

Parsed from `Defualt Exercises.xlsx` (now removed after import — this file is
the durable replacement for it).

## Notes / assumptions made during import

- The spreadsheet listed several "slots" per muscle (like exercise-variety
  options); duplicate exercise **names** with a *different* category (e.g.
  "Bench Press" Barbell vs. Dumbbell) were kept as separate exercises. Exact
  name+category duplicates were collapsed to one.
- "Cable Machine (3 Pulleys)" → category **Cable Machine**, pulley count **3**.
- Typos fixed: "Neck Rotaions" → "Neck Rotations", "Seat Toe Touch Single" →
  "Seated Toe Touch Single", trailing space on "Leg Extensions " trimmed.
- Neck and Hamstrings each had a second "Wellness: Stretching" block in the
  sheet reusing some of the same movement names (e.g. both a weighted "Neck
  Curl" and a "Neck Curl Stretch"). Treated as **additive** — both the
  weighted exercise and the stretch exist side by side — rather than the
  stretch replacing the weighted one. The stretch versions were renamed with
  a "Stretch" suffix where they'd otherwise collide with the weighted
  exercise's name, so they don't look identical in the exercise list. **If
  that's wrong and the Neck/Hamstrings stretches were meant to replace their
  weighted counterparts instead, tell me and I'll remove the weighted ones.**
- Heat/Cold Exposure entries have no category (they always use the app's
  fixed Temp+Duration flow) and no explicit body part (they're Wellness).
- Cardio's "Weighted + Distance" / "Distance" categories use the app's
  normal tap-to-enter-time field (not the stopwatch) — matches how every
  other Cardio exercise in the app already works, since only Cardio's plain
  "Duration" category uses the running stopwatch.

## Chest
| Name | Category |
|---|---|
| Bench Press | Barbell |
| Incline Bench Press | Barbell |
| Bench Press | Dumbbell |
| Incline Bench Press | Dumbbell |
| Cable Fly | Cable Machine (3P) |

## Front Delts
| Name | Category |
|---|---|
| Seated Overhead Press | Barbell |
| Standing Overhead Press | Barbell |
| Seated Overhead Press | Dumbbell |

## Side Delts
| Name | Category |
|---|---|
| Lateral Raise | Dumbbell |
| Lateral Raise | Cable Machine (3P) |

## Rear Delts
| Name | Category |
|---|---|
| Rear Delt Fly | Dumbbell |
| Rear Delt Fly | Cable Machine (3P) |

## Traps
| Name | Category |
|---|---|
| Shrugs | Dumbbell |
| Shrugs Single | Dumbbell |
| Shrugs | Barbell |

## Mid Back
| Name | Category |
|---|---|
| Bent Over Row | Barbell |
| Cable Row | Cable Machine (3P) |

## Lats
| Name | Category |
|---|---|
| Pull Ups | Weighted Body Weight |
| Wide Grip Pull Ups | Weighted Body Weight |
| Lat Pull Down | Cable Machine (3P) |
| Lat Pull | Cable Machine (3P) |

## Upper Back
| Name | Category |
|---|---|
| Face Pulls (Rope) | Cable Machine (3P) |
| Reverse Flys | Dumbbell |

## Lower Back
| Name | Category |
|---|---|
| Back Extension | Weighted Body Weight |
| Good Morning | Barbell |

## Biceps
| Name | Category |
|---|---|
| Bicep Curl | Barbell |
| Bicep Curl | Dumbbell |
| Preacher Curl | Dumbbell |
| Cable Curl | Cable Machine (3P) |
| Hammer Curl | Dumbbell |

## Triceps
| Name | Category |
|---|---|
| Overhead Extension | Barbell |
| Overhead Extension | Dumbbell |
| Overhead Extension | Cable Machine (3P) |
| Tricep Push Down (Rope) | Cable Machine (3P) |
| Tricep Push Down (Straight Bar) | Cable Machine (3P) |

## Forearms
| Name | Category |
|---|---|
| Forearm Curl | Barbell |
| Reverse Forearm Curl | Barbell |
| Forearm Curl | Cable Machine (3P) |
| Reverse Forearm Curl | Cable Machine (3P) |

## Abs
| Name | Category |
|---|---|
| Cable Crunch | Cable Machine (3P) |
| Lying Leg Raise | Weighted Body Weight |
| Hanging Leg Raise | Weighted Body Weight |
| Hanging Knee Raise | Weighted Body Weight |

## Obliques
| Name | Category |
|---|---|
| Side Cable Crunch | Cable Machine (3P) |
| Cable Twist | Cable Machine (3P) |

## Neck
| Name | Category |
|---|---|
| Neck Curl | Weighted Body Weight |
| Lateral Neck Flexion | Weighted Body Weight |
| Reverse Neck Curl | Weighted Body Weight |
| Neck Rotations *(Stretching)* | — |
| Neck Curl Stretch *(Stretching)* | — |
| Reverse Neck Curl Stretch *(Stretching)* | — |
| Lateral Neck Flexion Stretch *(Stretching)* | — |

## Quads
| Name | Category |
|---|---|
| Leg Extensions | Cable Machine (3P) |
| Leg Extensions Single | Cable Machine (3P) |
| Squat | Barbell |

## Hamstrings
| Name | Category |
|---|---|
| Lying Leg Curl | Cable Machine (3P) |
| Sitting Leg Curl | Cable Machine (3P) |
| Straight Leg Deadlift | Barbell |
| Straight Leg Deadlift | Dumbbell |
| Standing Toe Touch *(Stretching)* | — |
| Seated Toe Touch *(Stretching)* | — |
| Seated Toe Touch Single *(Stretching)* | — |

## Calves
| Name | Category |
|---|---|
| Seated Calf Raise | Plate Loaded Machine |
| Standing Calf Raise | Plate Loaded Machine |

## Glutes
| Name | Category |
|---|---|
| Hip Thrust | Plate Loaded Machine |
| Hip Thrust | Barbell |
| Step Ups | Dumbbell |

## Wellness — Cardio
| Name | Category |
|---|---|
| Walking | Weighted + Distance |
| Running | Distance |
| Assault Bike | Distance |

## Wellness — Heat Exposure
| Name |
|---|
| Infrared Sauna |
| Steam Sauna |
| Traditional Sauna |

## Wellness — Cold Exposure
| Name |
|---|
| Cold Shower |
| Cold Plunge |

**Total: 75 exercises** (67 muscle-group + 3 Cardio + 3 Heat Exposure + 2 Cold Exposure)

## Notes on the Shoulders split

'Shoulders' was replaced with three independently-tracked heads (Front
Delts, Side Delts, Rear Delts), and Lower Back was added as a new tracked
muscle. The 3D model doesn't have dedicated meshes for these four yet, so
they won't get per-level glow/coloring on the avatar for now — they still
track sets, goals, and levels like any other muscle. A one-time migration
(`migrateShouldersToDeltHeads` in `index.html`) reassigns any
already-logged 'Shoulders' history/exercises/goals into Front or Side Delts
by exercise name (Lateral Raise → Side Delts, everything else → Front
Delts) the next time each user's client loads.
