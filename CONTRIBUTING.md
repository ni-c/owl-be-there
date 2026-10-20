# Contributing

Thank you for wanting to help. Bug reports, ideas and pull requests are all welcome — please open an issue first for anything larger than a small fix, so we can agree on the shape before you spend an evening on it.

## Development setup

You need Node.js 26 (see `.nvmrc`) and npm.

```sh
npm ci
npm run dev
```

`npm run dev` builds the shared package and the server, then recompiles both on every edit and runs the API on <http://localhost:8080> and the client with hot reload on <http://localhost:5173>, which forwards `/api` to the API.

Share links, QR codes and invitation texts are built on `PUBLIC_URL`, which defaults to `http://localhost:8080` — an API-only server in development, so copied links do not open the app. Put `PUBLIC_URL=http://localhost:5173` in a `.env` at the repository root (the server's dev script loads it) and they open the dev server.

Always install with `npm ci`. A plain `npm install` on some machines drops the optional platform packages of Rolldown and Tailwind from `package-lock.json`, and the Docker build and CI fail on the next run. If you add a dependency, check the lockfile diff for removed `@rolldown/binding-*` or `@tailwindcss/oxide-*` entries.

## Checks

| Command                 | What it does                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `npm run lint`          | ESLint (including accessibility rules for the client) and Prettier                   |
| `npm run typecheck`     | TypeScript over every package, the tests and the end-to-end suite                    |
| `npm test`              | The unit and API tests — no database server, no browser                              |
| `npm run test:coverage` | The same, with coverage thresholds                                                   |
| `npm run test:tz`       | The date-handling tests under five time zones, at a minute before and after midnight |
| `npm run test:e2e`      | Playwright in Chromium and WebKit, desktop and mobile with touch                     |
| `npm run ci:local`      | All of the above, plus `npm audit` and a secret scan                                 |
| `npm run screenshot`    | After a build: the README's pictures of the start page example, and `og.png`         |

The end-to-end suite needs the browsers once: `npx playwright install chromium webkit`. On a Linux distribution Playwright does not support, WebKit will not start; run the suite in the official image instead, after `npm run build`:

```sh
docker run --rm --ipc=host -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD:/work" -w /work \
  mcr.microsoft.com/playwright:v1.63.0-noble npx playwright test --config e2e/playwright.config.ts
```

The image must carry Node 26; if its Node is older, mount a Node 26 installation and put it first on `PATH`.

## Conventions

- Everything in the repository is English: code, comments, commit messages, pull requests.
- Calendar days are `YYYY-MM-DD` strings. Never parse them with `new Date(string)` — the linter refuses string and template literals and `Date.parse` (a string in a variable it cannot see, so the time-zone tests are the net), and `packages/shared/src/dates.ts` has what you need.
- Every change comes with tests, including the edge cases: empty input, the first and last day, both directions of a selection, values out of range.
- The application makes no requests to third parties — no fonts, no scripts, no analytics. Keep it that way.
- Commit messages are imperative ("Add the week toggle", not "Added …").

## Translations

`packages/client/src/i18n/en.ts` is the source text and the type of every other dictionary: a missing key is a build error, and a test compares the placeholders. Every language should read like the others:

- Address one person informally (du, tu, tú, você, je, ty, ты, ти, sen, kamu, تو, 你). Where the informal pronoun is rude to strangers, use the friendly everyday register instead: Korean 해요체, Urdu آپ. Use the plural only where the whole group is addressed, as in the tagline and the FAQ.
- Short, friendly, plain sentences, no marketing tone.
- Typographic punctuation: ’ for apostrophes, — for dashes, … for an ellipsis, and the language's own quotation marks. Quote the event title inside a sentence: „{title}“, «{title}», ”{title}”, 「{title}」.
- Localize examples and placeholders instead of translating them word for word: "Football in the park" is "Calcetto al parco" in Italian. The example person stays Anna, and "Willi Thiel" stays in Latin script.
- One word per concept: event, organiser, organiser link, poll, answer, yes and maybe. Keep the candidate days apart from the chosen date — they must never share a word.
- Counted texts come in `_one` / `_other` pairs. Languages with a `few` category add its forms (`csFew`, `plFew`, `ruFew`, `ukFew`), Arabic adds `arForms`. Check 1, 2, 5, 21 and 22.

A new language is registered in these places:

1. `packages/shared/src/texts.ts`: `LANGUAGES`, `LOCALES`, `LANGUAGE_NAMES`, `TAGLINES` and `SERVER_TEXTS`.
2. `packages/shared/src/home.ts`: `HOME_TEXTS`.
3. `packages/client/src/i18n/<code>.ts`, listed in `i18n/index.tsx` (`DICTIONARIES`, `FEW_FORMS`, and `detectLanguage` when browser tags need mapping, as for `zh` and `no`).
4. The `language` check in `packages/server/src/db/migrations.ts`. A released migration never changes: add one that rebuilds the `events` table with the longer list.
5. Scripts Nunito does not cover (it has Latin, Cyrillic and Vietnamese): a bundled font in `packages/client/public/fonts` with its rule in `styles.css`, and the font choice for link previews in `shared/preview.ts` and `server/src/preview.ts`. A right-to-left language goes into `RTL_LANGUAGES` in `texts.ts`; a language whose short weekday names are the full ones heads the calendar columns with letters (`weekdayHeading` in `client/src/lib/locale.ts`). A locale whose default calendar is not the Gregorian one pins it (`fa-IR-u-ca-gregory`).
6. The language lists in the tests and in the README.

## Releasing

Maintainers only.

1. Move the entries under `## [Unreleased]` in `CHANGELOG.md` to a new `## [x.y.z] - YYYY-MM-DD` section and add its link reference at the bottom.
2. Set the version in the root `package.json` and in the three workspace manifests, and move the image tag in `compose.example.yaml` to the same version (the release workflow refuses a tag that leaves it behind).
3. Open a pull request, let CI pass, merge it.
4. Tag the merge commit on `main` with a signed tag and push it: `git tag -s vx.y.z -m vx.y.z && git push origin vx.y.z`.

The release workflow checks that the tag matches the version in all four manifests, is a signed tag GitHub verifies (your GPG public key must be on your GitHub account), that `compose.example.yaml` names the version (pre-releases such as `v1.0.0-rc.1` skip this check) and that the CHANGELOG has a section for it, publishes the container image to `ghcr.io/ni-c/owl-be-there` and creates the GitHub release. Never move a tag that has been pushed.
