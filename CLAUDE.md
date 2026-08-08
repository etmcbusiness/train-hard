# Train Hard — Project Instructions

## Required pre-push changelog workflow

This app has an in-app "Update History" feature (`UPDATE_LOG` array near the
top of `index.html`, the `#update-toast` popup, and `#update-history-overlay`).
Every time a `git push` to this repo is about to happen, follow this exact
sequence — do not skip it, and do not push first and ask after:

1. **Before running `git push`**, present the user with the full bullet-point
   changelog for the update about to ship — what was added, changed, and
   fixed since the last push. Write it the way an end user would want to
   read it (plain language, one bullet per notable change), not a commit-log
   dump.
2. Wait for the user to either confirm it as-is, or edit/trim/rewrite it.
   Apply their edits.
3. Only once confirmed: add a new entry to the **front** of `UPDATE_LOG` in
   `index.html` (`unshift`, i.e. newest first — do not append) with the
   confirmed bullets, a `title`, today's `date`, and a `version` matching
   whatever the `app-version` meta tag is being bumped to for this push.
   Bump `<meta name="app-version">` in `index.html` to match.
4. Then proceed with the push.

This must happen for every push to this repo, regardless of which
conversation/session initiated it — it is not optional and does not need to
be re-requested by the user each time.

## Other conventions

- `sw.js`'s `CACHE_VERSION` only needs bumping when the `APP_SHELL` file list
  changes (new/removed static assets) — not for every content update, since
  HTML/JS are already served network-first.
- Default exercise data lives in `DEFAULT_EXERCISES` in `index.html`; the
  human-readable mirror is `default-exercises.md` in the repo root.
