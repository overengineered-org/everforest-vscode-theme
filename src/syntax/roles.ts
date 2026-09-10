import { Palette } from "../interface";

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
export function getSyntaxRoleColors(palette: Palette): SyntaxRoleColors {
  return {
    annotation: palette.purple,
    attribute: palette.yellow,
    callable: palette.yellow,
    comment: palette.grey1,
    constant: palette.purple,
    declaration: palette.orange,
    escape: palette.aqua,
    keyword: palette.red,
    namespace: palette.blue,
    operator: palette.fg,
    parameter: palette.orange,
    property: palette.blue,
    punctuation: palette.grey1,
    string: palette.green,
    type: palette.aqua,
    variable: palette.fg,
  };
}
