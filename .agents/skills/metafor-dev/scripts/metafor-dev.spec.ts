import { describe, expect, test } from "bun:test"

import { buildImpact, validateSkill } from "./metafor-dev.mjs"

describe("MetaFor Dev contour", () => {
  test("maps Force changes to focused tests and the Inflaton live scenario", () => {
    const impact = buildImpact(["force/server.ts", "types/force/particle.ts"])

    expect(impact.ok).toBe(true)
    expect(impact.areas).toEqual(["force-contract"])
    expect(impact.automated).toContain("bun test force")
    expect(impact.live).toEqual(["inflaton-add"])
    expect(impact.skillSurfaces).toContain("current milestone")
  })

  test("maps Bulk changes to visual acceptance", () => {
    const impact = buildImpact(["bulk/projection.ts", "pkg/ui/elements/div.ts", "ui/elements/div.ts"])

    expect(impact.ok).toBe(true)
    expect(impact.areas).toEqual(["bulk-manifestation"])
    expect(impact.automated).toContain("bun test ./pkg/ui")
    expect(impact.live).toEqual(["bulk-baseline"])
    expect(impact.skillSurfaces).toContain("visual acceptance")
  })

  test("maps the project generator and root working documentation", () => {
    const impact = buildImpact(["types/package.json", "create-metafor/src/cli.ts", "TODO_FORCE_BULK.md"])

    expect(impact.ok).toBe(true)
    expect(impact.areas).toEqual(["types-contract", "project-generator", "project-documentation"])
    expect(impact.automated).toContain("bun test ./create-metafor")
    expect(impact.skillSurfaces).toContain("runtime when the generated project contract changes")
  })

  test("refuses to hide an unmapped project surface", () => {
    const impact = buildImpact(["unknown/new-runtime.ts"])

    expect(impact.ok).toBe(false)
    expect(impact.unmappedPaths).toEqual(["unknown/new-runtime.ts"])
  })

  test("validates the repository-local skill contour", () => {
    expect(validateSkill()).toMatchObject({ ok: true, errors: [] })
  })
})
