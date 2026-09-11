/*---------------------------------------------------------------------------------------------
 *  Homepage:   https://github.com/sainnhe/everforest-vscode
 *  Copyright:  2020 Sainnhe Park <i@sainnhe.dev>
 *  License:    MIT
 *--------------------------------------------------------------------------------------------*/

import { Palette, ThemeAppearance } from "../interface";
import { getSyntaxRoleColors } from "./roles";

interface SyntaxStylePreferences {
  italicKeywords: boolean;
  italicComments: boolean;
}

const defaultSyntaxStylePreferences: SyntaxStylePreferences = {
  italicKeywords: false,
  italicComments: true,
};

export function getDefaultSyntax(
  palette: Palette,
  appearance: ThemeAppearance,
  syntaxStylePreferences: SyntaxStylePreferences = defaultSyntaxStylePreferences
) {
  const syntaxRoleColors = getSyntaxRoleColors(appearance, palette);
  const syntax = [
    // Syntax{{{
    {
      name: "Keyword",
      scope: "keyword, keyword.operator.new, keyword.operator.expression, keyword.operator.delete",
      settings: {
        foreground: syntaxRoleColors.keyword,
      },
    },
    {
      name: "Debug",
      scope: "keyword.other.debugger",
      settings: {
        foreground: palette.red,
      },
    },
    {
      name: "Storage",
      scope: "storage, modifier, keyword.var",
      settings: {
        foreground: syntaxRoleColors.declaration,
      },
    },
    {
      name: "Operator",
      scope: "keyword.operator",
      settings: {
        foreground: syntaxRoleColors.operator,
      },
    },
    {
      name: "String",
      scope:
        "string, punctuation.definition.string.end, punctuation.definition.string.begin, punctuation.definition.string.template.begin, punctuation.definition.string.template.end",
      settings: {
        foreground: syntaxRoleColors.string,
      },
    },
    {
      name: "Attribute",
      scope: "entity.other.attribute-name",
      settings: {
        foreground: syntaxRoleColors.attribute,
      },
    },
    {
      name: "String Escape",
      scope:
        "constant.character.escape, punctuation.quasi.element, punctuation.definition.template-expression, punctuation.section.embedded, storage.type.format, constant.other.placeholder, variable.interpolation",
      settings: {
        foreground: syntaxRoleColors.escape,
      },
    },
    {
      name: "Function",
      scope:
        "entity.name.function, entity.name.function.member, entity.name.function.method, entity.name.method, support.function, variable.function",
      settings: {
        foreground: syntaxRoleColors.callable,
      },
    },
    {
      name: "Preproc",
      scope:
        "keyword.control.at-rule, keyword.control.import, keyword.control.export, storage.type.namespace, punctuation.decorator, keyword.control.directive, keyword.preprocessor, punctuation.definition.preprocessor, punctuation.definition.directive, keyword.other.import, keyword.other.package, entity.name.type.namespace, entity.name.scope-resolution, keyword.other.using, keyword.package, keyword.import, keyword.map",
      settings: {
        foreground: syntaxRoleColors.annotation,
      },
    },
    {
      name: "Annotation",
      scope:
        "storage.type.annotation, entity.name.function.decorator, entity.name.type.annotation, punctuation.definition.annotation",
      settings: {
        foreground: syntaxRoleColors.annotation,
      },
    },
    {
      name: "Label",
      scope: "entity.name.label, constant.other.label",
      settings: {
        foreground: palette.aqua,
      },
    },
    {
      name: "Namespace and module",
      scope:
        "support.module, support.node, support.other.module, support.other.namespace, support.type.object.module, entity.name.module, entity.name.namespace, entity.name.import, entity.name.type.module, entity.name.type.class.module, entity.name.type.namespace, entity.name.type.package, entity.name.tag.namespace",
      settings: {
        foreground: syntaxRoleColors.namespace,
      },
    },
    {
      name: "Type",
      scope:
        "support.type, entity.name.type, entity.name.tag.js.jsx, support.class.component.js.jsx, entity.name.tag.tsx, support.class.component.tsx",
      settings: {
        foreground: syntaxRoleColors.type,
      },
    },
    {
      name: "Class",
      scope:
        "entity.name.type.class, support.class, entity.name.class, entity.other.inherited-class",
      settings: {
        foreground: syntaxRoleColors.type,
      },
    },
    {
      name: "Number",
      scope: "constant.numeric",
      settings: {
        foreground: syntaxRoleColors.constant,
      },
    },
    {
      name: "Boolean",
      scope: "constant.language.boolean",
      settings: {
        foreground: syntaxRoleColors.constant,
      },
    },
    {
      name: "Macro",
      scope: "entity.name.function.preprocessor",
      settings: {
        foreground: syntaxRoleColors.annotation,
      },
    },
    {
      name: "Special identifier",
      scope:
        "variable.language.this, variable.language.self, variable.language.super, keyword.other.this, variable.language.special, constant.language.null, constant.language.undefined, constant.language.nan",
      settings: {
        foreground: syntaxRoleColors.constant,
      },
    },
    {
      name: "Constant",
      scope:
        "constant.language, constant.other, constant.character.entity, support.constant, entity.name.variable.enum-member, variable.other.enummember",
      settings: {
        foreground: syntaxRoleColors.constant,
      },
    },
    {
      name: "Identifier",
      scope: "variable, support.variable, entity.name.variable",
      settings: {
        foreground: syntaxRoleColors.variable,
      },
    },
    {
      name: "Parameter",
      scope:
        "variable.parameter, entity.name.variable.parameter, variable.other.readwrite.parameter, support.variable.parameter, meta.definition.variable.parameter",
      settings: {
        foreground: syntaxRoleColors.parameter,
      },
    },
    {
      name: "Property",
      scope:
        "variable.object.property, support.variable.property, variable.other.property, variable.other.object.property, variable.other.member, entity.name.variable.property, entity.name.variable.field, support.type.property-name, support.type.vendored.property-name, support.type.map.key, meta.object-literal.key",
      settings: {
        foreground: syntaxRoleColors.property,
      },
    },
    {
      name: "Delimiter",
      scope: "punctuation, meta.brace, meta.delimiter, meta.bracket",
      settings: {
        foreground: syntaxRoleColors.punctuation,
      },
    },
    // }}}
    // Markdown{{{
    {
      name: "Markdown heading1",
      scope: "heading.1.markdown, markup.heading.setext.1.markdown",
      settings: {
        foreground: palette.red,
        fontStyle: "bold",
      },
    },
    {
      name: "Markdown heading2",
      scope: "heading.2.markdown, markup.heading.setext.2.markdown",
      settings: {
        foreground: palette.orange,
        fontStyle: "bold",
      },
    },
    {
      name: "Markdown heading3",
      scope: "heading.3.markdown",
      settings: {
        foreground: palette.yellow,
        fontStyle: "bold",
      },
    },
    {
      name: "Markdown heading4",
      scope: "heading.4.markdown",
      settings: {
        foreground: palette.green,
        fontStyle: "bold",
      },
    },
    {
      name: "Markdown heading5",
      scope: "heading.5.markdown",
      settings: {
        foreground: palette.blue,
        fontStyle: "bold",
      },
    },
    {
      name: "Markdown heading6",
      scope: "heading.6.markdown",
      settings: {
        foreground: syntaxRoleColors.constant,
        fontStyle: "bold",
      },
    },
    {
      name: "Markdown heading delimiter",
      scope: "punctuation.definition.heading.markdown",
      settings: {
        foreground: palette.grey1,
        fontStyle: "",
      },
    },
    {
      name: "Markdown link",
      scope:
        "string.other.link.title.markdown, constant.other.reference.link.markdown, string.other.link.description.markdown",
      settings: {
        foreground: palette.purple,
        fontStyle: "",
      },
    },
    {
      name: "Markdown link text",
      scope: "markup.underline.link.image.markdown, markup.underline.link.markdown",
      settings: {
        foreground: palette.green,
        fontStyle: "underline",
      },
    },
    {
      name: "Markdown delimiter",
      scope:
        "punctuation.definition.string.begin.markdown, punctuation.definition.string.end.markdown, punctuation.definition.italic.markdown, punctuation.definition.quote.begin.markdown, punctuation.definition.metadata.markdown, punctuation.separator.key-value.markdown, punctuation.definition.constant.markdown",
      settings: {
        foreground: palette.grey1,
      },
    },
    {
      name: "Markdown bold delimiter",
      scope: "punctuation.definition.bold.markdown",
      settings: {
        foreground: palette.grey1,
        fontStyle: "",
      },
    },
    {
      name: "Markdown separator delimiter",
      scope:
        "meta.separator.markdown, punctuation.definition.constant.begin.markdown, punctuation.definition.constant.end.markdown",
      settings: {
        foreground: palette.grey1,
        fontStyle: "bold",
      },
    },
    {
      name: "Markdown italic",
      scope: "markup.italic",
      settings: {
        fontStyle: "italic",
      },
    },
    {
      name: "Markdown bold",
      scope: "markup.bold",
      settings: {
        fontStyle: "bold",
      },
    },
    {
      name: "Markdown bold italic",
      scope: "markup.bold markup.italic, markup.italic markup.bold",
      settings: {
        fontStyle: "italic bold",
      },
    },
    {
      name: "Markdown code delimiter",
      scope: "punctuation.definition.markdown, punctuation.definition.raw.markdown",
      settings: {
        foreground: palette.yellow,
      },
    },
    {
      name: "Markdown code type",
      scope: "fenced_code.block.language",
      settings: {
        foreground: palette.yellow,
      },
    },
    {
      name: "Markdown code block",
      scope: "markup.fenced_code.block.markdown, markup.inline.raw.string.markdown",
      settings: {
        foreground: palette.green,
      },
    },
    {
      name: "Markdown list mark",
      scope: "punctuation.definition.list.begin.markdown",
      settings: {
        foreground: palette.red,
      },
    },
    // }}}
    // reStructuredText{{{
    {
      name: "reStructuredText heading",
      scope: "punctuation.definition.heading.restructuredtext",
      settings: {
        foreground: palette.orange,
        fontStyle: "bold",
      },
    },
    {
      name: "reStructuredText delimiter",
      scope:
        "punctuation.definition.field.restructuredtext, punctuation.separator.key-value.restructuredtext, punctuation.definition.directive.restructuredtext, punctuation.definition.constant.restructuredtext, punctuation.definition.italic.restructuredtext, punctuation.definition.table.restructuredtext",
      settings: {
        foreground: palette.grey1,
      },
    },
    {
      name: "reStructuredText delimiter bold",
      scope: "punctuation.definition.bold.restructuredtext",
      settings: {
        foreground: palette.grey1,
        fontStyle: "",
      },
    },
    {
      name: "reStructuredText aqua",
      scope:
        "entity.name.tag.restructuredtext, punctuation.definition.link.restructuredtext, punctuation.definition.raw.restructuredtext, punctuation.section.raw.restructuredtext",
      settings: {
        foreground: palette.aqua,
      },
    },
    {
      name: "reStructuredText purple",
      scope: "constant.other.footnote.link.restructuredtext",
      settings: {
        foreground: palette.purple,
      },
    },
    {
      name: "reStructuredText red",
      scope: "support.directive.restructuredtext",
      settings: {
        foreground: palette.red,
      },
    },
    {
      name: "reStructuredText green",
      scope:
        "entity.name.directive.restructuredtext, markup.raw.restructuredtext, markup.raw.inner.restructuredtext, string.other.link.title.restructuredtext",
      settings: {
        foreground: palette.green,
      },
    },
    // }}}
    // LaTex{{{
    {
      name: "LaTex delimiter",
      scope:
        "punctuation.definition.function.latex, punctuation.definition.function.tex, punctuation.definition.keyword.latex, constant.character.newline.tex, punctuation.definition.keyword.tex",
      settings: {
        foreground: palette.grey1,
      },
    },
    {
      name: "LaTex red",
      scope: "support.function.be.latex",
      settings: {
        foreground: palette.red,
      },
    },
    {
      name: "LaTex orange",
      scope:
        "support.function.section.latex, keyword.control.table.cell.latex, keyword.control.table.newline.latex",
      settings: {
        foreground: palette.orange,
      },
    },
    {
      name: "LaTex yellow",
      scope:
        "support.class.latex, variable.parameter.latex, variable.parameter.function.latex, variable.parameter.definition.label.latex, constant.other.reference.label.latex",
      settings: {
        foreground: palette.yellow,
      },
    },
    {
      name: "LaTex purple",
      scope: "keyword.control.preamble.latex",
      settings: {
        foreground: palette.purple,
      },
    },
    // }}}
    // Html/Xml{{{
    {
      name: "Html grey",
      scope: "punctuation.separator.namespace.xml",
      settings: {
        foreground: palette.grey1,
      },
    },
    {
      name: "HTML tag",
      scope: "entity.name.tag.html, entity.name.tag.xml, entity.name.tag.localname.xml",
      settings: {
        foreground: syntaxRoleColors.declaration,
      },
    },
    {
      name: "HTML attribute",
      scope:
        "entity.other.attribute-name.html, entity.other.attribute-name.xml, entity.other.attribute-name.localname.xml",
      settings: {
        foreground: syntaxRoleColors.attribute,
      },
    },
    {
      name: "Html green",
      scope:
        "string.quoted.double.html, string.quoted.single.html, punctuation.definition.string.begin.html, punctuation.definition.string.end.html, punctuation.definition.string.begin.xml, punctuation.definition.string.end.xml, string.quoted.double.xml, string.quoted.single.xml",
      settings: {
        foreground: palette.green,
      },
    },
    {
      name: "Html punctuation",
      scope:
        "punctuation.separator.key-value.html, punctuation.definition.tag.begin.html, punctuation.definition.tag.end.html, punctuation.definition.tag.xml",
      settings: {
        foreground: palette.grey1,
      },
    },
    {
      name: "Html purple",
      scope: "variable.language.documentroot.xml, meta.tag.sgml.doctype.xml",
      settings: {
        foreground: palette.purple,
      },
    },
    // }}}
    // Proto{{{
    {
      name: "Proto yellow",
      scope: "storage.type.proto",
      settings: {
        foreground: palette.yellow,
      },
    },
    {
      name: "Proto green",
      scope:
        "string.quoted.double.proto.syntax, string.quoted.single.proto.syntax, string.quoted.double.proto, string.quoted.single.proto",
      settings: {
        foreground: palette.green,
      },
    },
    {
      name: "Proto aqua",
      scope: "entity.name.class.proto, entity.name.class.message.proto",
      settings: {
        foreground: palette.aqua,
      },
    },
    // }}}
    // CSS{{{
    {
      name: "CSS grey",
      scope:
        "punctuation.definition.entity.css, punctuation.separator.key-value.css, punctuation.terminator.rule.css, punctuation.separator.list.comma.css",
      settings: {
        foreground: palette.grey1,
      },
    },
    {
      name: "CSS red",
      scope: "entity.other.attribute-name.class.css",
      settings: {
        foreground: palette.red,
      },
    },
    {
      name: "CSS orange",
      scope: "keyword.other.unit",
      settings: {
        foreground: palette.orange,
      },
    },
    {
      name: "CSS yellow",
      scope:
        "entity.other.attribute-name.pseudo-class.css, entity.other.attribute-name.pseudo-element.css",
      settings: {
        foreground: palette.yellow,
      },
    },
    {
      name: "CSS green",
      scope:
        "string.quoted.single.css, string.quoted.double.css, support.constant.property-value.css, punctuation.definition.string.begin.css, punctuation.definition.string.end.css, support.constant.font-name.css",
      settings: {
        foreground: palette.green,
      },
    },
    {
      name: "CSS purple",
      scope:
        "entity.name.tag.css, entity.other.keyframe-offset.css, punctuation.definition.keyword.css, keyword.control.at-rule.keyframes.css",
      settings: {
        foreground: palette.purple,
      },
    },
    // }}}
    // SASS{{{
    {
      name: "SASS grey",
      scope:
        "punctuation.definition.entity.scss, punctuation.separator.key-value.scss, punctuation.terminator.rule.scss, punctuation.separator.list.comma.scss",
      settings: {
        foreground: palette.grey1,
      },
    },
    {
      name: "SASS orange",
      scope: "keyword.control.at-rule.keyframes.scss",
      settings: {
        foreground: palette.orange,
      },
    },
    {
      name: "SASS yellow",
      scope:
        "punctuation.definition.interpolation.begin.bracket.curly.scss, punctuation.definition.interpolation.end.bracket.curly.scss",
      settings: {
        foreground: palette.yellow,
      },
    },
    {
      name: "SASS green",
      scope:
        "punctuation.definition.string.begin.scss, punctuation.definition.string.end.scss, string.quoted.double.scss, string.quoted.single.scss, constant.character.css.sass",
      settings: {
        foreground: palette.green,
      },
    },
    {
      name: "SASS purple",
      scope:
        "keyword.control.at-rule.include.scss, keyword.control.at-rule.use.scss, keyword.control.at-rule.mixin.scss, keyword.control.at-rule.extend.scss, keyword.control.at-rule.import.scss",
      settings: {
        foreground: palette.purple,
      },
    },
    // }}}
    // Stylus{{{
    {
      name: "Stylus yellow",
      scope: "entity.name.function.stylus",
      settings: {
        foreground: palette.yellow,
      },
    },
    // }}}
    // JavaScript{{{
    {
      name: "JavaScript variable",
      scope: "string.unquoted.js",
      settings: {
        foreground: syntaxRoleColors.variable,
      },
    },
    {
      name: "JavaScript punctuation",
      scope:
        "punctuation.accessor.js, punctuation.separator.key-value.js, punctuation.separator.label.js, keyword.operator.accessor.js",
      settings: {
        foreground: syntaxRoleColors.punctuation,
      },
    },
    {
      name: "JavaScript red",
      scope: "punctuation.definition.block.tag.jsdoc",
      settings: {
        foreground: palette.red,
      },
    },
    {
      name: "JavaScript declaration",
      scope: "storage.type.js, storage.type.function.arrow.js",
      settings: {
        foreground: syntaxRoleColors.declaration,
      },
    },
    {
      name: "JavaScript constant",
      scope:
        "variable.other.constant.js, variable.other.constant.object.js, variable.other.constant.object.property.js, variable.other.constant.property.js",
      settings: {
        foreground: syntaxRoleColors.constant,
      },
    },
    // }}}
    // JSX{{{
    {
      name: "JSX white",
      scope: "JSXNested",
      settings: {
        foreground: palette.fg,
      },
    },
    // }}}
    // TypeScript{{{
    {
      name: "TypeScript grey",
      scope:
        "keyword.operator.type.annotation.ts, punctuation.accessor.ts, punctuation.separator.key-value.ts",
      settings: {
        foreground: palette.grey1,
      },
    },
    {
      name: "TypeScript green",
      scope: "punctuation.definition.tag.directive.ts, entity.other.attribute-name.directive.ts",
      settings: {
        foreground: palette.green,
      },
    },
    {
      name: "TypeScript type",
      scope:
        "entity.name.type.ts, entity.name.type.interface.ts, entity.other.inherited-class.ts, entity.name.type.alias.ts, entity.name.type.class.ts, entity.name.type.enum.ts",
      settings: {
        foreground: syntaxRoleColors.type,
      },
    },
    {
      name: "TypeScript declaration",
      scope: "storage.type.ts, storage.type.function.arrow.ts, storage.type.type.ts",
      settings: {
        foreground: syntaxRoleColors.declaration,
      },
    },
    {
      name: "TypeScript constant",
      scope:
        "variable.other.constant.ts, variable.other.constant.object.ts, variable.other.constant.object.property.ts, variable.other.constant.property.ts",
      settings: {
        foreground: syntaxRoleColors.constant,
      },
    },
    {
      name: "TypeScript namespace",
      scope: "entity.name.type.module.ts",
      settings: {
        foreground: syntaxRoleColors.namespace,
      },
    },
    {
      name: "TypeScript purple",
      scope: "keyword.control.import.ts, keyword.control.export.ts, storage.type.namespace.ts",
      settings: {
        foreground: syntaxRoleColors.keyword,
      },
    },
    // }}}
    // TSX{{{
    {
      name: "TSX grey",
      scope:
        "keyword.operator.type.annotation.tsx, punctuation.accessor.tsx, punctuation.separator.key-value.tsx",
      settings: {
        foreground: syntaxRoleColors.punctuation,
      },
    },
    {
      name: "TSX constant",
      scope:
        "variable.other.constant.tsx, variable.other.constant.object.tsx, variable.other.constant.object.property.tsx, variable.other.constant.property.tsx",
      settings: {
        foreground: syntaxRoleColors.constant,
      },
    },
    {
      name: "TSX purple",
      scope: "keyword.control.import.tsx, keyword.control.export.tsx, storage.type.namespace.tsx",
      settings: {
        foreground: syntaxRoleColors.keyword,
      },
    },
    // }}}
    // CoffeeScript{{{
    {
      name: "CoffeeScript orange",
      scope: "storage.type.function.coffee",
      settings: {
        foreground: palette.orange,
      },
    },
    // }}}
    // PureScript{{{
    {
      name: "PureScript orange",
      scope:
        "keyword.other.double-colon.purescript, keyword.other.arrow.purescript, keyword.other.big-arrow.purescript",
      settings: {
        foreground: palette.orange,
      },
    },
    {
      name: "PureScript yellow",
      scope: "entity.name.function.purescript",
      settings: {
        foreground: palette.yellow,
      },
    },
    {
      name: "PureScript green",
      scope:
        "string.quoted.single.purescript, string.quoted.double.purescript, punctuation.definition.string.begin.purescript, punctuation.definition.string.end.purescript, string.quoted.triple.purescript",
      settings: {
        foreground: palette.green,
      },
    },
    {
      name: "PureScript type",
      scope: "entity.name.type.purescript",
      settings: {
        foreground: syntaxRoleColors.type,
      },
    },
    {
      name: "PureScript purple",
      scope: "support.other.module.purescript",
      settings: {
        foreground: palette.purple,
      },
    },
    // }}}
    // Dart{{{
    {
      name: "Dart grey",
      scope: "punctuation.dot.dart",
      settings: {
        foreground: palette.grey1,
      },
    },
    {
      name: "Dart orange",
      scope: "storage.type.primitive.dart",
      settings: {
        foreground: palette.orange,
      },
    },
    {
      name: "Dart aqua",
      scope: "support.class.dart",
      settings: {
        foreground: palette.aqua,
      },
    },
    {
      name: "Dart callable",
      scope: "entity.name.function.dart",
      settings: {
        foreground: syntaxRoleColors.callable,
      },
    },
    {
      name: "Dart green",
      scope: "string.interpolated.single.dart, string.interpolated.double.dart",
      settings: {
        foreground: palette.green,
      },
    },
    {
      name: "Dart blue",
      scope: "variable.language.dart",
      settings: {
        foreground: palette.blue,
      },
    },
    {
      name: "Dart purple",
      scope: "keyword.other.import.dart, storage.type.annotation.dart",
      settings: {
        foreground: palette.purple,
      },
    },
    // }}}
    // Pug{{{
    {
      name: "Pug red",
      scope: "entity.other.attribute-name.class.pug",
      settings: {
        foreground: palette.red,
      },
    },
    {
      name: "Pug orange",
      scope: "storage.type.function.pug",
      settings: {
        foreground: palette.orange,
      },
    },
    {
      name: "Pug aqua",
      scope: "entity.other.attribute-name.tag.pug",
      settings: {
        foreground: palette.aqua,
      },
    },
    {
      name: "Pug purple",
      scope: "entity.name.tag.pug, storage.type.import.include.pug",
      settings: {
        foreground: palette.purple,
      },
    },
    // }}}
    // C{{{
    {
      name: "C white",
      scope: "storage.modifier.array.bracket.square.c",
      settings: {
        foreground: palette.fg,
      },
    },
    {
      name: "C grey",
      scope: "punctuation.separator.dot-access.c, constant.character.escape.line-continuation.c",
      settings: {
        foreground: palette.grey1,
      },
    },
    {
      name: "C red",
      scope:
        "keyword.control.directive.include.c, punctuation.definition.directive.c, keyword.control.directive.pragma.c, keyword.control.directive.line.c, keyword.control.directive.define.c, keyword.control.directive.conditional.c, keyword.control.directive.diagnostic.error.c, keyword.control.directive.undef.c, keyword.control.directive.conditional.ifdef.c, keyword.control.directive.endif.c, keyword.control.directive.conditional.ifndef.c, keyword.control.directive.conditional.if.c, keyword.control.directive.else.c",
      settings: {
        foreground: palette.red,
      },
    },
    {
      name: "C orange",
      scope: "punctuation.separator.pointer-access.c",
      settings: {
        foreground: palette.orange,
      },
    },
    {
      name: "C property",
      scope: "variable.other.member.c",
      settings: {
        foreground: syntaxRoleColors.property,
      },
    },
    // }}}
    // C++{{{
    {
      name: "C++ white",
      scope: "storage.modifier.array.bracket.square.cpp",
      settings: {
        foreground: palette.fg,
      },
    },
    {
      name: "C++ grey",
      scope:
        "punctuation.separator.dot-access.cpp, constant.character.escape.line-continuation.cpp",
      settings: {
        foreground: palette.grey1,
      },
    },
    {
      name: "C++ red",
      scope:
        "keyword.control.directive.include.cpp, punctuation.definition.directive.cpp, keyword.control.directive.pragma.cpp, keyword.control.directive.line.cpp, keyword.control.directive.define.cpp, keyword.control.directive.conditional.cpp, keyword.control.directive.diagnostic.error.cpp, keyword.control.directive.undef.cpp, keyword.control.directive.conditional.ifdef.cpp, keyword.control.directive.endif.cpp, keyword.control.directive.conditional.ifndef.cpp, keyword.control.directive.conditional.if.cpp, keyword.control.directive.else.cpp, storage.type.namespace.definition.cpp, keyword.other.using.directive.cpp, storage.type.struct.cpp",
      settings: {
        foreground: palette.red,
      },
    },
    {
      name: "C++ orange",
      scope:
        "punctuation.separator.pointer-access.cpp, punctuation.section.angle-brackets.begin.template.call.cpp, punctuation.section.angle-brackets.end.template.call.cpp",
      settings: {
        foreground: palette.orange,
      },
    },
    {
      name: "C++ property",
      scope: "variable.other.member.cpp",
      settings: {
        foreground: syntaxRoleColors.property,
      },
    },
    // }}}
    // C#{{{
    {
      name: "C# red",
      scope: "keyword.other.using.cs",
      settings: {
        foreground: palette.red,
      },
    },
    {
      name: "C# orange",
      scope: "keyword.type.cs",
      settings: {
        foreground: palette.orange,
      },
    },
    {
      name: "C# aqua escape",
      scope:
        "constant.character.escape.cs, punctuation.definition.interpolation.begin.cs, punctuation.definition.interpolation.end.cs",
      settings: {
        foreground: palette.aqua,
      },
    },
    {
      name: "C# green",
      scope:
        "string.quoted.double.cs, string.quoted.single.cs, punctuation.definition.string.begin.cs, punctuation.definition.string.end.cs",
      settings: {
        foreground: palette.green,
      },
    },
    // }}}
    // F#{{{
    {
      name: "F# white",
      scope: "keyword.symbol.fsharp, constant.language.unit.fsharp",
      settings: {
        foreground: palette.fg,
      },
    },
    {
      name: "F# aqua",
      scope: "keyword.format.specifier.fsharp, entity.name.type.fsharp",
      settings: {
        foreground: palette.aqua,
      },
    },
    {
      name: "F# green",
      scope:
        "string.quoted.double.fsharp, string.quoted.single.fsharp, punctuation.definition.string.begin.fsharp, punctuation.definition.string.end.fsharp",
      settings: {
        foreground: palette.green,
      },
    },
    {
      name: "F# blue",
      scope: "entity.name.section.fsharp",
      settings: {
        foreground: palette.blue,
      },
    },
    {
      name: "F# purple",
      scope: "support.function.attribute.fsharp",
      settings: {
        foreground: palette.purple,
      },
    },
    // }}}
    // Java{{{
    {
      name: "Java grey",
      scope: "punctuation.separator.java, punctuation.separator.period.java",
      settings: {
        foreground: palette.grey1,
      },
    },
    {
      name: "Java red",
      scope: "keyword.other.import.java, keyword.other.package.java",
      settings: {
        foreground: palette.red,
      },
    },
    {
      name: "Java orange",
      scope: "storage.type.function.arrow.java, keyword.control.ternary.java",
      settings: {
        foreground: palette.orange,
      },
    },
    {
      name: "Java blue property",
      scope: "variable.other.property.java",
      settings: {
        foreground: palette.blue,
      },
    },
    {
      name: "Java purple",
      scope:
        "variable.language.wildcard.java, storage.modifier.import.java, storage.type.annotation.java, punctuation.definition.annotation.java, storage.modifier.package.java",
      settings: {
        foreground: palette.purple,
      },
    },
    {
      name: "Java namespace",
      scope: "entity.name.type.module.java",
      settings: {
        foreground: syntaxRoleColors.namespace,
      },
    },
    // }}}
    // Kotlin{{{
    {
      name: "Kotlin red",
      scope: "keyword.other.import.kotlin",
      settings: {
        foreground: palette.red,
      },
    },
    {
      name: "Kotlin orange",
      scope: "storage.type.kotlin",
      settings: {
        foreground: palette.orange,
      },
    },
    {
      name: "Kotlin purple constant",
      scope: "constant.language.kotlin",
      settings: {
        foreground: palette.purple,
      },
    },
    {
      name: "Kotlin purple",
      scope: "storage.type.annotation.kotlin",
      settings: {
        foreground: palette.purple,
      },
    },
    {
      name: "Kotlin namespace",
      scope: "entity.name.package.kotlin",
      settings: {
        foreground: syntaxRoleColors.namespace,
      },
    },
    // }}}
    // Scala{{{
    {
      name: "Scala namespace",
      scope: "entity.name.package.scala",
      settings: {
        foreground: syntaxRoleColors.namespace,
      },
    },
    {
      name: "Scala constant",
      scope: "constant.language.scala",
      settings: {
        foreground: syntaxRoleColors.constant,
      },
    },
    {
      name: "Scala aqua",
      scope: "entity.name.import.scala",
      settings: {
        foreground: palette.aqua,
      },
    },
    {
      name: "Scala green",
      scope:
        "string.quoted.double.scala, string.quoted.single.scala, punctuation.definition.string.begin.scala, punctuation.definition.string.end.scala, string.quoted.double.interpolated.scala, string.quoted.single.interpolated.scala, string.quoted.triple.scala",
      settings: {
        foreground: palette.green,
      },
    },
    {
      name: "Scala type",
      scope: "entity.name.class.scala, entity.other.inherited-class.scala",
      settings: {
        foreground: syntaxRoleColors.type,
      },
    },
    {
      name: "Scala declaration",
      scope: "keyword.declaration.stable.scala, keyword.other.arrow.scala",
      settings: {
        foreground: syntaxRoleColors.declaration,
      },
    },
    {
      name: "Scala red",
      scope: "keyword.other.import.scala",
      settings: {
        foreground: palette.red,
      },
    },
    // }}}
    // Groovy{{{
    {
      name: "Groovy white",
      scope: "keyword.operator.navigation.groovy",
      settings: {
        foreground: palette.fg,
      },
    },
    {
      name: "Scala grey",
      scope: "punctuation.separator.groovy",
      settings: {
        foreground: palette.grey1,
      },
    },
    {
      name: "Scala red",
      scope:
        "keyword.other.import.groovy, keyword.other.package.groovy, keyword.other.import.static.groovy",
      settings: {
        foreground: palette.red,
      },
    },
    {
      name: "Groovy orange",
      scope: "storage.type.def.groovy",
      settings: {
        foreground: palette.orange,
      },
    },
    {
      name: "Groovy green",
      scope: "variable.other.interpolated.groovy",
      settings: {
        foreground: palette.green,
      },
    },
    {
      name: "Groovy aqua",
      scope: "storage.modifier.import.groovy, storage.modifier.package.groovy",
      settings: {
        foreground: palette.aqua,
      },
    },
    {
      name: "Groovy purple",
      scope: "storage.type.annotation.groovy",
      settings: {
        foreground: palette.purple,
      },
    },
    // }}}
    // Go{{{
    {
      name: "Go declaration",
      scope: "keyword.type.go",
      settings: {
        foreground: syntaxRoleColors.declaration,
      },
    },
    {
      name: "Go constant",
      scope: "variable.other.constant.go",
      settings: {
        foreground: syntaxRoleColors.constant,
      },
    },
    {
      name: "Go purple",
      scope: "keyword.import.go, keyword.package.go",
      settings: {
        foreground: syntaxRoleColors.keyword,
      },
    },
    // }}}
    // Rust{{{
    {
      name: "Rust grey",
      scope: "keyword.operator.path.rust, keyword.operator.member-access.rust",
      settings: {
        foreground: palette.grey1,
      },
    },
    {
      name: "Rust orange",
      scope: "storage.type.rust",
      settings: {
        foreground: syntaxRoleColors.declaration,
      },
    },
    {
      name: "Rust annotation",
      scope:
        "meta.attribute.rust, variable.language.rust, entity.name.function.macro.rust, entity.name.function.macro.rules.rust",
      settings: {
        foreground: syntaxRoleColors.annotation,
      },
    },
    {
      name: "Rust module declaration",
      scope: "storage.type.module.rust",
      settings: {
        foreground: syntaxRoleColors.declaration,
      },
    },
    // }}}
    // Swift{{{
    // }}}
    // PHP{{{
    {
      name: "PHP white",
      scope: "keyword.operator.class.php",
      settings: {
        foreground: palette.fg,
      },
    },
    {
      name: "PHP orange",
      scope: "storage.type.trait.php",
      settings: {
        foreground: syntaxRoleColors.declaration,
      },
    },
    {
      name: "PHP constant",
      scope: "constant.language.php",
      settings: {
        foreground: syntaxRoleColors.constant,
      },
    },
    {
      name: "PHP orange modifier",
      scope:
        "storage.type.modifier.access.control.public.php, storage.type.modifier.access.control.private.php",
      settings: {
        foreground: syntaxRoleColors.declaration,
      },
    },
    {
      name: "PHP purple",
      scope: "keyword.control.import.include.php",
      settings: {
        foreground: syntaxRoleColors.keyword,
      },
    },
    {
      name: "PHP orange declaration",
      scope: "storage.type.php",
      settings: {
        foreground: syntaxRoleColors.declaration,
      },
    },
    // }}}
    // Python{{{
    {
      name: "Python punctuation",
      scope: "punctuation.separator.period.python",
      settings: {
        foreground: syntaxRoleColors.punctuation,
      },
    },
    {
      name: "Python constant",
      scope: "constant.language.python",
      settings: {
        foreground: syntaxRoleColors.constant,
      },
    },
    {
      name: "Python annotation",
      scope: "punctuation.definition.decorator.python",
      settings: {
        foreground: syntaxRoleColors.annotation,
      },
    },
    {
      name: "Python purple",
      scope: "keyword.control.import.python, keyword.control.import.from.python",
      settings: {
        foreground: syntaxRoleColors.keyword,
      },
    },
    // }}}
    // Lua{{{
    {
      name: "Lua purple constant",
      scope: "constant.language.lua",
      settings: {
        foreground: palette.purple,
      },
    },
    {
      name: "Lua type",
      scope: "entity.name.class.lua",
      settings: {
        foreground: syntaxRoleColors.type,
      },
    },
    // }}}
    // Ruby{{{
    {
      name: "Ruby grey",
      scope: "punctuation.separator.method.ruby",
      settings: {
        foreground: palette.grey1,
      },
    },
    {
      name: "Ruby declaration",
      scope: "keyword.control.pseudo-method.ruby, storage.type.variable.ruby",
      settings: {
        foreground: syntaxRoleColors.declaration,
      },
    },
    {
      name: "Ruby yellow callable",
      scope: "keyword.other.special-method.ruby",
      settings: {
        foreground: palette.yellow,
      },
    },
    {
      name: "Ruby purple",
      scope: "keyword.control.module.ruby, punctuation.definition.constant.ruby",
      settings: {
        foreground: palette.purple,
      },
    },
    {
      name: "Ruby yellow",
      scope:
        "string.regexp.character-class.ruby,string.regexp.interpolated.ruby,punctuation.definition.character-class.ruby,string.regexp.group.ruby, punctuation.section.regexp.ruby, punctuation.definition.group.ruby",
      settings: {
        foreground: palette.yellow,
      },
    },
    {
      name: "Ruby constant",
      scope: "variable.other.constant.ruby",
      settings: {
        foreground: syntaxRoleColors.constant,
      },
    },
    // }}}
    // Haskell{{{
    {
      name: "Haskell orange",
      scope:
        "keyword.other.arrow.haskell, keyword.other.big-arrow.haskell, keyword.other.double-colon.haskell",
      settings: {
        foreground: palette.orange,
      },
    },
    {
      name: "Haskell orange declaration",
      scope: "storage.type.haskell",
      settings: {
        foreground: palette.orange,
      },
    },
    {
      name: "Haskell green",
      scope:
        "string.quoted.double.haskell, string.quoted.single.haskell, punctuation.definition.string.begin.haskell, punctuation.definition.string.end.haskell",
      settings: {
        foreground: palette.green,
      },
    },
    {
      name: "Haskell purple constant",
      scope: "constant.other.haskell",
      settings: {
        foreground: palette.purple,
      },
    },
    {
      name: "Haskell callable",
      scope: "entity.name.function.haskell",
      settings: {
        foreground: syntaxRoleColors.callable,
      },
    },
    {
      name: "Namespace",
      scope: "entity.name.namespace",
      settings: {
        foreground: syntaxRoleColors.namespace,
      },
    },
    {
      name: "Haskell purple preprocessor",
      scope: "meta.preprocessor.haskell",
      settings: {
        foreground: palette.purple,
      },
    },
    // }}}
    // Julia{{{
    {
      name: "Julia red",
      scope: "keyword.control.import.julia, keyword.control.export.julia",
      settings: {
        foreground: palette.red,
      },
    },
    {
      name: "Julia orange",
      scope: "keyword.storage.modifier.julia",
      settings: {
        foreground: palette.orange,
      },
    },
    {
      name: "Julia constant",
      scope: "constant.language.julia",
      settings: {
        foreground: syntaxRoleColors.constant,
      },
    },
    {
      name: "Julia purple",
      scope: "support.function.macro.julia",
      settings: {
        foreground: palette.purple,
      },
    },
    // }}}
    // Elm{{{
    {
      name: "Elm white",
      scope: "keyword.other.period.elm",
      settings: {
        foreground: palette.fg,
      },
    },
    {
      name: "Elm orange declaration",
      scope: "storage.type.elm",
      settings: {
        foreground: palette.orange,
      },
    },
    // }}}
    // R{{{
    {
      name: "R orange",
      scope: "keyword.other.r",
      settings: {
        foreground: palette.orange,
      },
    },
    {
      name: "R yellow callable",
      scope: "entity.name.function.r, variable.function.r",
      settings: {
        foreground: palette.yellow,
      },
    },
    {
      name: "R purple constant",
      scope: "constant.language.r",
      settings: {
        foreground: palette.purple,
      },
    },
    {
      name: "R namespace",
      scope: "entity.namespace.r",
      settings: {
        foreground: syntaxRoleColors.namespace,
      },
    },
    // }}}
    // Erlang{{{
    {
      name: "Erlang grey",
      scope:
        "punctuation.separator.module-function.erlang, punctuation.section.directive.begin.erlang",
      settings: {
        foreground: palette.grey1,
      },
    },
    {
      name: "Erlang red",
      scope: "keyword.control.directive.erlang, keyword.control.directive.define.erlang",
      settings: {
        foreground: palette.red,
      },
    },
    {
      name: "Erlang namespace",
      scope: "entity.name.type.class.module.erlang",
      settings: {
        foreground: syntaxRoleColors.namespace,
      },
    },
    {
      name: "Erlang green",
      scope:
        "string.quoted.double.erlang, string.quoted.single.erlang, punctuation.definition.string.begin.erlang, punctuation.definition.string.end.erlang",
      settings: {
        foreground: palette.green,
      },
    },
    {
      name: "Erlang purple",
      scope:
        "keyword.control.directive.export.erlang, keyword.control.directive.module.erlang, keyword.control.directive.import.erlang, keyword.control.directive.behaviour.erlang",
      settings: {
        foreground: palette.purple,
      },
    },
    // }}}
    // Elixir{{{
    {
      name: "Elixir namespace",
      scope: "variable.other.readwrite.module.elixir",
      settings: {
        foreground: syntaxRoleColors.namespace,
      },
    },
    {
      name: "Elixir purple constant",
      scope: "constant.language.elixir",
      settings: {
        foreground: palette.purple,
      },
    },
    {
      name: "Elixir purple",
      scope: "keyword.control.module.elixir",
      settings: {
        foreground: palette.purple,
      },
    },
    // }}}
    // OCaml{{{
    {
      name: "OCaml white",
      scope: "entity.name.type.value-signature.ocaml",
      settings: {
        foreground: palette.fg,
      },
    },
    {
      name: "OCaml orange",
      scope: "keyword.other.ocaml",
      settings: {
        foreground: palette.orange,
      },
    },
    {
      name: "OCaml aqua",
      scope: "constant.language.variant.ocaml",
      settings: {
        foreground: palette.aqua,
      },
    },
    // }}}
    // Perl{{{
    {
      name: "Perl red",
      scope: "storage.type.sub.perl, storage.type.declare.routine.perl",
      settings: {
        foreground: palette.red,
      },
    },
    // }}}
    // Common Lisp{{{
    {
      name: "Lisp red",
      scope: "storage.type.function-type.lisp",
      settings: {
        foreground: palette.red,
      },
    },
    {
      name: "Lisp green",
      scope: "keyword.constant.lisp",
      settings: {
        foreground: palette.green,
      },
    },
    {
      name: "Lisp callable",
      scope: "entity.name.function.lisp",
      settings: {
        foreground: syntaxRoleColors.callable,
      },
    },
    // }}}
    // Clojure{{{
    {
      name: "Clojure green",
      scope: "constant.keyword.clojure, support.variable.clojure",
      settings: {
        foreground: palette.green,
      },
    },
    {
      name: "Clojure purple",
      scope: "entity.global.clojure",
      settings: {
        foreground: palette.purple,
      },
    },
    {
      name: "Clojure callable",
      scope: "entity.name.function.clojure",
      settings: {
        foreground: syntaxRoleColors.callable,
      },
    },
    // }}}
    // Shell{{{
    {
      name: "Shell callable",
      scope: "support.function.builtin.shell, entity.name.function.shell",
      settings: {
        foreground: syntaxRoleColors.callable,
      },
    },
    {
      name: "Shell string",
      scope:
        "string.quoted.double.shell, string.quoted.single.shell, punctuation.definition.string.begin.shell, punctuation.definition.string.end.shell, string.unquoted.heredoc.shell",
      settings: {
        foreground: syntaxRoleColors.string,
      },
    },
    {
      name: "Shell variable",
      scope:
        "keyword.control.heredoc-token.shell, variable.other.normal.shell, punctuation.definition.variable.shell, variable.other.special.shell, variable.other.positional.shell, variable.other.bracket.shell",
      settings: {
        foreground: syntaxRoleColors.variable,
      },
    },
    {
      name: "Shell declaration",
      scope: "variable.other.assignment.shell",
      settings: {
        foreground: syntaxRoleColors.declaration,
      },
    },
    // }}}
    // Fish{{{
    {
      name: "Fish red",
      scope: "support.function.builtin.fish",
      settings: {
        foreground: palette.red,
      },
    },
    {
      name: "Fish orange",
      scope: "support.function.unix.fish",
      settings: {
        foreground: palette.orange,
      },
    },
    {
      name: "Fish blue",
      scope:
        "variable.other.normal.fish, punctuation.definition.variable.fish, variable.other.fixed.fish, variable.other.special.fish",
      settings: {
        foreground: palette.blue,
      },
    },
    {
      name: "Fish green",
      scope:
        "string.quoted.double.fish, punctuation.definition.string.end.fish, punctuation.definition.string.begin.fish, string.quoted.single.fish",
      settings: {
        foreground: palette.green,
      },
    },
    {
      name: "Fish purple",
      scope: "constant.character.escape.single.fish",
      settings: {
        foreground: palette.purple,
      },
    },
    // }}}
    // PowerShell{{{
    {
      name: "PowerShell grey",
      scope: "punctuation.definition.variable.powershell",
      settings: {
        foreground: palette.grey1,
      },
    },
    {
      name: "PowerShell callable",
      scope:
        "entity.name.function.powershell, support.function.attribute.powershell, support.function.powershell",
      settings: {
        foreground: syntaxRoleColors.callable,
      },
    },
    {
      name: "PowerShell green",
      scope:
        "string.quoted.single.powershell, string.quoted.double.powershell, punctuation.definition.string.begin.powershell, punctuation.definition.string.end.powershell, string.quoted.double.heredoc.powershell",
      settings: {
        foreground: palette.green,
      },
    },
    {
      name: "PowerShell property",
      scope: "variable.other.member.powershell",
      settings: {
        foreground: syntaxRoleColors.property,
      },
    },
    // }}}
    // GraphQL{{{
    {
      name: "GraphQL white",
      scope: "string.unquoted.alias.graphql",
      settings: {
        foreground: palette.fg,
      },
    },
    {
      name: "GraphQL red",
      scope: "keyword.type.graphql",
      settings: {
        foreground: palette.red,
      },
    },
    {
      name: "GraphQL purple",
      scope: "entity.name.fragment.graphql",
      settings: {
        foreground: palette.purple,
      },
    },
    // }}}
    // {{{Makefile
    {
      name: "Makefile orange",
      scope: "entity.name.function.target.makefile",
      settings: {
        foreground: palette.orange,
      },
    },
    {
      name: "Makefile yellow",
      scope: "variable.other.makefile",
      settings: {
        foreground: palette.yellow,
      },
    },
    {
      name: "Makefile green",
      scope: "meta.scope.prerequisites.makefile",
      settings: {
        foreground: palette.green,
      },
    },
    // }}}
    // {{{CMake
    {
      name: "CMake green",
      scope: "string.source.cmake",
      settings: {
        foreground: palette.green,
      },
    },
    {
      name: "CMake aqua",
      scope: "entity.source.cmake",
      settings: {
        foreground: palette.aqua,
      },
    },
    {
      name: "CMake purple",
      scope: "storage.source.cmake",
      settings: {
        foreground: palette.purple,
      },
    },
    // }}}
    // {{{VimL
    {
      name: "VimL grey",
      scope: "punctuation.definition.map.viml",
      settings: {
        foreground: palette.grey1,
      },
    },
    {
      name: "VimL orange",
      scope: "storage.type.map.viml",
      settings: {
        foreground: palette.orange,
      },
    },
    {
      name: "VimL green",
      scope: "constant.character.map.viml, constant.character.map.key.viml",
      settings: {
        foreground: palette.green,
      },
    },
    {
      name: "VimL blue",
      scope: "constant.character.map.special.viml",
      settings: {
        foreground: palette.blue,
      },
    },
    // }}}
    // {{{Tmux
    {
      name: "Tmux green",
      scope: "constant.language.tmux, constant.numeric.tmux",
      settings: {
        foreground: palette.green,
      },
    },
    // }}}
    // HCL / Terraform{{{
    {
      name: "Terraform declaration",
      scope: "variable.declaration.hcl",
      settings: {
        foreground: syntaxRoleColors.declaration,
      },
    },
    {
      name: "Terraform property",
      scope:
        "meta.mapping.key.hcl variable.other.readwrite.hcl, meta.mapping.key.hcl string.quoted.double.hcl, variable.other.member.hcl",
      settings: {
        foreground: syntaxRoleColors.property,
      },
    },
    // }}}
    // {{{Dockerfile
    {
      name: "Dockerfile callable",
      scope: "entity.name.function.package-manager.dockerfile",
      settings: {
        foreground: syntaxRoleColors.callable,
      },
    },
    {
      name: "Dockerfile yellow",
      scope: "keyword.operator.flag.dockerfile",
      settings: {
        foreground: palette.yellow,
      },
    },
    {
      name: "Dockerfile green",
      scope: "string.quoted.double.dockerfile, string.quoted.single.dockerfile",
      settings: {
        foreground: palette.green,
      },
    },
    {
      name: "Dockerfile aqua",
      scope: "constant.character.escape.dockerfile",
      settings: {
        foreground: palette.aqua,
      },
    },
    {
      name: "Dockerfile type",
      scope: "entity.name.type.base-image.dockerfile, entity.name.image.dockerfile",
      settings: {
        foreground: syntaxRoleColors.type,
      },
    },
    // }}}
    // Diff{{{
    {
      name: "Diff grey",
      scope: "punctuation.definition.separator.diff",
      settings: {
        foreground: palette.grey1,
      },
    },
    {
      name: "Diff red",
      scope: "markup.deleted.diff, punctuation.definition.deleted.diff",
      settings: {
        foreground: palette.red,
      },
    },
    {
      name: "Diff orange",
      scope: "meta.diff.range.context, punctuation.definition.range.diff",
      settings: {
        foreground: palette.orange,
      },
    },
    {
      name: "Diff yellow",
      scope: "meta.diff.header.from-file",
      settings: {
        foreground: palette.yellow,
      },
    },
    {
      name: "Diff green",
      scope: "markup.inserted.diff, punctuation.definition.inserted.diff",
      settings: {
        foreground: palette.green,
      },
    },
    {
      name: "Diff blue",
      scope: "markup.changed.diff, punctuation.definition.changed.diff",
      settings: {
        foreground: palette.blue,
      },
    },
    {
      name: "Diff purple",
      scope: "punctuation.definition.from-file.diff",
      settings: {
        foreground: palette.purple,
      },
    },
    // }}}
    // {{{Git
    {
      name: "Git red",
      scope: "entity.name.section.group-title.ini, punctuation.definition.entity.ini",
      settings: {
        foreground: palette.red,
      },
    },
    {
      name: "Git orange",
      scope: "punctuation.separator.key-value.ini",
      settings: {
        foreground: palette.orange,
      },
    },
    {
      name: "Git green",
      scope:
        "string.quoted.double.ini, string.quoted.single.ini, punctuation.definition.string.begin.ini, punctuation.definition.string.end.ini",
      settings: {
        foreground: palette.green,
      },
    },
    {
      name: "Git aqua",
      scope: "keyword.other.definition.ini",
      settings: {
        foreground: palette.aqua,
      },
    },
    // }}}
    // Jinja{{{
    {
      name: "Jinja declaration",
      scope: "variable.other.jinja.block",
      settings: {
        foreground: syntaxRoleColors.declaration,
      },
    },
    {
      name: "Jinja callable",
      scope: "variable.other.jinja.filter, variable.other.jinja.test",
      settings: {
        foreground: syntaxRoleColors.callable,
      },
    },
    {
      name: "Jinja property",
      scope: "variable.other.jinja.attribute",
      settings: {
        foreground: syntaxRoleColors.property,
      },
    },
    // }}}
    // SQL{{{
    {
      name: "SQL type",
      scope: "storage.type.sql",
      settings: {
        foreground: syntaxRoleColors.type,
      },
    },
    {
      name: "SQL callable",
      scope: "support.function.aggregate.sql",
      settings: {
        foreground: syntaxRoleColors.callable,
      },
    },
    {
      name: "SQL string",
      scope:
        "string.quoted.single.sql, punctuation.definition.string.end.sql, punctuation.definition.string.begin.sql, string.quoted.double.sql",
      settings: {
        foreground: syntaxRoleColors.string,
      },
    },
    // }}}
    // GraphQL{{{
    {
      name: "GraphQL type",
      scope: "support.type.graphql",
      settings: {
        foreground: syntaxRoleColors.type,
      },
    },
    {
      name: "GraphQL parameter",
      scope: "variable.parameter.graphql",
      settings: {
        foreground: syntaxRoleColors.parameter,
      },
    },
    {
      name: "GraphQL constant",
      scope: "constant.character.enum.graphql",
      settings: {
        foreground: syntaxRoleColors.constant,
      },
    },
    // }}}
    // JSON{{{
    {
      name: "JSON grey",
      scope:
        "punctuation.support.type.property-name.begin.json, punctuation.support.type.property-name.end.json, punctuation.separator.dictionary.key-value.json, punctuation.definition.string.begin.json, punctuation.definition.string.end.json, punctuation.separator.dictionary.pair.json, punctuation.separator.array.json",
      settings: {
        foreground: palette.grey1,
      },
    },
    {
      name: "JSON property",
      scope: "support.type.property-name.json",
      settings: {
        foreground: syntaxRoleColors.property,
      },
    },
    {
      name: "JSON string",
      scope: "string.quoted.double.json",
      settings: {
        foreground: syntaxRoleColors.string,
      },
    },
    // }}}
    // YAML{{{
    {
      name: "YAML grey",
      scope: "punctuation.separator.key-value.mapping.yaml",
      settings: {
        foreground: palette.grey1,
      },
    },
    {
      name: "YAML string",
      scope:
        "string.unquoted.plain.out.yaml, string.quoted.single.yaml, string.quoted.double.yaml, punctuation.definition.string.begin.yaml, punctuation.definition.string.end.yaml, string.unquoted.plain.in.yaml, string.unquoted.block.yaml",
      settings: {
        foreground: syntaxRoleColors.string,
      },
    },
    {
      name: "YAML property",
      scope:
        "meta.flow.map.key.yaml string.unquoted.plain.in.yaml entity.name.tag.yaml, meta.map.key.yaml string.quoted.double.yaml entity.name.tag.yaml, meta.map.key.yaml string.unquoted.plain.yaml entity.name.tag.yaml",
      settings: {
        foreground: syntaxRoleColors.property,
      },
    },
    {
      name: "YAML aqua",
      scope: "punctuation.definition.anchor.yaml, punctuation.definition.block.sequence.item.yaml",
      settings: {
        foreground: palette.aqua,
      },
    },
    // }}}
    // TOML{{{
    {
      name: "TOML orange",
      scope: "keyword.key.toml",
      settings: {
        foreground: palette.orange,
      },
    },
    {
      name: "TOML green",
      scope: "string.quoted.single.basic.line.toml, string.quoted.single.literal.line.toml",
      settings: {
        foreground: palette.green,
      },
    },
    {
      name: "TOML grey punctuation",
      scope: "punctuation.definition.keyValuePair.toml",
      settings: {
        foreground: palette.grey1,
      },
    },
    {
      name: "TOML constant",
      scope: "constant.other.boolean.toml",
      settings: {
        foreground: syntaxRoleColors.constant,
      },
    },
    {
      name: "TOML blue table",
      scope:
        "entity.other.attribute-name.table.toml, punctuation.definition.table.toml, entity.other.attribute-name.table.array.toml, punctuation.definition.table.array.toml",
      settings: {
        foreground: palette.blue,
      },
    },
    // }}}
  ];
  syntax.push(
    {
      name: "Configured keyword style",
      scope: "keyword, storage.type, storage.modifier",
      settings: {
        fontStyle: syntaxStylePreferences.italicKeywords ? "italic" : "",
      },
    },
    {
      name: "Comment",
      scope: "comment, string.comment, punctuation.definition.comment",
      settings: {
        foreground: syntaxRoleColors.comment,
        fontStyle: syntaxStylePreferences.italicComments ? "italic" : "",
      },
    }
  );
  return syntax;
}

// vim: fdm=marker fmr={{{,}}}:
