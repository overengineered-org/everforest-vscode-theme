---
name: Everforest Complete
description: A calm, complete, configurable Everforest system for VS Code.
colors:
  dark-canvas: "#2d353b"
  dark-panel: "#272e33"
  dark-text: "#d3c6aa"
  dark-border: "#475258"
  light-canvas: "#fdf6e3"
  light-panel: "#f4f0d9"
  light-text: "#59646c"
  light-border: "#e6e2cc"
  dark-red: "#e67e80"
  dark-orange: "#e69875"
  dark-yellow: "#dbbc7f"
  dark-green: "#a7c080"
  dark-aqua: "#83c092"
  dark-blue: "#7fbbb3"
  dark-purple: "#d699b6"
  light-red: "#f85552"
  light-orange: "#f57d26"
  light-yellow: "#dfa000"
  light-green: "#8da101"
  light-aqua: "#35a77c"
  light-blue: "#3a94c5"
  light-purple: "#df69ba"
components:
  configurable-dark:
    backgroundColor: "{colors.dark-canvas}"
    textColor: "{colors.dark-text}"
  configurable-light:
    backgroundColor: "{colors.light-canvas}"
    textColor: "{colors.light-text}"
---

# Design System: Everforest Complete

## Overview

**Creative North Star: "The Quiet Forest Workbench"**

Everforest Complete should disappear behind the work. Forest-tinted surfaces reduce glare while
semantic accents make state changes immediately legible. Light and Dark are equal products, not a
primary theme plus an afterthought.

The system rejects generic recolors, decorative visual gimmicks, and incomplete state coverage.
Premium quality comes from completeness, restraint, and exact interaction-state treatment.

**Key Characteristics:**

- Restrained forest neutrals with semantic accent color.
- Tonal depth before shadow.
- Complete default, hover, focus, active, disabled, error, warning, and success states.
- Eight shipped theme contributions: six fixed Soft, Medium, and Hard presets plus two configurable
  Light and Dark themes.

## Colors

The palette uses muted forest neutrals for sustained focus and keeps saturated color functional.

### Semantic roles

- **Canopy Green:** primary actions, links, progress, active indicators, and success/added/passed
  states.
- **Moss Blue:** informational, modified, and remote states; references, variables, and SCM
  structure.
- **Rainwashed Aqua:** secondary Git, debugger, testing, and extension accents.
- **Ember Red:** errors, failed, deleted/removed, invalid, and destructive states.
- **Amber Yellow:** warnings, conflicts, untracked and attention states, plus numeric emphasis.
- **Wildflower Purple:** enums, special values, and distinct tertiary states.

### Neutral

- **Forest Canvas:** the default editor surface; panels move one tonal step away.
- **Dark Text:** warm, low-glare foreground on Dark surfaces.
- **Light Text:** `#59646c`, the readable cool forest-grey foreground on Light surfaces.
- **Structural Borders:** visible only where hierarchy, focus, or accessibility requires them.

### Named Rules

**The Functional Color Rule.** Accent color communicates meaning; it never decorates empty space.

**The Two-Surface Rule.** Editor and supporting panels must remain distinguishable without harsh
contrast.

## Typography

Everforest Complete never replaces the user's VS Code UI or editor font. It styles syntax weight and
italics only through explicit settings.

**Character:** familiar, compact, and quiet. Code remains the dominant information layer.

### Hierarchy

- **UI labels:** inherit VS Code sizing, weight, and density.
- **Editor text:** inherit the user's editor font and ligature choices.
- **Keywords:** regular by default; optional italics.
- **Comments:** italic by default; user-controlled.

### Named Rules

**The User Font Rule.** Never bundle, download, or force a font.

## Elevation

Material mode uses subtle tonal layering and the existing Everforest shadow token. Flat mode removes
surface separation. High Contrast strengthens borders. Shadows never replace focus or hierarchy.

### Shadow Vocabulary

- **Dark ambient shadow:** translucent black reserved for genuinely floating VS Code surfaces.
- **Light ambient shadow:** translucent forest-grey reserved for genuinely floating VS Code
  surfaces.

### Named Rules

**The Tonal-First Rule.** Change surface tone before adding shadow.

## Components

Everforest Complete styles native VS Code components. It does not invent custom controls.

### Editor and Workbench

- Editor, sidebar, panel, terminal, title bar, and status bar use a deliberate surface hierarchy.
- Material, Flat, and High Contrast are compiler modes, never separate mapping implementations.

### Selection and Focus

- Active, inactive, and occurrence selections use descending opacity.
- Focus borders remain visible in both Light and Dark modes.
- Cursor and selection accents are independently configurable.

### Inputs and Actions

- Native VS Code shapes, spacing, and typography remain intact.
- Primary, hover, active, disabled, error, warning, and success colors stay distinct.

### Setup and Configuration

- First install uses one three-step native walkthrough.
- Primary configuration asks Appearance, Contrast, then Workbench.
- The 14 settings are application-scoped and grouped as Appearance, Editor, Accessibility, and
  Automation.
- Advanced changes remain staged until Apply; Escape changes nothing.
- Automatic Light/Dark coordinates system and schedule modes through global extension settings and
  native `window.autoDetectColorScheme`/`workbench` theme settings without requiring users to edit
  JSON. A workspace or folder override blocks the global write until removed.
- Guided configuration applies three choices; Advanced Controls apply staged changes. Each flow runs
  one configurable-theme regeneration check and offers at most one reload when those files change.
- Automatic Light/Dark is configured separately; its command changes switching mode and schedule
  without regenerating theme files.

**The Three-Step Rule.** Keep primary setup to three consequential choices. Move optional detail to
Advanced Controls.

### Diagnostics and Extensions

- Diagnostic foregrounds remain readable at every supported background opacity.
- Git and pull-request extensions use the same semantic vocabulary as VS Code where those extensions
  contribute supported color keys.

## Do's and Don'ts

### Do:

- **Do** compile every theme through `src/theme.ts`.
- **Do** verify text at 4.5:1 and meaningful non-text states at 3:1 where applicable.
- **Do** preserve all eight shipped theme labels and paths during upgrades.
- **Do** keep premium controls application-scoped, local, and reversible.
- **Do** explain user actions as numbered steps with an observable completion state.
- **Do** use native Quick Picks, Input Boxes, Settings, and Walkthroughs.

### Don't:

- **Don't** add paid feature gates, trials, upgrade prompts, or artificial limits.
- **Don't** ship generic recolors that ignore workbench, extension, terminal, or interaction states.
- **Don't** add decorative visual gimmicks that compete with code.
- **Don't** duplicate theme logic or add speculative settings.
- **Don't** hide the first action or require users to remember earlier documentation steps.
- **Don't** require `settings.json` for a supported product control.
