enum ThemeMode {
    case light
    case dark
}

struct ThemePreference {
    let mode: ThemeMode
    let contrast: Double

    func readableContrast(minimum: Double = 4.5) -> Double {
        max(contrast, minimum)
    }
}
