const expectedThemeContributions = [
  {
    label: "Everforest Complete Dark Soft",
    uiTheme: "vs-dark",
    path: "./themes/everforest-complete-dark-soft-color-theme.json",
  },
  {
    label: "Everforest Complete Dark Medium",
    uiTheme: "vs-dark",
    path: "./themes/everforest-complete-dark-medium-color-theme.json",
  },
  {
    label: "Everforest Complete Dark Hard",
    uiTheme: "vs-dark",
    path: "./themes/everforest-complete-dark-hard-color-theme.json",
  },
  {
    label: "Everforest Complete Light Soft",
    uiTheme: "vs",
    path: "./themes/everforest-complete-light-soft-color-theme.json",
  },
  {
    label: "Everforest Complete Light Medium",
    uiTheme: "vs",
    path: "./themes/everforest-complete-light-medium-color-theme.json",
  },
  {
    label: "Everforest Complete Light Hard",
    uiTheme: "vs",
    path: "./themes/everforest-complete-light-hard-color-theme.json",
  },
  {
    label: "Everforest Complete Dark",
    uiTheme: "vs-dark",
    path: "./themes/everforest-complete-dark-color-theme.json",
  },
  {
    label: "Everforest Complete Light",
    uiTheme: "vs",
    path: "./themes/everforest-complete-light-color-theme.json",
  },
];

const requiredSemanticTokenIdentifiers = [
  "class",
  "comment",
  "decorator",
  "enum",
  "enumMember",
  "event",
  "function",
  "interface",
  "keyword",
  "label",
  "macro",
  "member",
  "method",
  "modifier",
  "namespace",
  "number",
  "operator",
  "parameter",
  "property",
  "regexp",
  "string",
  "struct",
  "type",
  "typeParameter",
  "variable",
];

const requiredSyntaxScopes = [
  "comment",
  "constant.numeric",
  "entity.name.function",
  "entity.name.tag.html",
  "keyword",
  "markup.bold",
  "markup.fenced_code.block.markdown",
  "storage.type.rust",
  "string",
  "support.type.property-name.css",
  "variable",
];

module.exports = {
  expectedThemeContributions,
  requiredSemanticTokenIdentifiers,
  requiredSyntaxScopes,
};
