/*---------------------------------------------------------------------------------------------
 *  Homepage:   https://github.com/sainnhe/everforest-vscode
 *  Copyright:  2020 Sainnhe Park <i@sainnhe.dev>
 *  License:    MIT
 *--------------------------------------------------------------------------------------------*/

import { Palette, ThemeAppearance, ThemeContrast } from "../interface";
import { default as darkForeground } from "./dark/foreground";
import { default as darkBackgroundHard } from "./dark/background/hard";
import { default as darkBackgroundMedium } from "./dark/background/medium";
import { default as darkBackgroundSoft } from "./dark/background/soft";
import { default as lightForeground } from "./light/foreground";
import { default as lightBackgroundHard } from "./light/background/hard";
import { default as lightBackgroundMedium } from "./light/background/medium";
import { default as lightBackgroundSoft } from "./light/background/soft";

export function getPalette(appearance: ThemeAppearance, contrast: ThemeContrast): Palette {
  const paletteBackgrounds =
    appearance === "dark"
      ? {
          hard: darkBackgroundHard,
          medium: darkBackgroundMedium,
          soft: darkBackgroundSoft,
        }
      : {
          hard: lightBackgroundHard,
          medium: lightBackgroundMedium,
          soft: lightBackgroundSoft,
        };
  const paletteBackground = paletteBackgrounds[contrast];
  const paletteForeground = appearance === "dark" ? darkForeground : lightForeground;
  return {
    // {{{
    bg0: paletteBackground.bg0,
    bg1: paletteBackground.bg1,
    bg: paletteBackground.bg,
    bg2: paletteBackground.bg2,
    bg3: paletteBackground.bg3,
    bg4: paletteBackground.bg4,
    bg5: paletteBackground.bg5,
    grey0: paletteBackground.grey0,
    grey1: paletteBackground.grey1,
    grey2: paletteBackground.grey2,
    shadow: paletteBackground.shadow,
    fg: paletteForeground.fg,
    red: paletteForeground.red,
    orange: paletteForeground.orange,
    yellow: paletteForeground.yellow,
    green: paletteForeground.green,
    aqua: paletteForeground.aqua,
    blue: paletteForeground.blue,
    purple: paletteForeground.purple,
    dimRed: paletteForeground.dimRed,
    dimOrange: paletteForeground.dimOrange,
    dimYellow: paletteForeground.dimYellow,
    dimGreen: paletteForeground.dimGreen,
    dimAqua: paletteForeground.dimAqua,
    dimBlue: paletteForeground.dimBlue,
    dimPurple: paletteForeground.dimPurple,
    badge: paletteForeground.badge,
  }; // }}}
}

// vim: fdm=marker fmr={{{,}}}:
