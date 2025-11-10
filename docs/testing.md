# Testing Strategy

The repository relies on Vitest for fast, isolated unit tests plus a handful of integration-style suites that exercise file IO and Octokit boundaries through dependency injection.

## Running the Suite

```sh
npm run test
```

- Use `npm run test:watch` during development.
- Append `--coverage` (`npx vitest run --coverage`) when you need detailed instrumentation via V8.

## Test Layout

| File                                                                                                            | Focus                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `tests/scanner*.test.ts`                                                                                        | Glob discovery, regex coverage, and failure modes (missing files, permission errors).                                 |
| `tests/python-version-patterns.test.ts`                                                                         | Exhaustive coverage for every detector in `pythonVersionPatterns`.                                                    |
| `tests/latest-patch-resolver.test.ts`, `tests/python-org-fallback.test.ts`, `tests/runner-availability.test.ts` | Version resolution + offline snapshot handling.                                                                       |
| `tests/action-execution.test.ts`                                                                                | End-to-end flow using stubbed dependencies to verify skip reasons, workflow permission gates, and runner enforcement. |
| `tests/git-*.test.ts`                                                                                           | Branch management and pull-request logic using mocked `execFile` / Octokit clients.                                   |
| `tests/rewriter` suites (`patch`, `dry-run`, `idempotence`)                                                     | Ensures in-place replacements behave deterministically and avoid cross-track edits.                                   |
| `tests/pr-body.test.ts`                                                                                         | Makes sure the generated Markdown stays stable.                                                                       |
| `tests/coexistence-configs.test.ts`                                                                             | Validates the Renovate/Dependabot guidance shipped in `examples/coexistence/`.                                        |

Fixtures live under `tests/fixtures/**` and are intentionally small. Add new fixtures when you need to represent additional config shapes or file types.

## Writing New Tests

1. Prefer unit-level coverage by injecting dependencies via `ExecuteDependencies`. This allows you to stub network calls, Octokit, and filesystem interactions without complex setup.
2. When testing file rewriting logic, place sample files in `tests/fixtures` and load them with `readFileSync` to keep expectations realistic.
3. Keep assertions focused on observable behavior (return values, skip reasons, logged warnings via spies). Avoid reaching into private helpers.
4. If you add new skip reasons or inputs, extend `tests/action-execution.test.ts` to cover both the positive path and the new failure mode.

## Linting + Formatting Guards

CI should run `npm run lint` and `npm run format` (or the write variants) alongside tests to keep TypeScript, Vitest, and documentation tidy. The `lint` script already targets both `src/` and `tests/` so new tests automatically fall under lint coverage.
