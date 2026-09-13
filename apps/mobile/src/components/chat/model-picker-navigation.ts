export function navigateModelPickerBack(
  activeSection: string | undefined,
  collapseAdvancedSection: () => void,
  returnToCompactPower: () => void,
) {
  if (activeSection) {
    collapseAdvancedSection();
    return;
  }

  returnToCompactPower();
}
