process.env.VERIFY_GENERATED_THEMES = "1";
const { generateThemes } = await import("../dist/generate-themes.js");
generateThemes();
