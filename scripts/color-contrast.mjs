function rgbaChannelsFromHexColor(hexColor) {
  const hexColorMatch = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hexColor);
  if (!hexColorMatch) throw new Error(`Invalid color: ${hexColor}`);
  const rgbHexadecimalDigits = hexColorMatch[1];
  return {
    alpha: hexColorMatch[2] ? Number.parseInt(hexColorMatch[2], 16) / 255 : 1,
    rgbChannels: [0, 2, 4].map((channelOffset) =>
      Number.parseInt(rgbHexadecimalDigits.slice(channelOffset, channelOffset + 2), 16)
    ),
  };
}

function relativeLuminance(hexColor) {
  const channelWeights = [0.2126, 0.7152, 0.0722];
  return rgbaChannelsFromHexColor(hexColor)
    .rgbChannels.map((channel) => channel / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    .reduce(
      (luminance, channel, channelIndex) => luminance + channel * channelWeights[channelIndex],
      0
    );
}

export function compositeHexColor(overlayColor, surfaceColor) {
  const overlayChannels = rgbaChannelsFromHexColor(overlayColor);
  const surfaceChannels = rgbaChannelsFromHexColor(surfaceColor);
  if (surfaceChannels.alpha !== 1) {
    throw new Error(`Surface color must be opaque: ${surfaceColor}`);
  }

  const compositedRgbChannels = overlayChannels.rgbChannels.map((overlayChannel, channelIndex) =>
    Math.round(
      overlayChannel * overlayChannels.alpha +
        surfaceChannels.rgbChannels[channelIndex] * (1 - overlayChannels.alpha)
    )
  );
  return `#${compositedRgbChannels
    .map((compositedChannel) => compositedChannel.toString(16).padStart(2, "0"))
    .join("")}`;
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
  rgbaChannelsFromHexColor(hexColor);
}
