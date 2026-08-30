# Contributing

Run `npm ci` first. Required: Node.js 24.

Read [PRODUCT.md](PRODUCT.md) and [DESIGN.md](DESIGN.md) before changing product behavior or color
semantics.

## Make one change

1. Create a focused branch from `main`.
2. Edit TypeScript under `src/`.
3. Run `npm run generate` when theme output changes.
4. Commit the generated `themes/*.json` files.
5. Run the checks below.

Do not hand-edit `themes/*.json`.

## Validate

Run before opening a pull request:

```sh
npm run verify:local
```

This one gate proves:

- Static types, unit tests, themes, performance, formatting, and dependency audits pass.
- The exact local VSIX works on Linux stable, Linux VS Code 1.95.3, and native macOS.
- CodeQL scans GitHub Actions and JavaScript/TypeScript with the pinned official bundle.
- Gitleaks scans history, tracked changes, staged changes, and untracked files.

ACT uses one digest-pinned Ubuntu image and reuses its container. The pinned CodeQL bundle is cached
in the `everforest-codeql-cache` Docker volume. Each run prunes dangling images only; it preserves
the runner image, reusable container, named cache, and every unrelated tagged image.

After pushing and opening the pull request, report the exact validated commit:

```sh
npm run verify:local:report
```

## Runtime boundaries

- `src/theme.ts` owns theme compilation.
- `src/extension.ts` owns desktop regeneration and scheduling.
- `src/extension-web.ts` owns the web fallback message.
- No runtime code may access workspaces, source files, telemetry, or the network.
- Add dependencies only when VS Code or Node cannot meet the requirement clearly.

## Pull requests

Use a Conventional Commit title:

```text
fix: correct terminal ANSI red
feat: add a theme preference
docs: clarify local validation
```

Accepted types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, and `chore`.

- Keep one scope per pull request.
- Explain the visible effect.
- Include generated theme JSON when required.
- Use squash merge only.

## Releases

- `fix:` → patch.
- `feat:` → minor.
- `feat!:` or `BREAKING CHANGE` → major.
- Documentation and chore-only changes → no release.

GitHub Actions does not run automatically. A maintainer manually dispatches **Release** with the
exact current `main` SHA. GitHub then provides the real Windows/macOS runners, CodeQL SARIF upload,
GitHub Release permissions, and protected Marketplace secret. One validated VSIX and matching
SHA-256 checksum move through every release job unchanged.

## Security

Do not publish secrets or private account information. Report vulnerabilities through
[GitHub Security Advisories](https://github.com/overengineered-org/everforest-vscode-theme/security/advisories/new).
