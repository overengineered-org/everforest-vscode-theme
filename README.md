# Everforest Complete

[![CI](https://github.com/overengineered-org/everforest-vscode-theme/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/overengineered-org/everforest-vscode-theme/actions/workflows/ci.yml)
[![Build](https://img.shields.io/github/check-runs/overengineered-org/everforest-vscode-theme/main?nameFilter=Static%20validation%20and%20VSIX&label=Build)](https://github.com/overengineered-org/everforest-vscode-theme/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/github/check-runs/overengineered-org/everforest-vscode-theme/main?nameFilter=Tests&label=Tests)](https://github.com/overengineered-org/everforest-vscode-theme/actions/workflows/ci.yml)
[![VS Code 1.95.0+](https://img.shields.io/badge/VS_Code-1.95.0%2B-007ACC?logo=visualstudiocode&logoColor=white)](./package.json)

**Requires VS Code 1.95.0 or later.**

The complete Everforest color theme for Visual Studio Code: Light and Dark, each in Soft, Medium,
and Hard contrast.

This is a zero-runtime theme extension. It contributes static color-theme JSON and does not start
extension code, background processes, telemetry, or network requests.

## Quick start

1. In VS Code, open **Extensions**.
2. Search for `Everforest Complete`.
3. Select the extension published by **Overengineered**.
4. Choose **Install**.
5. Run **Preferences: Color Theme**, then choose an Everforest Complete variant.

## Follow system appearance

Want Everforest to switch with macOS, Windows, or Linux Light/Dark mode?

**Auto is not a theme in the Color Theme picker.** VS Code handles automatic switching through its
User Settings, using one preferred light theme and one preferred dark theme.

1. Open the Command Palette.
2. Choose **Preferences: Open User Settings (JSON)**.
3. Add this to your global VS Code User Settings JSON:

```json
{
  "window.autoDetectColorScheme": true,
  "workbench.preferredDarkColorTheme": "Everforest Complete Dark Medium",
  "workbench.preferredLightColorTheme": "Everforest Complete Light Medium"
}
```

Do **not** add these settings to a project's `.vscode/settings.json`. They apply across projects in
the current VS Code profile. Repeat them for each profile you use.

Settings Sync can restore the Marketplace extension and these settings on your other VS Code
installations.

## Other installation paths

### GitHub Releases

1. Download `everforest-complete-X.Y.Z.vsix` from the
   [latest GitHub Release](https://github.com/overengineered-org/everforest-vscode-theme/releases/latest).
2. In VS Code Desktop, open **Extensions**.
3. Select **Views and More Actions…** (`…`) → **Install from VSIX…**.
4. Select the downloaded `.vsix` file.
5. Run **Preferences: Color Theme**, then choose an Everforest Complete variant.

### Build locally

Prerequisites: Node.js 24 and npm.

```sh
git clone https://github.com/overengineered-org/everforest-vscode-theme.git
cd everforest-vscode-theme
npm ci
npm run package:vsix
```

This creates `dist/everforest-complete.vsix`. In VS Code Desktop, open **Extensions**, select
**Views and More Actions…** (`…`) → **Install from VSIX…**, then choose that file. Do not commit
VSIX binaries to Git.

### Terminal

If the VS Code command is already available, install the downloaded release directly:

```sh
code --install-extension overengineered-org.everforest-complete
```

Use `code-insiders` for VS Code Insiders. To install a downloaded release instead, replace the
extension identifier with the VSIX path. If neither command exists, use [Quick start](#quick-start).

### Remote development

For SSH, Dev Containers, WSL, or Codespaces through VS Code Desktop, install the theme into the
**Local** VS Code client when prompted. A theme has no remote runtime.

Browser-hosted VS Code, including `vscode.dev` and browser Codespaces, can install this zero-runtime
theme from the Marketplace. Browser hosts cannot install the GitHub-hosted VSIX directly.

## Verify a release download

Each release includes a `.sha256` checksum. Run the matching command from the folder containing both
the VSIX and checksum file.

**macOS**

```sh
shasum -a 256 -c everforest-complete-X.Y.Z.vsix.sha256
```

**Linux**

```sh
sha256sum -c everforest-complete-X.Y.Z.vsix.sha256
```

**Windows PowerShell**

```powershell
Get-FileHash everforest-complete-X.Y.Z.vsix -Algorithm SHA256
```

Compare the result with the downloaded checksum file.

Marketplace installations receive updates through VS Code. Manually installed VSIX files do not;
download each newer GitHub Release and repeat [GitHub Releases](#github-releases).

## Choose a variant

Medium is the balanced default. Choose Soft for lower contrast or Hard for higher contrast.

| Appearance | Soft      | Medium    | Hard      |
| ---------- | --------- | --------- | --------- |
| Dark       | `#333C43` | `#2D353B` | `#272E33` |
| Light      | `#F3EAD3` | `#FDF6E3` | `#FFFBEF` |

## Coverage

- Workbench, editor, tabs, sidebars, panels, menus, notifications, command center, and status bar.
- TextMate scopes and semantic tokens for common programming and markup languages.
- Terminal ANSI colors, Git decorations, diffs, diagnostics, testing, notebooks, and minimap.
- Chat, inline chat, interactive editors, and multi-file diffs.

## Development

```sh
npm ci
npm run verify:static
npm run test:integration
npm run package:vsix
npm run package:verify
```

Generated files under `themes/` are committed so VS Code can load the extension directly. Edit the
TypeScript sources, then run `npm run generate`.

See [Architecture](docs/ARCHITECTURE.md) for the design and primary VS Code references.

## Release model

Conventional Commit squash titles drive semantic releases:

- `fix:` publishes a patch.
- `feat:` publishes a minor.
- `feat!:` or a `BREAKING CHANGE` publishes a major.
- Documentation and chore-only changes do not publish.

Pull requests must use squash merge, with the final squash commit title kept in Conventional Commit
format.

After the required static and desktop integration checks pass, an eligible merge to `main` creates
the Git tag and GitHub Release and attaches the versioned VSIX with its SHA-256 checksum. Publishing
to the Marketplace then verifies and promotes that exact validated VSIX automatically through
Microsoft Entra ID. No Marketplace PAT is stored in this repository.

## Credits

Everforest Complete derives its palette and substantial theme mappings from
[Everforest](https://github.com/sainnhe/everforest) and
[Everforest for Visual Studio Code](https://github.com/sainnhe/everforest-vscode), created by
sainnhe and distributed under the MIT License.

See [NOTICE](NOTICE) and [LICENSE](LICENSE).
