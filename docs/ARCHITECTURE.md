# Architecture

Everforest Complete follows VS Code's declarative color-theme model. The installed extension
contains six JSON themes and one icon. It has no JavaScript, native binary, activation event,
telemetry, or network access.

## Decisions

1. TypeScript is build tooling only. It generates six deterministic files from one canonical palette
   and mapping path. Rust would add a toolchain without improving extension startup because no code
   runs after installation.
2. After the documented settings are added, VS Code's native `window.autoDetectColorScheme` setting
   selects the Medium Light/Dark themes. No background watcher is needed. In a connected SSH, Dev
   Container, WSL, or Codespaces window, the theme is installed in the local VS Code Desktop client
   because it has no remote runtime.
3. `@vscode/vsce` creates the exact VSIX. `@vscode/test-electron` installs it into a clean profile
   without relying on a user-configured `code` command, then validates native auto mode and every
   contributed theme.
4. Conventional Commits drive semantic-release after the required static, integration, and web
   checks pass. GitHub Releases receive the versioned VSIX and its SHA-256 checksum using only
   GitHub's temporary workflow token. No Marketplace, Azure, Entra, PAT credential, or publishing
   step is configured.

## Primary references

- [Color theme extension guide](https://code.visualstudio.com/api/extension-guides/color-theme)
- [Theme contribution point](https://code.visualstudio.com/api/references/contribution-points#contributes.themes)
- [Extension testing](https://code.visualstudio.com/api/working-with-extensions/testing-extension)
- [VSIX installation](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace#_install-from-a-vsix)
- [Remote extension installation](https://code.visualstudio.com/api/advanced-topics/remote-extensions)
- [semantic-release usage](https://semantic-release.gitbook.io/semantic-release/usage/getting-started)
