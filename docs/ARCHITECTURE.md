# Architecture

Start at `src/theme.ts`. It is the single theme compiler.

```mermaid
flowchart LR
  Settings[VS Code settings] --> Desktop[src/extension.ts]
  Desktop --> Compiler[src/theme.ts]
  Compiler --> Themes[Six presets and two configurable themes]
  Schedule[Local schedule] --> Desktop
  Desktop --> Workbench[workbench.colorTheme]
```

## One path per capability

| Capability          | Owner                    | Output                            |
| ------------------- | ------------------------ | --------------------------------- |
| Palette             | `src/palette/index.ts`   | Everforest colors                 |
| Theme compilation   | `src/theme.ts`           | Complete preset/configurable data |
| Desktop preferences | `src/extension.ts`       | Regenerated installed JSON        |
| Scheduled switching | `src/schedule.ts`        | Active theme and next boundary    |
| Build generation    | `src/generate-themes.ts` | Eight committed theme files       |

## Decisions

1. Keep the six named presets so existing `workbench.colorTheme` values never break. Add
   **Everforest Complete Dark** and **Everforest Complete Light** as configurable themes.
2. Compile build-time and runtime themes through `src/theme.ts`. A setting cannot drift from the
   shipped defaults.
3. Regenerate only the two configurable installed theme files. Presets stay fixed. Runtime code
   never reads workspaces, source files, telemetry, or the network.
4. Scope premium settings to the application. Workspace settings cannot race over shared installed
   theme files.
5. Schedule one timer for the next boundary. Do not poll every minute. Native operating-system
   switching remains the recommended alternative.
6. Browser-hosted VS Code receives all committed themes. File regeneration and scheduling require VS
   Code Desktop.

## Theme coverage

`src/workbench/documented-workbench-colors.json` pins every documented VS Code workbench color at a
recorded VS Code source commit. Handwritten mappings override deterministic fallbacks.

Refresh the contract:

```sh
node scripts/update-documented-workbench-colors.mjs <theme-color.md> <source-commit>
npm run generate
```

## Validation layers

1. Unit tests: palettes, all contrast combinations, premium settings, schedules, and accessibility.
2. Static validation: generated files, schemas, 937 workbench colors, and formatting.
3. Package validation: exact VSIX allowlist.
4. Extension Host: install exact VSIX, activate runtime, regenerate a theme, and switch Light/Dark.
5. CI: Linux, macOS, Windows, release asset, checksum, and Marketplace promotion through the
   protected `VSCE_PAT` secret.

## Primary references

- [Color theme extension guide](https://code.visualstudio.com/api/extension-guides/color-theme)
- [Theme contributions](https://code.visualstudio.com/api/references/contribution-points#contributes.themes)
- [Extension testing](https://code.visualstudio.com/api/working-with-extensions/testing-extension)
- [Web extensions](https://code.visualstudio.com/api/extension-guides/web-extensions)
- [Remote extensions](https://code.visualstudio.com/api/advanced-topics/remote-extensions)
