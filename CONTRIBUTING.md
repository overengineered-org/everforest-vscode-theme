# Contributing

Use Node.js **24.14.0** exactly. `npm ci` installs the locked dependencies.

For `npm run verify:local`, install these commands: `act`, `awk`, `cmp`, `docker`, `git`,
`gitleaks`, `node`, `npm`, and `shasum`. The optional `npm run verify:local:report` status step also
needs `gh`. The repository pins the ACT runner image by digest in `.actrc`.

## Make one change

1. Create a focused branch from `main`.
2. Edit TypeScript under `src/` or the relevant source-owned file.
3. Run `npm run generate` when theme output changes.
4. Commit generated `themes/*.json` files with the source change.
5. Run the checks below.

Do not hand-edit `themes/*.json`; `src/theme.ts` is the compiler.

## Validate

Start with the smallest relevant check:

```sh
npm run verify:static
npm run test:integration
npm run package:verify
```

Before opening a pull request, run the complete local gate:

```sh
npm run verify:local
```

The gate runs a digest-pinned ACT Linux job, then host-side packaging and native macOS Extension
Host checks. ACT uses `--rm`, a bind-mounted repository, an anonymous
`/github/workspace/node_modules` volume so container dependencies stay separate from the host, and
the named `everforest-codeql-cache` volume for the CodeQL bundle. `--rm` removes the temporary ACT
container and anonymous dependency volume after the run; the named cache persists.

The ACT job builds and tests one local VSIX and checksum. The host validates and tests those exact
bytes for package validation and native macOS testing; it does not rebuild them. Release jobs build
one versioned VSIX and checksum, test that same artifact on Linux, macOS, Windows, and VS Code
1.95.3, and publish only those tested bytes.

After pushing and opening the pull request, report the exact validated commit:

```sh
npm run verify:local:report
```

That command fails unless the worktree is clean and the pushed branch points to the validated
commit.

## Runtime boundaries

- `src/theme.ts` owns theme compilation.
- `src/extension.ts` owns Desktop regeneration and scheduling.
- `src/extension-web.ts` owns the browser fallback message.
- Runtime code reads VS Code configuration and its installed theme files, and writes global
  extension/native theme settings plus the extension's two generated configurable theme files. It
  may inspect workspace/folder configuration values only to guard those global-only writes; it does
  not read workspace files or source code, send telemetry, or make network requests. Automatic
  Light/Dark coordinates global `window.autoDetectColorScheme` and `workbench` theme settings.
- Add dependencies only when VS Code or Node cannot meet the requirement clearly.

## Pull requests

Use a Conventional Commit title:

```text
fix: correct terminal ANSI red
feat: add a theme preference
perf: reduce theme regeneration time
docs: clarify local validation
```

Accepted types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, and `chore`.

- Keep one scope per pull request.
- Explain the visible effect.
- Include generated theme JSON when required.
- For `perf:`, preserve behavior and the public contract, and include or update the relevant
  performance benchmark. Use `fix:` or `feat:` when user-visible behavior changes.
- Use squash merge only.

## Releases and recovery

- `fix:` → patch.
- `perf:` → patch only for behavior-preserving optimization with benchmark evidence.
- `feat:` → minor.
- `feat!:` or `BREAKING CHANGE` → major.
- Documentation and chore-only changes → no release.

GitHub Actions does not run automatically. A maintainer manually dispatches **Release** with the
exact current `main` SHA and a patch, minor, or major increment. The workflow builds one exact
versioned VSIX, preserves it as the `validated-vsix` artifact, tests it across the matrix, and then
creates the GitHub Release and publishes the same checksum-backed bytes to the Marketplace.

The **GitHub Release recovery** workflow takes the failed Release run ID and its version tag. It
validates the failed run, tag, and unexpired `validated-vsix` artifact, tests that exact artifact
across the same matrix, then creates a missing GitHub Release only after package and Extension Host
checks pass. If the release already exists, recovery verifies its exact state and bytes without
mutation; it never repairs or clobbers one.

Marketplace recovery is a separate protected workflow. It verifies an already-published GitHub
Release, publishes that exact package, then verifies the package endpoint and live Marketplace
catalog. Do not claim Marketplace recovery completed until that workflow and live readback pass.

GitHub Releases are authoritative for release notes and versioned artifacts; see
[CHANGELOG.md](CHANGELOG.md).

## Security

Do not publish secrets or private account information. Report vulnerabilities through
[GitHub Security Advisories](https://github.com/overengineered-org/everforest-vscode-theme/security/advisories/new).
