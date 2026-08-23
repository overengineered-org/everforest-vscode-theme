import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repositoryDirectory = resolve(import.meta.dirname, "../..");
const marketplaceIconBytes = readFileSync(resolve(repositoryDirectory, "media/icon.png"));

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

test("ships a 512px opaque RGB Marketplace icon", () => {
  assert.deepEqual(marketplaceIconBytes.subarray(0, 8), pngSignature);
  assert.equal(marketplaceIconBytes.subarray(12, 16).toString("ascii"), "IHDR");
  assert.equal(marketplaceIconBytes.readUInt32BE(16), 512);
  assert.equal(marketplaceIconBytes.readUInt32BE(20), 512);
  assert.equal(marketplaceIconBytes.readUInt8(24), 8);
  assert.equal(marketplaceIconBytes.readUInt8(25), 2);
});
