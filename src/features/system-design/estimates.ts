import type { MaterialCalculation } from "./types"

export function validateMaterialCalculations(
  calculations: readonly MaterialCalculation[]
): readonly string[] {
  const errors: string[] = []
  if (calculations.length < 2 || calculations.length > 4) {
    errors.push("Estimate requires 2-4 material calculations")
  }
  for (const calculation of calculations) {
    if (
      calculation.name.trim().length === 0 ||
      calculation.expression.trim().length === 0 ||
      !Number.isFinite(calculation.result) ||
      calculation.unit.trim().length === 0 ||
      calculation.assumption.trim().length === 0
    ) {
      errors.push(`Incomplete calculation: ${calculation.name}`)
    }
  }
  return errors
}
