package dev.everforest;

public record ThemePreference(String mode, double contrast) {
    public double readableContrast() {
        return Math.max(contrast, 4.5);
    }
}
