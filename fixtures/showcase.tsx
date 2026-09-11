type ThemeMode = "light" | "dark";

interface ThemeCardProps {
  mode: ThemeMode;
  contrast: number;
}

export function ThemeCard({ mode, contrast }: ThemeCardProps) {
  return <article data-mode={mode}>{Math.max(contrast, 4.5)}</article>;
}
