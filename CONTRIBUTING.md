# Contributing

## Setup

This is a zero-runtime VS Code theme. Use Node.js 24, then install the locked development
dependencies:

```sh
npm ci
```

## Make a change

1. Create a focused branch from `main`.
2. Edit the TypeScript sources in `src/`; do not hand-edit files in `themes/`.
3. When source changes affect a theme, regenerate and commit all updated `themes/*.json` files:

   ```sh
   npm run generate
   ```

4. Run the relevant checks. Before opening a PR, run:

   ```sh
   npm run verify:static
   npm run test:integration
   npm run package:vsix
   npm run package:verify
   ```

`npm run verify:static` checks generated themes, types, unit tests, theme validation, and
formatting. The packaged VSIX is build-time output only: the extension has no runtime service or
backend.

## Commits and pull requests

Use a focused Conventional Commit PR title and final squash-commit title:

```text
fix: correct terminal ANSI red
feat(theme): add a semantic token mapping
docs: clarify local validation
```

Accepted types are `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, and `chore`.
Use an optional lowercase scope containing letters, digits, and hyphens. Use `!` or a
`BREAKING CHANGE` footer for a breaking change.

Keep each PR scoped, explain the visible theme effect, include regenerated theme JSON where
applicable, and ensure CI passes. PRs merge by squash only.

## CI and releases

GitHub Actions validates the VSIX and production dependency audit, runs desktop integration tests on
Linux, macOS, and Windows, validates the PR title, and performs a semantic release dry run. A
successful eligible squash merge to `main` creates a GitHub Release with a versioned VSIX and
SHA-256 checksum. The release workflow verifies those exact bytes and automatically promotes them to
the Visual Studio Marketplace through Microsoft Entra ID.

`fix:` releases a patch, `feat:` a minor, and `feat!:` or `BREAKING CHANGE` a major. Documentation
and chore-only changes do not release. No Marketplace PAT is stored in the repository.

## Security

Do not report vulnerabilities in public issues or include secrets, tokens, or private account
information. Use
[GitHub Security Advisories](https://github.com/overengineered-org/everforest-vscode-theme/security/advisories/new)
for private reports.
