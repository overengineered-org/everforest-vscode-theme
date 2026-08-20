from dataclasses import dataclass


@dataclass(frozen=True)
class ThemePreference:
    appearance: str
    contrast: float


def describe_theme(preference: ThemePreference) -> str:
    return f"{preference.appearance}: {max(preference.contrast, 4.5):.1f}"
