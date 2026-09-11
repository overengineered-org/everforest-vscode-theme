#include <stdio.h>

typedef struct {
  const char *name;
  double contrast;
} ThemePreference;

int main(void) {
  ThemePreference theme = {"dark", 4.5};
  printf("%s %.1f\n", theme.name, theme.contrast);
  return 0;
}
