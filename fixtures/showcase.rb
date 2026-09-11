ThemePreference = Data.define(:mode, :contrast) do
  MINIMUM_CONTRAST = 4.5

  def readable_contrast
    [contrast, MINIMUM_CONTRAST].max
  end
end
