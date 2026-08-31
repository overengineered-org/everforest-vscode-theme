import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import pngjs from "pngjs";

const { PNG } = pngjs;
const marketplaceIconSize = 512;
const sourceShapeDefinitions = Object.freeze([
  { element: "rect", fill: "#2d353b", width: "512", height: "512" },
  {
    element: "path",
    fill: "#83c092",
    d: "M256 104 333 195c6 7 2 13-7 13H186c-9 0-13-6-7-13l77-91Z",
  },
  {
    element: "path",
    fill: "#a7c080",
    d: "M211 224h90l65 75c6 7 2 13-8 13H154c-10 0-14-6-8-13l65-75Z",
  },
  {
    element: "path",
    fill: "#8da101",
    d: "M169 328h174l66 75c7 8 2 15-9 15H112c-11 0-16-7-9-15l66-75Z",
  },
  { element: "rect", fill: "#d3c6aa", x: "237", y: "418", width: "38", height: "32", rx: "12" },
]);
const expectedRasterBoundsByFill = Object.freeze({
  "83c092": { left: 177, top: 106, right: 335, bottom: 208 },
  a7c080: { left: 144, top: 224, right: 368, bottom: 312 },
  "8da101": { left: 100, top: 328, right: 412, bottom: 418 },
  d3c6aa: { left: 237, top: 418, right: 275, bottom: 450 },
});
const expectedArtworkBounds = Object.freeze({ left: 99, top: 104, right: 413, bottom: 450 });
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function parseAttributes(attributeText) {
  return Object.fromEntries(
    [...attributeText.matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g)].map((match) => [
      match[1],
      match[2],
    ])
  );
}

function readSourceShapeDefinitions(sourceSvg) {
  const sourceShapeMatches = [...sourceSvg.matchAll(/<(rect|path)\b([^>]*)\/?>(?:<\/\1>)?/g)];
  return sourceShapeMatches.map((shapeMatch) => {
    const shapeAttributes = parseAttributes(shapeMatch[2]);
    const shapeDefinition = { element: shapeMatch[1], fill: shapeAttributes.fill };
    for (const attributeName of ["d", "x", "y", "width", "height", "rx"]) {
      if (shapeAttributes[attributeName] !== undefined) {
        shapeDefinition[attributeName] = shapeAttributes[attributeName];
      }
    }
    return shapeDefinition;
  });
}

function readPixelRgb(rasterImage, pixelX, pixelY) {
  const pixelByteOffset = (pixelY * rasterImage.width + pixelX) * 4;
  return [...rasterImage.data.subarray(pixelByteOffset, pixelByteOffset + 3)];
}

function readRasterBoundsByFill(rasterImage, fillHexColor) {
  const expectedRgb = [
    Number.parseInt(fillHexColor.slice(0, 2), 16),
    Number.parseInt(fillHexColor.slice(2, 4), 16),
    Number.parseInt(fillHexColor.slice(4, 6), 16),
  ];
  const rasterBounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (let pixelY = 0; pixelY < rasterImage.height; pixelY += 1) {
    for (let pixelX = 0; pixelX < rasterImage.width; pixelX += 1) {
      const pixelRgb = readPixelRgb(rasterImage, pixelX, pixelY);
      if (!pixelRgb.every((channel, index) => channel === expectedRgb[index])) continue;
      rasterBounds.left = Math.min(rasterBounds.left, pixelX);
      rasterBounds.top = Math.min(rasterBounds.top, pixelY);
      rasterBounds.right = Math.max(rasterBounds.right, pixelX + 1);
      rasterBounds.bottom = Math.max(rasterBounds.bottom, pixelY + 1);
    }
  }
  return rasterBounds;
}

function validateRasterBackground(rasterImage, backgroundRgb) {
  const rasterizationPadding = 1;
  for (let pixelY = 0; pixelY < rasterImage.height; pixelY += 1) {
    for (let pixelX = 0; pixelX < rasterImage.width; pixelX += 1) {
      const isInsideArtwork =
        pixelX + rasterizationPadding >= expectedArtworkBounds.left &&
        pixelX - rasterizationPadding <= expectedArtworkBounds.right &&
        pixelY + rasterizationPadding >= expectedArtworkBounds.top &&
        pixelY - rasterizationPadding <= expectedArtworkBounds.bottom;
      if (isInsideArtwork) continue;
      const pixelRgb = readPixelRgb(rasterImage, pixelX, pixelY);
      if (!pixelRgb.every((channel, index) => channel === backgroundRgb[index])) {
        throw new Error(`Icon raster has artwork outside SVG bounds at ${pixelX},${pixelY}`);
      }
    }
  }
}

export function validateMarketplaceIcon(repositoryDirectory) {
  const sourceSvgPath = resolve(repositoryDirectory, "media/icon.svg");
  const rasterPngPath = resolve(repositoryDirectory, "media/icon.png");
  const packageManifestPath = resolve(repositoryDirectory, "package.json");
  const sourceSvg = readFileSync(sourceSvgPath, "utf8");
  const sourceRootAttributes = parseAttributes(sourceSvg.match(/<svg\b([^>]*)>/)?.[1] ?? "");
  const rasterPngBytes = readFileSync(rasterPngPath);
  const rasterImage = PNG.sync.read(rasterPngBytes);
  const extensionManifest = JSON.parse(readFileSync(packageManifestPath, "utf8"));

  if (sourceRootAttributes.viewBox !== "0 0 512 512") {
    throw new Error("Icon source must use a 0 0 512 512 viewBox");
  }
  if (
    JSON.stringify(readSourceShapeDefinitions(sourceSvg)) !== JSON.stringify(sourceShapeDefinitions)
  ) {
    throw new Error("Icon raster is out of sync with the owned SVG source definition");
  }
  if (rasterPngBytes.subarray(0, 8).compare(pngSignature) !== 0) {
    throw new Error("Icon raster is not a PNG");
  }
  if (rasterImage.width !== marketplaceIconSize || rasterImage.height !== marketplaceIconSize) {
    throw new Error(`Icon raster must be ${marketplaceIconSize}x${marketplaceIconSize}`);
  }
  if (rasterPngBytes.readUInt8(24) !== 8 || rasterPngBytes.readUInt8(25) !== 2) {
    throw new Error("Icon raster must be an opaque 8-bit RGB PNG");
  }
  if (
    extensionManifest.icon !== "media/icon.png" ||
    !extensionManifest.files?.includes("media/icon.png")
  ) {
    throw new Error("package.json must ship media/icon.png as the Marketplace icon");
  }
  if (extensionManifest.files.includes("media/icon.svg")) {
    throw new Error("package.json must not ship the editable SVG source as a duplicate");
  }

  for (const [fillHexColor, expectedRasterBounds] of Object.entries(expectedRasterBoundsByFill)) {
    const actualRasterBounds = readRasterBoundsByFill(rasterImage, fillHexColor);
    if (JSON.stringify(actualRasterBounds) !== JSON.stringify(expectedRasterBounds)) {
      throw new Error(
        `Icon raster fill #${fillHexColor} bounds differ from the owned SVG output: ` +
          `${JSON.stringify(actualRasterBounds)}`
      );
    }
  }
  const backgroundRgb = [0x2d, 0x35, 0x3b];
  for (let pixelY = 0; pixelY < rasterImage.height; pixelY += 1) {
    for (let pixelX = 0; pixelX < rasterImage.width; pixelX += 1) {
      if (rasterImage.data[(pixelY * rasterImage.width + pixelX) * 4 + 3] !== 255) {
        throw new Error(`Icon raster has transparency at ${pixelX},${pixelY}`);
      }
    }
  }
  validateRasterBackground(rasterImage, backgroundRgb);
  return {
    sourceSvgPath,
    rasterPngPath,
    artworkFillCount: Object.keys(expectedRasterBoundsByFill).length,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const validationResult = validateMarketplaceIcon(process.cwd());
  console.log(
    `Validated SVG-owned Marketplace icon source and ${validationResult.rasterPngPath} raster ` +
      `(${validationResult.artworkFillCount} artwork fills).`
  );
}
