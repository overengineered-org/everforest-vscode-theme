import { Palette, ThemeAppearance } from "../interface";

export interface SyntaxRoleColors {
  annotation: string;
  attribute: string;
  callable: string;
  comment: string;
  constant: string;
  declaration: string;
  escape: string;
  keyword: string;
  namespace: string;
  operator: string;
  parameter: string;
  property: string;
  punctuation: string;
  string: string;
  type: string;
  variable: string;
}

/**
 * Language-independent meaning for every syntax accent. TextMate and semantic
 * tokens consume the same roles so highlighting does not change when a
 * language server starts or stops.
 */
export function getSyntaxRoleColors(
  appearance: ThemeAppearance,
  palette: Palette
): SyntaxRoleColors {
  return {
    annotation: palette.purple,
    attribute: palette.purple,
    callable: palette.green,
    comment: palette.grey1,
    constant: palette.aqua,
    declaration: palette.orange,
    escape: palette.aqua,
    keyword: palette.red,
    namespace: palette.yellow,
    operator: appearance === "light" ? palette.fg : palette.orange,
    parameter: palette.fg,
    property: palette.blue,
    punctuation: palette.grey1,
    string: palette.green,
    type: palette.yellow,
    variable: palette.fg,
  };
}
