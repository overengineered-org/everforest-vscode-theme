import assert from "node:assert/strict";
import test from "node:test";
import {
  collectAdvancedThemeConfiguration,
  collectAutomaticSwitchingSelection,
  collectGuidedThemeSelections,
  showConfigurationChoice,
} from "../../dist/configuration-ui.js";

const guidedThemeConfigurationSnapshot = {
  appearanceBehavior: "system",
  darkContrast: "medium",
  lightContrast: "medium",
  darkWorkbench: "material",
  lightWorkbench: "material",
  themeSchedule: [
    { time: "07:00", theme: "Everforest Complete Light" },
    { time: "19:00", theme: "Everforest Complete Dark" },
  ],
};

function createConfigurationUiHost({ quickPickValues = [], inputValues = [] } = {}) {
  const selectedQuickPickValues = [...quickPickValues];
  const enteredInputValues = [...inputValues];
  const quickPickCalls = [];
  const inputOptions = [];
  return {
    inputOptions,
    quickPickCalls,
    async showQuickPick(renderedItems, options) {
      quickPickCalls.push({ items: [...renderedItems], options: { ...options } });
      const selectedQuickPickValue = selectedQuickPickValues.shift();
      if (selectedQuickPickValue === undefined) return undefined;

      const selectedRenderedItem = renderedItems.find((renderedItem) => {
        if (Object.hasOwn(renderedItem, "configurationValue")) {
          return renderedItem.configurationValue === selectedQuickPickValue;
        }
        return renderedItem.action === selectedQuickPickValue;
      });
      assert.ok(
        selectedRenderedItem,
        `Quick Pick did not render the requested value: ${String(selectedQuickPickValue)}`
      );
      assert.ok(renderedItems.includes(selectedRenderedItem));
      return selectedRenderedItem;
    },
    async showInputBox(options) {
      inputOptions.push(options);
      return enteredInputValues.shift();
    },
  };
}

const quickPickChoice = (configurationValue) => configurationValue;

test("returns no guided selection when any step is cancelled", async () => {
  for (const quickPickValues of [
    [],
    [quickPickChoice("dark")],
    [quickPickChoice("dark"), quickPickChoice("hard")],
  ]) {
    assert.equal(
      await collectGuidedThemeSelections(
        guidedThemeConfigurationSnapshot,
        createConfigurationUiHost({ quickPickValues })
      ),
      undefined
    );
  }
});

test("handles a missing current choice and an item without a description", async () => {
  const configurationUiHost = createConfigurationUiHost({
    quickPickValues: ["one"],
  });
  assert.equal(
    await showConfigurationChoice(
      [{ label: "One", configurationValue: "one" }],
      "missing",
      "Test",
      "Test",
      configurationUiHost
    ),
    "one"
  );
  assert.deepEqual(configurationUiHost.quickPickCalls[0].items, [
    {
      label: "One",
      configurationValue: "one",
    },
  ]);
  assert.deepEqual(configurationUiHost.quickPickCalls[0].options, {
    title: "Test",
    placeHolder: "Test",
    ignoreFocusOut: true,
  });
  assert.equal(configurationUiHost.inputOptions.length, 0);

  const choiceWithoutDescriptionHost = createConfigurationUiHost({
    quickPickValues: ["one"],
  });
  assert.equal(
    await showConfigurationChoice(
      [{ label: "One", configurationValue: "one" }],
      "one",
      "Test",
      "Test",
      choiceWithoutDescriptionHost
    ),
    "one"
  );
  assert.deepEqual(choiceWithoutDescriptionHost.quickPickCalls[0].items, [
    {
      label: "$(check) One",
      description: "Current",
      configurationValue: "one",
    },
  ]);
});

test("collects the guided choices in order", async () => {
  const configurationUiHost = createConfigurationUiHost({
    quickPickValues: ["light", "hard", "high-contrast"],
  });
  assert.deepEqual(
    await collectGuidedThemeSelections(guidedThemeConfigurationSnapshot, configurationUiHost),
    { appearanceBehavior: "light", contrast: "hard", workbenchStyle: "high-contrast" }
  );
});

test("renders guided Quick Pick order, titles, and current markers", async () => {
  const configurationUiHost = createConfigurationUiHost({
    quickPickValues: ["system", "medium", "material"],
  });

  await collectGuidedThemeSelections(guidedThemeConfigurationSnapshot, configurationUiHost);

  assert.deepEqual(
    configurationUiHost.quickPickCalls.map(({ options }) => options),
    [
      {
        title: "Everforest Complete · 1 of 3",
        placeHolder: "Choose Light and Dark behaviour. Escape discards everything.",
        ignoreFocusOut: true,
      },
      {
        title: "Everforest Complete · 2 of 3",
        placeHolder: "Choose background contrast. Escape discards everything.",
        ignoreFocusOut: true,
      },
      {
        title: "Everforest Complete · 3 of 3",
        placeHolder: "Choose workbench depth. Selecting applies all three choices.",
        ignoreFocusOut: true,
      },
    ]
  );
  assert.deepEqual(
    configurationUiHost.quickPickCalls.map(({ items }) =>
      items.map((item) => item.configurationValue)
    ),
    [
      ["system", "dark", "light", "schedule"],
      ["medium", "soft", "hard"],
      ["material", "flat", "high-contrast"],
    ]
  );
  assert.deepEqual(
    configurationUiHost.quickPickCalls.map(({ items }) => items[0]),
    [
      {
        label: "$(check) Follow System",
        description: "Current · Match macOS, Windows, or Linux",
        detail: "Applies the next two choices to both Light and Dark.",
        configurationValue: "system",
      },
      {
        label: "$(check) Medium",
        description: "Current · Balanced",
        detail: "Recommended default for most workbenches.",
        configurationValue: "medium",
      },
      {
        label: "$(check) Material",
        description: "Current · Tonal depth",
        detail: "Recommended. Calm separation between editor and supporting surfaces.",
        configurationValue: "material",
      },
    ]
  );
});

test("uses the matching current Light/Dark values and exposes mixed values as unset", async () => {
  const darkThemeConfigurationSnapshot = {
    ...guidedThemeConfigurationSnapshot,
    appearanceBehavior: "dark",
  };
  assert.deepEqual(
    await collectGuidedThemeSelections(
      darkThemeConfigurationSnapshot,
      createConfigurationUiHost({
        quickPickValues: [
          quickPickChoice("dark"),
          quickPickChoice("medium"),
          quickPickChoice("material"),
        ],
      })
    ),
    { appearanceBehavior: "dark", contrast: "medium", workbenchStyle: "material" }
  );

  const mixedThemeConfigurationSnapshot = {
    ...guidedThemeConfigurationSnapshot,
    darkContrast: "hard",
    lightContrast: "soft",
    darkWorkbench: "flat",
    lightWorkbench: "high-contrast",
  };
  assert.deepEqual(
    await collectGuidedThemeSelections(
      mixedThemeConfigurationSnapshot,
      createConfigurationUiHost({
        quickPickValues: [
          quickPickChoice("system"),
          quickPickChoice("medium"),
          quickPickChoice("material"),
        ],
      })
    ),
    { appearanceBehavior: "system", contrast: "medium", workbenchStyle: "material" }
  );
});

test("reuses matching current values when following system appearance", async () => {
  const quickPickValues = [
    quickPickChoice("system"),
    quickPickChoice("medium"),
    quickPickChoice("material"),
  ];
  assert.deepEqual(
    await collectGuidedThemeSelections(
      guidedThemeConfigurationSnapshot,
      createConfigurationUiHost({ quickPickValues })
    ),
    { appearanceBehavior: "system", contrast: "medium", workbenchStyle: "material" }
  );
});

test("handles Off and System automatic selections without input prompts", async () => {
  for (const switchingMode of ["off", "system"]) {
    assert.deepEqual(
      await collectAutomaticSwitchingSelection(
        "schedule",
        guidedThemeConfigurationSnapshot.themeSchedule,
        createConfigurationUiHost({ quickPickValues: [quickPickChoice(switchingMode)] })
      ),
      { switchingMode }
    );
  }
});

test("uses default schedule times when no schedule boundaries are configured", async () => {
  const configurationUiHost = createConfigurationUiHost({
    quickPickValues: ["schedule"],
    inputValues: ["08:00", "21:00"],
  });

  assert.deepEqual(await collectAutomaticSwitchingSelection("off", [], configurationUiHost), {
    switchingMode: "schedule",
    themeSchedule: [
      { time: "08:00", theme: "Everforest Complete Light" },
      { time: "21:00", theme: "Everforest Complete Dark" },
    ],
  });
  assert.deepEqual(
    configurationUiHost.inputOptions.map(
      ({ title, prompt, placeHolder, value, ignoreFocusOut }) => ({
        title,
        prompt,
        placeHolder,
        value,
        ignoreFocusOut,
      })
    ),
    [
      {
        title: "Automatic Schedule · 1 of 2",
        prompt: "When should Light begin?",
        placeHolder: "07:00",
        value: "07:00",
        ignoreFocusOut: true,
      },
      {
        title: "Automatic Schedule · 2 of 2",
        prompt: "When should Dark begin? Selecting Enter applies the schedule.",
        placeHolder: "19:00",
        value: "19:00",
        ignoreFocusOut: true,
      },
    ]
  );
});

test("returns no automatic selection when the mode or either schedule input is cancelled", async () => {
  assert.equal(
    await collectAutomaticSwitchingSelection(
      "off",
      guidedThemeConfigurationSnapshot.themeSchedule,
      createConfigurationUiHost()
    ),
    undefined
  );
  assert.equal(
    await collectAutomaticSwitchingSelection(
      "off",
      guidedThemeConfigurationSnapshot.themeSchedule,
      createConfigurationUiHost({ quickPickValues: [quickPickChoice("schedule")] })
    ),
    undefined
  );
  assert.equal(
    await collectAutomaticSwitchingSelection(
      "off",
      guidedThemeConfigurationSnapshot.themeSchedule,
      createConfigurationUiHost({
        quickPickValues: [quickPickChoice("schedule")],
        inputValues: ["06:00"],
      })
    ),
    undefined
  );
});

test("collects an exact two-boundary automatic schedule", async () => {
  const configurationUiHost = createConfigurationUiHost({
    quickPickValues: [quickPickChoice("schedule")],
    inputValues: ["06:00", "20:00"],
  });
  assert.deepEqual(
    await collectAutomaticSwitchingSelection(
      "off",
      guidedThemeConfigurationSnapshot.themeSchedule,
      configurationUiHost
    ),
    {
      switchingMode: "schedule",
      themeSchedule: [
        { time: "06:00", theme: "Everforest Complete Light" },
        { time: "20:00", theme: "Everforest Complete Dark" },
      ],
    }
  );
  assert.deepEqual(configurationUiHost.quickPickCalls[0].items, [
    {
      label: "$(check) Off",
      description: "Current · Keep the current theme",
      configurationValue: "off",
    },
    {
      label: "Follow System",
      description: "Match macOS, Windows, or Linux",
      configurationValue: "system",
    },
    {
      label: "Follow Schedule",
      description: "07:00 Light · 19:00 Dark",
      configurationValue: "schedule",
    },
  ]);
  assert.deepEqual(configurationUiHost.quickPickCalls[0].options, {
    title: "Everforest Complete · Automatic Light/Dark",
    placeHolder: "Choose Off, System, or a local schedule.",
    ignoreFocusOut: true,
  });
  assert.equal(
    configurationUiHost.inputOptions[0].validateInput("6:00"),
    "Use local 24-hour time: HH:MM"
  );
  assert.equal(configurationUiHost.inputOptions[0].validateInput("06:00"), undefined);
  assert.equal(
    configurationUiHost.inputOptions[1].validateInput("25:00"),
    "Use local 24-hour time: HH:MM"
  );
  assert.equal(
    configurationUiHost.inputOptions[1].validateInput("06:00"),
    "Light and Dark start times must differ"
  );
  assert.equal(configurationUiHost.inputOptions[1].validateInput("20:00"), undefined);
});

const advancedThemeConfiguration = {
  darkCursor: "white",
  lightCursor: "black",
  darkSelection: "grey",
  lightSelection: "grey",
  italicKeywords: false,
  italicComments: true,
  diagnosticTextBackgroundOpacity: "0%",
  highContrast: false,
};

test("cancels advanced controls at the menu or control choice", async () => {
  assert.equal(
    await collectAdvancedThemeConfiguration(
      advancedThemeConfiguration,
      createConfigurationUiHost()
    ),
    undefined
  );
  assert.equal(
    await collectAdvancedThemeConfiguration(
      advancedThemeConfiguration,
      createConfigurationUiHost({ quickPickValues: [quickPickChoice("darkCursor")] })
    ),
    undefined
  );
});

test("cancels every advanced control choice without applying staged changes", async () => {
  for (const controlIdentifier of [
    "lightCursor",
    "lightSelection",
    "italicComments",
    "diagnosticTextBackgroundOpacity",
  ]) {
    assert.equal(
      await collectAdvancedThemeConfiguration(
        advancedThemeConfiguration,
        createConfigurationUiHost({ quickPickValues: [quickPickChoice(controlIdentifier)] })
      ),
      undefined,
      `${controlIdentifier} cancellation must discard staged changes`
    );
  }
});

test("stages multiple advanced controls before applying them", async () => {
  const configurationUiHost = createConfigurationUiHost({
    quickPickValues: ["darkCursor", "aqua", "lightCursor", "red", "apply"],
  });
  const appliedConfiguration = await collectAdvancedThemeConfiguration(
    advancedThemeConfiguration,
    configurationUiHost
  );
  assert.deepEqual(appliedConfiguration, {
    ...advancedThemeConfiguration,
    darkCursor: "aqua",
    lightCursor: "red",
  });
  assert.deepEqual(
    configurationUiHost.quickPickCalls.map(({ items }) =>
      items.map((item) => item.action ?? item.configurationValue)
    ),
    [
      [
        "apply",
        "darkCursor",
        "lightCursor",
        "darkSelection",
        "lightSelection",
        "italicKeywords",
        "italicComments",
        "diagnosticTextBackgroundOpacity",
        "highContrast",
      ],
      ["white", "red", "orange", "yellow", "green", "aqua", "blue", "purple"],
      [
        "apply",
        "darkCursor",
        "lightCursor",
        "darkSelection",
        "lightSelection",
        "italicKeywords",
        "italicComments",
        "diagnosticTextBackgroundOpacity",
        "highContrast",
      ],
      ["black", "red", "orange", "yellow", "green", "aqua", "blue", "purple"],
      [
        "apply",
        "darkCursor",
        "lightCursor",
        "darkSelection",
        "lightSelection",
        "italicKeywords",
        "italicComments",
        "diagnosticTextBackgroundOpacity",
        "highContrast",
      ],
    ]
  );
  assert.deepEqual(
    configurationUiHost.quickPickCalls
      .filter(({ items }) => items[0]?.action === "apply")
      .map(({ items }) => items[0].description),
    ["No staged changes", "1 staged change", "2 staged changes"]
  );
  assert.deepEqual(
    configurationUiHost.quickPickCalls
      .filter(({ items }) => items[0]?.action !== "apply")
      .map(({ items }) => items[0]),
    [
      {
        label: "$(check) White",
        description: "Current",
        configurationValue: "white",
      },
      {
        label: "$(check) Black",
        description: "Current",
        configurationValue: "black",
      },
    ]
  );
});

test("applies advanced controls only after the explicit Apply choice", async () => {
  assert.deepEqual(
    await collectAdvancedThemeConfiguration(
      advancedThemeConfiguration,
      createConfigurationUiHost({ quickPickValues: [quickPickChoice("apply")] })
    ),
    advancedThemeConfiguration
  );
});

test("collects every advanced control through the injectable host", async () => {
  const controlChoices = [
    ["darkCursor", "aqua", "darkCursor", "aqua"],
    ["lightCursor", "red", "lightCursor", "red"],
    ["darkSelection", "blue", "darkSelection", "blue"],
    ["lightSelection", "orange", "lightSelection", "orange"],
    ["italicKeywords", true, "italicKeywords", true],
    ["italicComments", false, "italicComments", false],
    ["diagnosticTextBackgroundOpacity", "25%", "diagnosticTextBackgroundOpacity", "25%"],
    ["highContrast", true, "highContrast", true],
  ];
  for (const [controlIdentifier, controlValue, expectedKey, expectedValue] of controlChoices) {
    const updatedConfiguration = await collectAdvancedThemeConfiguration(
      advancedThemeConfiguration,
      createConfigurationUiHost({
        quickPickValues: [
          quickPickChoice(controlIdentifier),
          quickPickChoice(controlValue),
          quickPickChoice("apply"),
        ],
      })
    );
    assert.equal(updatedConfiguration[expectedKey], expectedValue);
  }
});
