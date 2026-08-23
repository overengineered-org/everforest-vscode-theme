import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import pngjs from "pngjs";

const repositoryDirectory = resolve(import.meta.dirname, "../..");
const marketplaceIconBytes = readFileSync(resolve(repositoryDirectory, "media/icon.png"));
const { PNG } = pngjs;
const marketplaceIcon = PNG.sync.read(marketplaceIconBytes);

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const expectedSquareBackground = [0x2d, 0x35, 0x3b, 0xff];
const centralArtworkBounds = { left: 80, top: 60, right: 432, bottom: 450 };

test("ships a 512px opaque RGB Marketplace icon", () => {
  assert.deepEqual(marketplaceIconBytes.subarray(0, 8), pngSignature);
  assert.equal(marketplaceIconBytes.subarray(12, 16).toString("ascii"), "IHDR");
  assert.equal(marketplaceIconBytes.readUInt32BE(16), 512);
  assert.equal(marketplaceIconBytes.readUInt32BE(20), 512);
  assert.equal(marketplaceIconBytes.readUInt8(24), 8);
  assert.equal(marketplaceIconBytes.readUInt8(25), 2);
});

test("uses a solid square background outside the central artwork", () => {
  let firstUnexpectedBackgroundPixel;

  for (let pixelY = 0; pixelY < marketplaceIcon.height; pixelY += 1) {
    for (let pixelX = 0; pixelX < marketplaceIcon.width; pixelX += 1) {
      const isInsideCentralArtwork =
        pixelX >= centralArtworkBounds.left &&
        pixelX < centralArtworkBounds.right &&
        pixelY >= centralArtworkBounds.top &&
        pixelY < centralArtworkBounds.bottom;

      if (isInsideCentralArtwork) {
        continue;
      }

      const pixelByteOffset = (pixelY * marketplaceIcon.width + pixelX) * 4;
      const pixelColor = Array.from(
        marketplaceIcon.data.subarray(pixelByteOffset, pixelByteOffset + 4)
      );

      if (!expectedSquareBackground.every((channel, index) => channel === pixelColor[index])) {
        firstUnexpectedBackgroundPixel = { pixelX, pixelY, pixelColor };
        break;
      }
    }

    if (firstUnexpectedBackgroundPixel) {
      break;
    }
  }

  assert.equal(firstUnexpectedBackgroundPixel, undefined);
});
