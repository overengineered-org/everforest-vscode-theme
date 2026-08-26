/*---------------------------------------------------------------------------------------------
 *  Homepage:   https://github.com/sainnhe/everforest-vscode
 *  Copyright:  2020 Sainnhe Park <i@sainnhe.dev>
 *  License:    MIT
 *--------------------------------------------------------------------------------------------*/

import { Palette, ThemeAppearance, ThemeContrast } from "../interface";

type PaletteBackground = Pick<
  Palette,
  "bg0" | "bg1" | "bg" | "bg2" | "bg3" | "bg4" | "bg5" | "grey0" | "grey1" | "grey2" | "shadow"
>;
type PaletteForeground = Omit<Palette, keyof PaletteBackground>;

const paletteBackgrounds = {
  dark: {
    hard: {
      bg0: "#1b2024",
      bg1: "#21272b",
      bg: "#272e33",
      bg2: "#2e383c",
      bg3: "#374145",
      bg4: "#414b50",
      bg5: "#495156",
      grey0: "#7f897d",
      grey1: "#859289",
      grey2: "#9aa79d",
      shadow: "#00000070",
    },
    medium: {
      bg0: "#21272b",
      bg1: "#272e33",
      bg: "#2d353b",
      bg2: "#343f44",
      bg3: "#3d484d",
      bg4: "#475258",
      bg5: "#4f585e",
      grey0: "#7f897d",
      grey1: "#859289",
      grey2: "#9aa79d",
      shadow: "#00000070",
    },
    soft: {
      bg0: "#272e33",
      bg1: "#2d353b",
      bg: "#333c43",
      bg2: "#3a464c",
      bg3: "#434f55",
      bg4: "#4d5960",
      bg5: "#555f66",
      grey0: "#7f897d",
      grey1: "#859289",
      grey2: "#9aa79d",
      shadow: "#00000070",
    },
  },
  light: {
    hard: {
      bg0: "#f2efdf",
      bg1: "#f8f5e4",
      bg: "#fffbef",
      bg2: "#f8f5e4",
      bg3: "#f2efdf",
      bg4: "#edeada",
      bg5: "#e8e5d5",
      grey0: "#a4ad9e",
      grey1: "#939f91",
      grey2: "#879686",
      shadow: "#3c474d20",
    },
    medium: {
      bg0: "#efebd4",
      bg1: "#f4f0d9",
      bg: "#fdf6e3",
      bg2: "#f4f0d9",
      bg3: "#efebd4",
      bg4: "#e6e2cc",
      bg5: "#e0dcc7",
      grey0: "#a4ad9e",
      grey1: "#939f91",
      grey2: "#879686",
      shadow: "#3c474d20",
    },
    soft: {
      bg0: "#e5dfc5",
      bg1: "#eae4ca",
      bg: "#f3ead3",
      bg2: "#eae4ca",
      bg3: "#e5dfc5",
      bg4: "#ddd8be",
      bg5: "#d8d3ba",
      grey0: "#a4ad9e",
      grey1: "#939f91",
      grey2: "#879686",
      shadow: "#3c474d20",
    },
  },
} satisfies Record<ThemeAppearance, Record<ThemeContrast, PaletteBackground>>;

const paletteForegrounds = {
  dark: {
    fg: "#d3c6aa",
    red: "#e67e80",
    orange: "#e69875",
    yellow: "#dbbc7f",
    green: "#a7c080",
    aqua: "#83c092",
    blue: "#7fbbb3",
    purple: "#d699b6",
    dimRed: "#da6362",
    dimOrange: "#d77f48",
    dimYellow: "#bf983d",
    dimGreen: "#899c40",
    dimAqua: "#569d79",
    dimBlue: "#5a93a2",
    dimPurple: "#b87b9d",
    badge: "#a7c080",
  },
  light: {
    fg: "#5c6a72",
    red: "#f85552",
    orange: "#f57d26",
    yellow: "#dfa000",
    green: "#8da101",
    aqua: "#35a77c",
    blue: "#3a94c5",
    purple: "#df69ba",
    dimRed: "#f1706f",
    dimOrange: "#f39459",
    dimYellow: "#e4b649",
    dimGreen: "#a4bb4a",
    dimAqua: "#6ec398",
    dimBlue: "#6cb3c6",
    dimPurple: "#e092be",
    badge: "#93b259",
  },
} satisfies Record<ThemeAppearance, PaletteForeground>;

export function getPalette(appearance: ThemeAppearance, contrast: ThemeContrast): Palette {
  return {
    ...paletteBackgrounds[appearance][contrast],
    ...paletteForegrounds[appearance],
  };
}

// vim: fdm=marker fmr={{{,}}}:
