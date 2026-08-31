# Everforest Complete

## Product contract

| Field             | Contract                                                                                                                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product           | Everforest Complete                                                                                                                                                                                 |
| Artifact          | Desktop-first Visual Studio Code color-theme extension                                                                                                                                              |
| Themes            | Eight (8): six fixed Soft/Medium/Hard presets and two configurable Light/Dark themes                                                                                                                |
| Controls          | Fourteen application-scoped settings, exposed through native commands and Settings                                                                                                                  |
| Desktop           | Guided setup and Advanced Controls regenerate themes (the two configurable files); Automatic Light/Dark controls local scheduling and coordinates global native `window`/`workbench` theme settings |
| Web               | Eight committed themes; no file regeneration, scheduling, or native setting coordination                                                                                                            |
| Privacy           | No telemetry or network requests; no workspace/repository files or source code read; workspace/folder configuration values may be inspected only to guard global-only writes                        |
| Release authority | GitHub Releases for versioned VSIX files, checksums, and release notes                                                                                                                              |

## Users

Developers who spend sustained time in VS Code and want Everforest across the editor, terminal,
workbench, extensions, and modern AI surfaces. The primary user wants premium control without a
paywall or private overrides.

## Product purpose

Everforest Complete provides a complete, configurable, private Everforest experience. Success means
a developer can install once, finish a three-step native setup, choose one of six fixed presets or
configure either of the two Light/Dark themes, and trust upgrades not to reset a theme or expose
repository data.

## Positioning

The premium-grade Everforest theme with complete workbench coverage, advanced controls, no paywall,
and no data collection.

## Brand personality

Calm, exact, generous. The product feels refined and dependable during long coding sessions. Its
voice is direct, factual, and action-first.

## Design principles

1. **Calm under load.** Dense interfaces stay legible without becoming loud.
2. **Complete means complete.** Editor, workbench, extensions, states, and accessibility ship
   together.
3. **Premium without extraction.** Advanced controls remain free, local, and private.
4. **Safe upgrades.** Preserve fixed theme selections and make configuration reversible.
5. **Action before explanation.** Documentation starts with the exact command or click path.
6. **Three choices to confidence.** Primary setup asks Appearance, Contrast, then Workbench;
   optional detail stays in Advanced Controls.

## Anti-references

- Paid feature gates, trials, upgrade prompts, or artificial limits.
- Generic recolors that ignore workbench, extension, terminal, or interaction states.
- Decorative visual gimmicks that compete with code.
- Duplicated theme logic, speculative settings, or runtime access to workspace file contents or
  source code. Workspace/folder configuration inspection is limited to guarding global-only writes,
  including coordinated native `window`/`workbench` settings.
- Documentation that hides the first action or requires users to remember earlier steps.

## Accessibility and inclusion

Target WCAG AA contrast for readable text and critical states. Never rely on color alone when VS
Code provides another state cue. Support stronger borders, diagnostic opacity, distinct selection
states, and user-controlled typography. Native controls stage changes until completion; Escape
discards them, and one finished flow offers at most one reload prompt. Documentation uses short
numbered flows, visible completion states, and concrete time estimates.
