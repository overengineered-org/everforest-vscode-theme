#include <algorithm>
#include <string>

namespace everforest {
struct ThemePreference {
  std::string mode;
  double contrast;
};

double readableContrast(const ThemePreference &preference) {
  return std::max(preference.contrast, 4.5);
}
}  // namespace everforest
