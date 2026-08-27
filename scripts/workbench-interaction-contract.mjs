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

export function findIndistinguishableHoverBackgroundPairs(workbenchColors) {
  return Object.entries(workbenchColors).flatMap(
    ([hoverBackgroundIdentifier, hoverBackgroundColor]) => {
      if (!/hover.*background/i.test(hoverBackgroundIdentifier)) return [];

      const baseBackgroundIdentifier = baseBackgroundIdentifierForHoverBackground(
        hoverBackgroundIdentifier,
        workbenchColors
      );
      if (
        !baseBackgroundIdentifier ||
        workbenchColors[baseBackgroundIdentifier] !== hoverBackgroundColor
      ) {
        return [];
      }

      return [
        {
          baseBackgroundIdentifier,
          hoverBackgroundIdentifier,
          sharedBackgroundColor: hoverBackgroundColor,
        },
      ];
    }
  );
}
