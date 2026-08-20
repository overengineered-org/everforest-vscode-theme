/*---------------------------------------------------------------------------------------------
 *  Derived from Everforest for Visual Studio Code
 *  Copyright: 2020 Sainnhe Park <i@sainnhe.dev>
 *  License: MIT
 *--------------------------------------------------------------------------------------------*/

export type ThemeAppearance = "dark" | "light";
export type ThemeContrast = "soft" | "medium" | "hard";
export type ThemeAccent =
  "grey" | "red" | "orange" | "yellow" | "green" | "aqua" | "blue" | "purple";
export type ThemeCursor = "white" | "black" | Exclude<ThemeAccent, "grey">;
export type DiagnosticBackgroundOpacity = "0%" | "12.5%" | "25%" | "37.5%" | "50%";

export interface Configuration {
  darkContrast: ThemeContrast;
  lightContrast: ThemeContrast;
  darkSelection: ThemeAccent;
  lightSelection: ThemeAccent;
  darkCursor: ThemeCursor;
  lightCursor: ThemeCursor;
  italicComments: boolean;
  diagnosticTextBackgroundOpacity: DiagnosticBackgroundOpacity;
  highContrast: boolean;
}

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
