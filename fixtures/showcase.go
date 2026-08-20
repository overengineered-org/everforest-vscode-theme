package showcase

import "fmt"

type ThemePreference struct {
	Appearance string
	Contrast   float64
}

func DescribeTheme(preference ThemePreference) string {
	return fmt.Sprintf("%s: %.1f", preference.Appearance, preference.Contrast)
}
