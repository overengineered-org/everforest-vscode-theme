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

## Variants

| Appearance | Soft      | Medium    | Hard      |
| ---------- | --------- | --------- | --------- |
| Dark       | `#333C43` | `#2D353B` | `#272E33` |
| Light      | `#F3EAD3` | `#FDF6E3` | `#FFFBEF` |

Medium is the balanced default. It follows the system appearance after the settings below are added.

## Installation

This extension is not published on the VS Code Marketplace. Install a VSIX by one of these paths.

### 1. Download a GitHub Release

1. Download the versioned `everforest-complete-X.Y.Z.vsix` asset and its `.sha256` checksum from the
   [latest GitHub Release](https://github.com/overengineered-org/everforest-vscode-theme/releases/latest).
2. In VS Code Desktop, open **Extensions**.
3. Select **Views and More Actions…** (`…`) → **Install from VSIX…**.
4. Select the downloaded `.vsix` file.
5. Run **Preferences: Color Theme** and choose an Everforest Complete variant.

### 2. Build locally

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

For SSH, Dev Containers, WSL, or Codespaces through VS Code Desktop, install the theme into the
**Local** VS Code client when prompted. A theme has no remote runtime. Browser-hosted VS Code,
including `vscode.dev` and browser Codespaces, cannot install the GitHub-hosted VSIX directly.

If the optional VS Code command is already available, the equivalent terminal command is:

```sh
code --install-extension everforest-complete-X.Y.Z.vsix
```

Use `code-insiders` for VS Code Insiders. If neither command exists, use the VS Code interface
above.

### Verify the download

Run the command from the folder containing both downloaded files. On macOS:

```sh
shasum -a 256 -c everforest-complete-X.Y.Z.vsix.sha256
```

On Linux:

```sh
sha256sum -c everforest-complete-X.Y.Z.vsix.sha256
```

On Windows, run `Get-FileHash everforest-complete-X.Y.Z.vsix -Algorithm SHA256` in PowerShell and
compare the result with the downloaded checksum file.

Because this extension is distributed through GitHub Releases, VS Code has no automatic update
source. Download each newer VSIX and repeat **Install from VSIX…**.

## Follow the system appearance

Add these settings once:

```json
{
  "window.autoDetectColorScheme": true,
  "workbench.preferredDarkColorTheme": "Everforest Complete Dark Medium",
  "workbench.preferredLightColorTheme": "Everforest Complete Light Medium"
}
```

VS Code then follows the operating system's Light/Dark setting using its native theme switcher.
Settings Sync can copy these preferences, but it does not install this VSIX on another machine or
remote window. Install the VSIX separately in every VS Code Desktop client where the theme is used.

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

After the required static, integration, and web checks pass, an eligible merge to `main` creates the
Git tag and GitHub Release and attaches the versioned VSIX with its SHA-256 checksum. GitHub's
temporary workflow token is the only release credential. No Marketplace, Azure, Entra, PAT
credential, or publishing step is configured.

## Credits

Everforest Complete derives its palette and substantial theme mappings from
[Everforest](https://github.com/sainnhe/everforest) and
[Everforest for Visual Studio Code](https://github.com/sainnhe/everforest-vscode), created by
sainnhe and distributed under the MIT License.

See [NOTICE](NOTICE) and [LICENSE](LICENSE).
