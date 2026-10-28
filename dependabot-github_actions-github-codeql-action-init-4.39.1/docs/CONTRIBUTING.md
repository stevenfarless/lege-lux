# Contributing

## Local setup

Lege Lux is a static GitHub Pages app. It uses HTML, CSS, vanilla JavaScript,
and local JSON files. Use a local web server instead of opening `index.html`
directly, because browser CORS rules can block JSON fetches from local files.

1. Install Node.js 24.x with npm.
2. Clone the repo.
3. Check out the source branch:

```bash
git checkout exp
```

4. Install the required unit-test and formatting dependencies:

```bash
npm install
```

5. Start a local static server from the repo root:

```bash
python3 -m http.server 8080
```

6. Open `http://localhost:8080` in a browser.

`npx serve .` or VS Code Live Server are also fine. The app does not require a
build step.

## Unit tests and formatting

These commands come from `package.json` and are the required local validation
path for normal JavaScript changes:

```bash
npm test
npm run format:check
```

Useful variants:

```bash
npm run test:watch
npm run test:coverage
```

## Optional Playwright browser tests

Playwright smoke tests exist in the repo, but Playwright is optional local
setup. It is not currently listed as an npm script such as `npm run e2e`.
Install it only when you need browser coverage:

```bash
npm install --no-save @playwright/test
npx playwright install chromium
npx playwright test tests/smoke.spec.js --project=chromium
```

To run a specific Playwright test, add `--grep`:

```bash
npx playwright test tests/smoke.spec.js --project=chromium --grep "page load"
```

## Restricted terminal caveat

Some restricted VS Code, Flatpak, sandboxed, or remote terminals do not inherit
the same PATH as the system terminal. If `node` or `npm` is unavailable after
Node is installed, open a normal system terminal, install Node in that
environment, or launch VS Code from the terminal so its integrated terminal
inherits the correct PATH.

## Branch workflow

- `exp` is the source branch for active development.
- Feature branches should be named `feat/<description>`.
- Bug fix branches should be named `fix/<description>`.

## PR standards

- Title must follow Conventional Commits format.
- Include a description of what changed and why.
- Reference any related issues.

## Commit conventions

Use Conventional Commits:

- `feat:` new feature
- `fix:` bug fix
- `chore:` maintenance/tooling
- `refactor:` code restructure without behavior change
- `docs:` documentation only

## Formatting

Check formatting without changing files:

```bash
npm run format:check
```
