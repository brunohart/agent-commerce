# Dispatch desk

**Sunday.** Closes the week: what shipped, what is next, and whether a stranger arriving today could find their way in.

## Why this desk exists

Six desks produce changes. Somebody has to say what they added up to, keep the queue honest, and look at the repo the way a newcomer does. A project that ships every day and never says what it shipped reads as noise.

## The job

One pull request, with up to four parts. Leave out any part that has nothing in it.

### 1. Changelog

Add the week's merged pull requests to `CHANGELOG.md` under "Unreleased", grouped as Added, Changed and Fixed. One line each, in terms of what a reader can now do or now knows, with the pull request number. Leave out pull requests that changed nothing a reader would notice.

When "Unreleased" holds enough to be worth announcing, propose a release: move it under a version and a date, bump `version` in `package.json`, and put a release note in the pull request description, ready to paste. Tagging and publishing the release are the maintainer's. List them under "Needs a human".

### 2. Roadmap

Tick what merged. Remove nothing: a ticked item stays, with its pull request number. Where a desk found that an item was wrong or bigger than it looked, rewrite the item to say what is now known. Add items that the week's issues and run records turned up, at the bottom of their track. Do not reorder. The order is the maintainer's.

### 3. The shelf

Keep between three and five open issues labelled `good first issue`. Each one:

- can be done in under an hour by someone who has read only the README,
- names the files to look at,
- says what done looks like,
- is real work that the project needs, not an exercise.

Write new ones when the shelf is short. Good sources: the "Declined" lines in the week's run records, roadmap items that split cleanly, rough edges you found in part 4.

### 4. The front door

Do what a newcomer does. From a clean clone, follow the README's "Run it" section exactly as written, then `CONTRIBUTING.md`. Fix what tripped you: a command that no longer matches, a count that drifted, a dead link, a file the "Where to look" table should mention. Check every figure the README quotes against `docs/results.json` and `docs/jev-measured.json`.

The README and the thesis are the maintainer's voice. Correct a figure or a link. Propose anything larger in the pull request description.

## Also, when due

- **Stale work.** List any `routine` pull request open for more than seven days, and any issue from an outside contributor with no reply, under "Needs a human".
- **Re-baseline.** If the Model desk's record shows the alias has moved off the pin, or the corpus has grown by a quarter since the baseline was taken, say so under "Needs a human" and recommend whether to re-baseline. Do not do it.
- **Playbooks.** If the week's run records show a desk repeatedly declining the same thing, or repeatedly producing something the maintainer closed, propose a change to its playbook in the description. Do not make it. That is an `ops:` pull request.

## Not this desk

Doing another desk's job because its week was quiet. Announcements anywhere outside this repository. Metrics about stars and followers.

## Done means

The changelog matches what merged. The roadmap matches the changelog. The shelf has three to five issues. Every command in the README's "Run it" section was run and worked.
