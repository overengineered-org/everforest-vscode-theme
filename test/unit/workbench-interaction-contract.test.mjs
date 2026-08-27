import assert from "node:assert/strict";
import test from "node:test";
import { findIndistinguishableHoverBackgroundPairs } from "../../scripts/workbench-interaction-contract.mjs";

test("finds indistinguishable hover backgrounds across VS Code identifier styles", () => {
  const workbenchColors = {
    "button.background": "#111111",
    "button.hoverBackground": "#111111",
    "chat.requestBubbleBackground": "#222222",
    "chat.requestBubbleHoverBackground": "#222222",
    "editorStickyScroll.background": "#333333",
    "editorStickyScrollHover.background": "#333333",
  };

  assert.deepEqual(findIndistinguishableHoverBackgroundPairs(workbenchColors), [
    {
      baseBackgroundIdentifier: "button.background",
      hoverBackgroundIdentifier: "button.hoverBackground",
      sharedBackgroundColor: "#111111",
    },
    {
      baseBackgroundIdentifier: "chat.requestBubbleBackground",
      hoverBackgroundIdentifier: "chat.requestBubbleHoverBackground",
      sharedBackgroundColor: "#222222",
    },
    {
      baseBackgroundIdentifier: "editorStickyScroll.background",
      hoverBackgroundIdentifier: "editorStickyScrollHover.background",
      sharedBackgroundColor: "#333333",
    },
  ]);
});

test("ignores distinct hover backgrounds and identifiers without a base pair", () => {
  const workbenchColors = {
    "button.background": "#111111",
    "button.hoverBackground": "#222222",
    "list.hoverBackground": "#333333",
  };

  assert.deepEqual(findIndistinguishableHoverBackgroundPairs(workbenchColors), []);
});
