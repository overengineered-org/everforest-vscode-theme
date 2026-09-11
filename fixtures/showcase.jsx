const minimumContrast = 4.5;

export function ThemeCard({ mode, contrast }) {
  return (
    <article className="theme-card" data-mode={mode}>
      <strong>{mode}</strong>: {Math.max(contrast, minimumContrast)}
    </article>
  );
}
