# Architecture

Everforest Complete follows VS Code's declarative color-theme model. The installed extension
contains six JSON themes and one icon. It has no JavaScript, native binary, activation event,
telemetry, or network access.

## Decisions

1. TypeScript is build tooling only. It generates six deterministic files from one canonical palette
   and mapping path. `src/workbench/documented-workbench-colors.json` snapshots every workbench
   color in the official VS Code theme-color reference at its recorded source commit. Existing
   handcrafted mappings override the documented-color fallback. Refresh the snapshot with
   `node scripts/update-documented-workbench-colors.mjs <theme-color.md> <source-commit>`, then
   regenerate the themes. Rust would add a toolchain without improving extension startup because no
   code runs after installation.
2. After the documented settings are added, VS Code's native `window.autoDetectColorScheme` setting
   selects the Medium Light/Dark themes. No background watcher is needed. In a connected SSH, Dev
   Container, WSL, or Codespaces window, the theme is installed in the local VS Code Desktop client
   because it has no remote runtime.
3. `@vscode/vsce` creates the exact VSIX and identifies the declarative package as web-compatible.
   `@vscode/test-electron` installs it into a clean desktop profile without relying on a
   user-configured `code` command, then validates native auto mode and every contributed theme.
4. Unit coverage measures the executable palette, semantic, syntax, workbench, documented-color, and
   contrast logic, with 95% minimum line, branch, and function thresholds. Generated JSON and CLI
   orchestration are verified through deterministic regeneration, package inspection, and the real
   Extension Host instead of inflating line coverage with tautological tests.
5. CI packages one validated VSIX in the static job, uploads it as a short-lived workflow artifact,
   and every desktop integration matrix job downloads those exact bytes. Conventional Commits drive
   release-it after the required static and desktop integration checks pass. GitHub Releases receive
   the versioned VSIX and its SHA-256 checksum using only GitHub's temporary workflow token. The
   Marketplace job then verifies and publishes that exact release asset with the protected
   `VSCE_PAT` secret; no Marketplace PAT is stored in the repository.

## Primary references

- [Color theme extension guide](https://code.visualstudio.com/api/extension-guides/color-theme)
- [Theme contribution point](https://code.visualstudio.com/api/references/contribution-points#contributes.themes)
- [Extension testing](https://code.visualstudio.com/api/working-with-extensions/testing-extension)
- [Web extensions](https://code.visualstudio.com/api/extension-guides/web-extensions)
- [Virtual workspaces](https://code.visualstudio.com/api/extension-guides/virtual-workspaces)
- [VSIX installation](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace#_install-from-a-vsix)
- [Remote extension installation](https://code.visualstudio.com/api/advanced-topics/remote-extensions)
- [release-it CI usage](https://github.com/release-it/release-it/blob/main/docs/ci.md)
