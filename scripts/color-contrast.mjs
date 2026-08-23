function rgbChannelsFromHexColor(hexColor) {
  const hexColorMatch = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(hexColor);
  if (!hexColorMatch) throw new Error(`Invalid color: ${hexColor}`);
  const rgbHexadecimalDigits = hexColorMatch[1];
  return [0, 2, 4].map((channelOffset) =>
    Number.parseInt(rgbHexadecimalDigits.slice(channelOffset, channelOffset + 2), 16)
  );
}

function relativeLuminance(hexColor) {
  const channelWeights = [0.2126, 0.7152, 0.0722];
  return rgbChannelsFromHexColor(hexColor)
    .map((channel) => channel / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    .reduce(
      (luminance, channel, channelIndex) => luminance + channel * channelWeights[channelIndex],
      0
    );
}

export function contrastRatio(foregroundColor, backgroundColor) {
  const lighterLuminance = Math.max(
    relativeLuminance(foregroundColor),
    relativeLuminance(backgroundColor)
  );
  const darkerLuminance = Math.min(
    relativeLuminance(foregroundColor),
    relativeLuminance(backgroundColor)
  );
  return (lighterLuminance + 0.05) / (darkerLuminance + 0.05);
}

export function validateHexColor(hexColor) {
  rgbChannelsFromHexColor(hexColor);
}
