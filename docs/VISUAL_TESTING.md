# Visual testing

Use VS Code Desktop and open `fixtures/` in an Extension Development Host. Visual testing covers the
eight shipped themes and the Desktop-only walkthrough; browser-hosted VS Code is limited to
committed theme selection and its Desktop-requirement fallback.

## Check the product

1. Test all six fixed presets: Light and Dark at Soft, Medium, and Hard contrast.
2. Test configurable **Everforest Complete Light** and **Everforest Complete Dark** with Material,
   Flat, and High Contrast workbenches.
3. Use **Configure Advanced Controls** to change at least one cursor, selection, italics, diagnostic
   opacity, or stronger-border value; confirm the 14 application-scoped settings stay global.
4. Complete **Configure Theme**; change at least one Contrast or Workbench choice before confirming
   three numbered steps and one reload prompt.
5. Escape from each step; confirm no setting changes.
6. Change at least one more **Advanced Controls** value, stage multiple controls, and confirm one
   Apply and one reload prompt.
7. Test Off, System, and Schedule through **Configure Automatic Light/Dark**. Use the existing
   `media/walkthrough/automate-appearance.svg` as the schedule visual when a static reference helps.
8. Reset Getting Started progress; verify the three-step walkthrough and completion events.

For browser-hosted VS Code, open **Color Theme** and select a committed theme. Run each
configuration command once to verify the Desktop-requirement message and **Choose Fixed Theme**
action; do not expect regeneration, scheduling, or the walkthrough there.

Inspect these surfaces:

- Code hierarchy and every fixture language.
- Focus, hover, selection, inactive selection, and disabled states.
- Errors, warnings, Git changes, and diff editors.
- Terminal, notebooks, testing, notifications, command center, and chat.
- Git and pull-request extensions when installed.
- Appearance, Contrast, and Workbench Quick Picks at narrow and wide window sizes.

## Capture public screenshots

Use the same window size and an isolated VS Code profile.

1. Open only this Everforest repository.
2. Open a public file such as `src/generate-themes.ts`.
3. Hide terminals, home paths, usernames, private repositories, and notifications.
4. Capture the VS Code window only, not the desktop.
5. Capture Light, Dark, workbench, and native-configuration states from the installed VSIX.
6. Review every full-size image before README or Marketplace use.
