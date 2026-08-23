import {describe, expect, test} from "bun:test"
import {
  bulkVisualFieldSourceAddress,
  changedBulkVisualQuantumMaterialIds,
  changedBulkVisualShapeIds,
  indexBulkVisualFieldAliases,
} from "./visual-projection.ts"

describe("Bulk viewport Visual sidecars", () => {
  test("does not rebuild unchanged shapes and catches every shape delta", () => {
    const current = new Map([
      ["stable", {radius: 4, tube: 2}],
      ["changed", {radius: 5, tube: 2}],
      ["removed", {radius: 6, tube: 2}],
    ])
    const next = new Map([
      ["stable", {radius: 4, tube: 2}],
      ["changed", {radius: 7, tube: 2}],
      ["added", {radius: 8, tube: 2}],
    ])

    expect([...changedBulkVisualShapeIds(
      current,
      next,
      (left, right) =>
        left.radius === right.radius && left.tube === right.tube,
    )].sort()).toEqual(["added", "changed", "removed"])
  })

  test("refreshes a Field proxy when only its package material changes", () => {
    const material = {
      color: [1, 0.08, 0.58] as const,
      form: "sphere" as const,
      glowIntensity: 3.4,
      highlightSize: 1,
      kind: "quantum" as const,
      opacity: 0.66,
    }
    const current = new Map([
      ["stable", material],
      ["material-only", material],
    ])
    const next = new Map([
      ["stable", {...material, color: [...material.color] as const}],
      ["material-only", {
        ...material,
        glowIntensity: 5.2,
        opacity: 0.78,
      }],
    ])

    expect([...changedBulkVisualQuantumMaterialIds(current, next)])
      .toEqual(["material-only"])
  })

  test("keeps synthetic markers behind exact canonical source addresses", () => {
    const aliases = indexBulkVisualFieldAliases([
      {
        sourceFieldId: 7,
        sourceFieldParticleId: "atom/11/field/7",
        sourceParentDarkParticleId: 22,
        visualFieldParticleId: "visual:centered-nested:field:shared",
      },
      {
        sourceFieldId: 9,
        sourceFieldParticleId: "atom/12/field/9",
        sourceParentDarkParticleId: 24,
        visualFieldParticleId: "visual:centered-nested:field:shared",
      },
    ])

    expect(aliases.get(bulkVisualFieldSourceAddress(22, 7)))
      .toBe("visual:centered-nested:field:shared")
    expect(aliases.get(bulkVisualFieldSourceAddress(24, 9)))
      .toBe("visual:centered-nested:field:shared")
  })

  test("rejects ambiguous canonical source addresses", () => {
    expect(() => indexBulkVisualFieldAliases([
      {
        sourceFieldId: 7,
        sourceFieldParticleId: "first",
        sourceParentDarkParticleId: 22,
        visualFieldParticleId: "visual:first",
      },
      {
        sourceFieldId: 7,
        sourceFieldParticleId: "second",
        sourceParentDarkParticleId: 22,
        visualFieldParticleId: "visual:second",
      },
    ])).toThrow("source address 22:7 is duplicated")
  })
})
