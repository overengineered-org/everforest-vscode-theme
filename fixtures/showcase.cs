namespace Everforest;

public enum ThemeMode { Light, Dark }

public sealed record ThemePreference(ThemeMode Mode, double Contrast)
{
    public double ReadableContrast => Math.Max(Contrast, 4.5);
}
