#[derive(Debug)]
struct ThemePreference<'a> {
    appearance: &'a str,
    contrast: f32,
}

fn describe_theme(preference: &ThemePreference<'_>) -> String {
    format!("{}: {:.1}", preference.appearance, preference.contrast.max(4.5))
}
