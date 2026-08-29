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
npm run verify:static
npm run test:integration
npm run package:verify
```

What each command proves:

| Command                    | Proof                                                  |
| -------------------------- | ------------------------------------------------------ |
| `npm run verify:static`    | Types, unit tests, themes, performance, and formatting |
| `npm run test:integration` | Exact VSIX works in a clean VS Code Extension Host     |
| `npm run package:verify`   | VSIX contains only approved Marketplace files          |

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

CI creates one validated VSIX, a matching SHA-256 checksum, and the GitHub Release. Marketplace
publishing verifies those exact bytes and uses the protected `VSCE_PAT` secret.

## Security

Do not publish secrets or private account information. Report vulnerabilities through
[GitHub Security Advisories](https://github.com/overengineered-org/everforest-vscode-theme/security/advisories/new).
