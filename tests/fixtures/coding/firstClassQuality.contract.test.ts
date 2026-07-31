import { describe, expect, it } from "vitest"
import { normalizeCodingLanguage } from "../../../src/features/coding/language"
import { validateFirstClassCode } from "../../../electron/orchestrator/codingPolicy"

const fixtures = [
  { language: "python3", solve: "def two_sum(nums, target):", debug: "IndexError", syntax: /^def / },
  { language: "typescript", solve: "function twoSum(nums: number[]): number[]", debug: "TypeError", syntax: /^function / },
  { language: "java", solve: "class Solution {", debug: "NullPointerException", syntax: /^class / },
  { language: "go", solve: "func twoSum(nums []int) []int {", debug: "index out of range", syntax: /^func / },
  { language: "cpp", solve: "vector<int> twoSum(vector<int>& nums) {", debug: "segmentation fault", syntax: /^vector/ },
  { language: "csharp", solve: "public int[] TwoSum(int[] nums) {", debug: "NullReferenceException", syntax: /^public / }
] as const

describe("first-class Coding quality matrix", () => {
  it.each(fixtures)("$language solve/syntax/debug contract", (fixture) => {
    expect(normalizeCodingLanguage(fixture.language).quality).toBe("first-class")
    expect(fixture.solve).toMatch(fixture.syntax)
    expect(validateFirstClassCode(fixture.language, fixture.solve)).toEqual([])
    expect(validateFirstClassCode(fixture.language, "plain prose")).not.toEqual(
      []
    )
    expect(fixture.debug.length).toBeGreaterThan(3)
  })
})
