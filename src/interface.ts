/*---------------------------------------------------------------------------------------------
 *  Derived from Everforest for Visual Studio Code
 *  Copyright: 2020 Sainnhe Park <i@sainnhe.dev>
 *  License: MIT
 *--------------------------------------------------------------------------------------------*/

export type ThemeAppearance = "dark" | "light";
export type ThemeContrast = "soft" | "medium" | "hard";

export interface Palette {
  bg0: string;
  bg1: string;
  bg: string;
  bg2: string;
  bg3: string;
  bg4: string;
  bg5: string;
  grey0: string;
  grey1: string;
  grey2: string;
  fg: string;
  red: string;
  orange: string;
  yellow: string;
  green: string;
  aqua: string;
  blue: string;
  purple: string;
  dimRed: string;
  dimOrange: string;
  dimYellow: string;
  dimGreen: string;
  dimAqua: string;
  dimBlue: string;
  dimPurple: string;
  shadow: string;
  badge: string;
}
