import { compositeHexColor } from "./color-contrast.mjs";

function baseBackgroundIdentifierForHoverBackground(hoverBackgroundIdentifier, workbenchColors) {
  const baseBackgroundIdentifierCandidates = [
    hoverBackgroundIdentifier.replace(/\.hoverBackground$/, ".background"),
    hoverBackgroundIdentifier.replace(/HoverBackground$/, "Background"),
    hoverBackgroundIdentifier.replace(/Hover\.background$/, ".background"),
  ];

  return baseBackgroundIdentifierCandidates.find(
    (baseBackgroundIdentifier) =>
      baseBackgroundIdentifier !== hoverBackgroundIdentifier &&
      baseBackgroundIdentifier in workbenchColors
  );
}

function alphaChannelFromHexColor(hexColor) {
  const hexColorMatch = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.exec(hexColor);
  if (!hexColorMatch) return undefined;
  return hexColorMatch[1] === undefined ? 255 : Number.parseInt(hexColorMatch[1], 16);
}

function renderedHoverBackgroundColor(hoverBackgroundColor, baseBackgroundColor) {
  const hoverBackgroundAlphaChannel = alphaChannelFromHexColor(hoverBackgroundColor);
  const baseBackgroundAlphaChannel = alphaChannelFromHexColor(baseBackgroundColor);
  if (
    hoverBackgroundAlphaChannel === undefined ||
    hoverBackgroundAlphaChannel === 255 ||
    baseBackgroundAlphaChannel !== 255
  ) {
    return hoverBackgroundColor;
  }
  return compositeHexColor(hoverBackgroundColor, baseBackgroundColor);
}

export function findIndistinguishableHoverBackgroundPairs(workbenchColors) {
  return Object.entries(workbenchColors).flatMap(
    ([hoverBackgroundIdentifier, hoverBackgroundColor]) => {
      if (!/hover.*background/i.test(hoverBackgroundIdentifier)) return [];

      const baseBackgroundIdentifier = baseBackgroundIdentifierForHoverBackground(
        hoverBackgroundIdentifier,
        workbenchColors
      );
      if (!baseBackgroundIdentifier) {
        return [];
      }
      const baseBackgroundColor = workbenchColors[baseBackgroundIdentifier];
      const renderedHoverBackground = renderedHoverBackgroundColor(
        hoverBackgroundColor,
        baseBackgroundColor
      );
      const renderedBaseBackground = baseBackgroundColor;
      if (renderedBaseBackground !== renderedHoverBackground) return [];

      return [
        {
          baseBackgroundIdentifier,
          hoverBackgroundIdentifier,
          sharedBackgroundColor: renderedHoverBackground,
        },
      ];
    }
  );
}
