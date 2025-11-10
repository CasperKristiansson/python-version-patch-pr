# Development Handbook

This guide is for contributors working inside this repository. Review `CONTRIBUTING.md` for code of conduct and review policies; use this document for day-to-day tasks.

## Prerequisites

- Node.js 20.x (matches the runtime declared in `action.yml`).
- npm 10.x (ships with Node 20) or pnpm/yarn if you manage lockfiles manually (the repo currently uses npm + `package-lock.json`).
- Git credentials capable of pushing branches and force-with-lease updates.

Optional tooling:

- `act` for local GitHub Actions simulation.
- `direnv` or `dotenv` tooling to manage offline snapshot variables.

## Install & Bootstrap

```sh
npm install
```

This installs both runtime and dev dependencies, including TypeScript, ESLint, Vitest, and `@vercel/ncc`.

## Common Scripts

| Command          | Purpose                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run lint`   | ESLint across `src/` and `tests/`. Use `npm run lint:fix` to apply safe fixes.                                                             |
| `npm run format` | Prettier check. Use `npm run format:write` to rewrite files.                                                                               |
| `npm run test`   | One-off Vitest run with the default reporter. Use `npm run test:watch` during development.                                                 |
| `npm run build`  | TypeScript compilation (`tsc --project tsconfig.json`). Produces `dist/` JS for testing but does not bundle dependencies.                  |
| `npm run bundle` | Runs `ncc build src/index.ts -o dist`. Execute this before publishing or updating the Action release tag so `dist/index.js` stays in sync. |
| `npm run clean`  | Remove `dist/`. Useful after dependency upgrades.                                                                                          |

## File Layout

- `src/` – source TypeScript. Organized by domain (`scanning`, `versioning`, `git`, `rewriter`).
- `tests/` – Vitest suites matching module names. Some tests rely on fixtures in `tests/fixtures/**`.
- `dist/` – compiled output committed to the repo for GitHub Action distribution.
- `examples/` – downstream repository templates used by documentation + tests.

## Development Workflow

1. Create a feature branch off `main`.
2. Run `npm run lint && npm run test` before committing.
3. If you changed runtime code, either run `npm run build` for local testing or `npm run bundle` if you expect to publish the Action.
4. Commit both `src` changes and regenerated `dist` artifacts in the same PR (the marketplace consumes `dist/`).
5. Update `CHANGELOG.md` when shipping meaningful behavior changes.

## Local Execution

You can run the action outside of GitHub by executing the compiled entry point and supplying the same environment variables GitHub would provide:

```sh
GITHUB_WORKSPACE=$PWD \
GITHUB_REPOSITORY=owner/repo \
GITHUB_TOKEN=ghp_xxx \
node dist/index.js
```

Set `INPUT_*` variables to mimic workflow inputs (for example `INPUT_TRACK=3.12`). This technique is useful for debugging skip reasons on large repositories.

## Offline Testing

When verifying the offline mode, populate snapshot environment variables before running unit tests or the compiled action:

```sh
export NO_NETWORK_FALLBACK=true
export CPYTHON_TAGS_SNAPSHOT=$(cat tests/fixtures/cpython-tags.json)
export RUNNER_MANIFEST_SNAPSHOT=$(cat tests/fixtures/runner-manifest.json)
```

Vitest suites include targeted fixtures, but end-to-end local runs help reproduce integration issues quickly.

## Releasing

1. Ensure `dist/` matches `src/` (`npm run bundle`).
2. Bump the version in `package.json` and update `CHANGELOG.md`.
3. Tag the commit (`git tag v0.1.0 && git push origin --tags`).
4. Update the GitHub Action release (`v1`, `v1.x.x`) as needed.

## Tooling Notes

- ESLint extends `@typescript-eslint` v8 with `eslint.config.mjs`. Adjust rules centrally instead of scattering `eslint-disable` comments.
- Tests rely on Vitest’s Node environment. Avoid global state; inject dependencies through `ExecuteDependencies` to keep suites hermetic.
- The bundled action uses `ncc`, so dynamic `require` calls may need special handling. Keep imports static where possible.
