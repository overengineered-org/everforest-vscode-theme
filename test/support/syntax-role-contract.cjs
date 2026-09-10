const canonicalTextMateScopeBySyntaxRole = Object.freeze({
  annotation: "storage.type.annotation",
  attribute: "entity.other.attribute-name",
  callable: "entity.name.function",
  comment: "comment",
  constant: "constant.language",
  declaration: "storage",
  escape: "constant.character.escape",
  keyword: "keyword",
  namespace: "support.module",
  operator: "keyword.operator",
  parameter: "variable.parameter",
  property: "variable.other.property",
  punctuation: "punctuation",
  string: "string",
  type: "entity.name.type",
  variable: "variable",
});

const semanticTokenIdentifierBySyntaxRole = Object.freeze({
  annotation: "decorator",
  callable: "function",
  comment: "comment",
  constant: "number",
  declaration: "modifier",
  escape: "label",
  keyword: "keyword",
  namespace: "namespace",
  operator: "operator",
  parameter: "parameter",
  property: "property",
  string: "string",
  type: "type",
  variable: "variable",
});

const highUseLanguageSyntaxRoleByScope = Object.freeze({
  terraform: Object.freeze({
    "entity.name.type.terraform": "type",
    "variable.declaration.hcl": "declaration",
    "support.function.provider.terraform": "callable",
    "meta.mapping.key.hcl variable.other.readwrite.hcl": "property",
    "variable.other.readwrite.terraform": "variable",
    "constant.language.hcl": "constant",
    "string.quoted.double.hcl": "string",
    "comment.line.number-sign.hcl": "comment",
    "keyword.control.conditional.hcl": "keyword",
    "keyword.operator.assignment.hcl": "operator",
    "punctuation.section.block.begin.hcl": "punctuation",
    "constant.character.escape.hcl": "escape",
  }),
  javascript: Object.freeze({
    "storage.type.js": "declaration",
    "entity.name.function.js": "callable",
    "entity.name.type.class.js": "type",
    "variable.other.object.property.js": "property",
    "variable.other.constant.js": "constant",
    "variable.other.object.js": "variable",
    "string.quoted.double.js": "string",
    "comment.line.double-slash.js": "comment",
    "keyword.control.js": "keyword",
    "keyword.operator.assignment.js": "operator",
    "punctuation.separator.key-value.js": "punctuation",
    "constant.character.escape.js": "escape",
  }),
  typescript: Object.freeze({
    "storage.type.ts": "declaration",
    "entity.name.function.ts": "callable",
    "entity.name.type.class.ts": "type",
    "entity.name.type.module.ts": "namespace",
    "variable.other.object.property.ts": "property",
    "variable.other.constant.ts": "constant",
    "variable.other.readwrite.ts": "variable",
    "string.quoted.double.ts": "string",
    "comment.line.double-slash.ts": "comment",
    "keyword.control.ts": "keyword",
    "keyword.operator.assignment.ts": "operator",
    "punctuation.separator.key-value.ts": "punctuation",
    "constant.character.escape.ts": "escape",
  }),
  go: Object.freeze({
    "keyword.type.go": "declaration",
    "entity.name.function.go": "callable",
    "entity.name.type.go": "type",
    "entity.name.package.go": "namespace",
    "variable.other.property.go": "property",
    "variable.other.constant.go": "constant",
    "variable.other.go": "variable",
    "string.quoted.double.go": "string",
    "comment.line.double-slash.go": "comment",
    "keyword.control.go": "keyword",
    "keyword.operator.assignment.go": "operator",
    "punctuation.separator.constant.numeric.go": "punctuation",
    "constant.character.escape.go": "escape",
  }),
  python: Object.freeze({
    "storage.type.function.python": "declaration",
    "entity.name.function.python": "callable",
    "entity.name.type.class.python": "type",
    "constant.language.python": "constant",
    "string.quoted.single.python": "string",
    "comment.line.number-sign.python": "comment",
    "keyword.control.flow.python": "keyword",
    "keyword.operator.assignment.python": "operator",
    "punctuation.separator.arguments.python": "punctuation",
    "constant.character.escape.python": "escape",
  }),
  java: Object.freeze({
    "storage.type.java": "declaration",
    "entity.name.function.java": "callable",
    "entity.name.type.class.java": "type",
    "entity.name.type.module.java": "namespace",
    "variable.other.object.property.java": "property",
    "variable.other.object.java": "variable",
    "constant.language.java": "constant",
    "string.quoted.double.java": "string",
    "comment.line.double-slash.java": "comment",
    "keyword.control.java": "keyword",
    "keyword.operator.assignment.java": "operator",
    "punctuation.separator.java": "punctuation",
    "constant.character.escape.java": "escape",
  }),
  scala: Object.freeze({
    "keyword.declaration.stable.scala": "declaration",
    "entity.name.function.scala": "callable",
    "entity.name.class.scala": "type",
    "entity.name.package.scala": "namespace",
    "constant.language.scala": "constant",
    "string.quoted.double.scala": "string",
    "comment.line.double-slash.scala": "comment",
    "keyword.control.scala": "keyword",
    "keyword.operator.scala": "operator",
    "punctuation.separator.scala": "punctuation",
    "constant.character.escape.scala": "escape",
  }),
  shell: Object.freeze({
    "storage.type.function.shell": "declaration",
    "entity.name.function.shell": "callable",
    "support.function.builtin.shell": "callable",
    "variable.other.assignment.shell": "declaration",
    "variable.other.normal.shell": "variable",
    "constant.numeric.integer.shell": "constant",
    "string.quoted.double.shell": "string",
    "comment.line.number-sign.shell": "comment",
    "keyword.control.shell": "keyword",
    "keyword.operator.assignment.shell": "operator",
    "punctuation.separator.statement.and.shell": "punctuation",
    "constant.character.escape.shell": "escape",
  }),
  yaml: Object.freeze({
    "meta.map.key.yaml string.unquoted.plain.yaml entity.name.tag.yaml": "property",
    "constant.language.boolean.yaml": "constant",
    "string.quoted.double.yaml": "string",
    "comment.line.number-sign.yaml": "comment",
    "keyword.control.flow.anchor.yaml": "keyword",
    "punctuation.separator.mapping.yaml": "punctuation",
    "constant.character.escape.yaml": "escape",
  }),
  sql: Object.freeze({
    "entity.name.function.sql": "callable",
    "support.function.aggregate.sql": "callable",
    "storage.type.sql": "type",
    "constant.numeric.sql": "constant",
    "string.quoted.single.sql": "string",
    "comment.line.double-dash.sql": "comment",
    "keyword.other.DML.sql": "keyword",
    "keyword.operator.comparison.sql": "operator",
    "constant.character.escape.sql": "escape",
  }),
  jinjaSql: Object.freeze({
    "variable.other.jinja.block": "declaration",
    "variable.other.jinja.filter": "callable",
    "variable.other.jinja.attribute": "property",
    "variable.other.jinja": "variable",
    "constant.language.jinja": "constant",
    "string.quoted.double.jinja": "string",
    "comment.block.jinja": "comment",
    "keyword.control.jinja": "keyword",
    "keyword.operator.assignment.jinja": "operator",
    "punctuation.other.jinja": "punctuation",
    "constant.character.escape.hex.jinja": "escape",
  }),
  json: Object.freeze({
    "support.type.property-name.json": "property",
    "constant.language.json": "constant",
    "string.quoted.double.json": "string",
    "comment.line.double-slash.js": "comment",
    "punctuation.separator.dictionary.key-value.json": "punctuation",
    "constant.character.escape.json": "escape",
  }),
});

const representativeLanguageSyntaxRoleByScope = Object.freeze({
  "variable.other.member.c": "property",
  "variable.other.member.cpp": "property",
  "entity.name.type.purescript": "type",
  "entity.name.function.dart": "callable",
  "variable.other.object.property.cs": "property",
  "variable.other.property.java": "property",
  "entity.name.package.kotlin": "namespace",
  "entity.name.class.scala": "type",
  "entity.name.function.macro.rust": "annotation",
  "support.function.any-method.swift": "callable",
  "support.other.namespace.php": "namespace",
  "entity.name.class.lua": "type",
  "variable.other.constant.ruby": "constant",
  "entity.name.function.haskell": "callable",
  "constant.language.julia": "constant",
  "entity.namespace.r": "namespace",
  "entity.name.type.class.module.erlang": "namespace",
  "variable.other.readwrite.module.elixir": "namespace",
  "entity.name.function.lisp": "callable",
  "entity.name.function.clojure": "callable",
  "entity.name.function.powershell": "callable",
  "variable.other.member.powershell": "property",
  "entity.name.function.package-manager.dockerfile": "callable",
  "entity.name.type.base-image.dockerfile": "type",
  "support.type.graphql": "type",
  "variable.parameter.graphql": "parameter",
  "constant.character.enum.graphql": "constant",
  "constant.other.boolean.toml": "constant",
});

const requiredSyntaxRoleByScope = Object.freeze({
  ...representativeLanguageSyntaxRoleByScope,
  ...Object.fromEntries(Object.values(highUseLanguageSyntaxRoleByScope).flatMap(Object.entries)),
});

const forbiddenTextMateContainerScopes = Object.freeze([
  "meta.body.function.definition.cpp",
  "meta.definition.method",
  "meta.definition.method.groovy",
  "meta.definition.method.signature.java",
  "meta.definition.variable",
  "meta.function",
  "meta.function-call",
  "meta.function-call.arguments.python",
  "meta.function-call.c",
  "meta.function-call.cpp",
  "meta.function-call.swift",
  "meta.function.method.with-arguments.ruby",
  "meta.function.stylus",
  "meta.method.body.java",
  "meta.method.groovy",
  "meta.property-value.css",
  "meta.property-value.scss",
  "meta.scope.group.shell",
  "meta.scope.if-block.shell",
  "meta.selector.css",
  "meta.tag.block.any.html",
  "meta.tag.inline.any.html",
  "meta.tag.other.html",
  "meta.tag.xml",
  "meta.type-signature.purescript",
]);

function normalizedSyntaxScopes(syntaxTokenColor) {
  return (
    Array.isArray(syntaxTokenColor.scope)
      ? syntaxTokenColor.scope
      : String(syntaxTokenColor.scope ?? "").split(",")
  )
    .map((syntaxScope) => syntaxScope.trim())
    .filter(Boolean);
}

function resolveSyntaxForeground(syntaxTokenColors, targetSyntaxScope) {
  let strongestMatchingSyntaxRule;

  syntaxTokenColors.forEach((syntaxTokenColor, syntaxRuleIndex) => {
    if (!syntaxTokenColor.settings?.foreground) return;

    for (const syntaxScopeSelector of normalizedSyntaxScopes(syntaxTokenColor)) {
      const selectorMatchesTarget = syntaxScopeSelector.includes(" ")
        ? syntaxScopeSelector === targetSyntaxScope
        : targetSyntaxScope === syntaxScopeSelector ||
          targetSyntaxScope.startsWith(`${syntaxScopeSelector}.`);
      if (!selectorMatchesTarget) continue;

      const selectorSpecificity =
        syntaxScopeSelector.split(".").length * 1000 + syntaxScopeSelector.length;
      if (
        !strongestMatchingSyntaxRule ||
        selectorSpecificity > strongestMatchingSyntaxRule.selectorSpecificity ||
        (selectorSpecificity === strongestMatchingSyntaxRule.selectorSpecificity &&
          syntaxRuleIndex > strongestMatchingSyntaxRule.syntaxRuleIndex)
      ) {
        strongestMatchingSyntaxRule = {
          foreground: syntaxTokenColor.settings.foreground,
          selectorSpecificity,
          syntaxRuleIndex,
        };
      }
    }
  });

  return strongestMatchingSyntaxRule?.foreground;
}

module.exports = {
  canonicalTextMateScopeBySyntaxRole,
  forbiddenTextMateContainerScopes,
  normalizedSyntaxScopes,
  highUseLanguageSyntaxRoleByScope,
  representativeLanguageSyntaxRoleByScope,
  requiredSyntaxRoleByScope,
  resolveSyntaxForeground,
  semanticTokenIdentifierBySyntaxRole,
};
