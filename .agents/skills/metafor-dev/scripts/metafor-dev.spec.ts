import { describe, expect, test } from "bun:test"

import { buildImpact, buildInflatonAddMessage, buildInflatonTestMessage, validateSkill } from "./metafor-dev.mjs"

describe("MetaFor Dev contour", () => {
  test("maps Force changes to focused tests and the Inflaton live scenario", () => {
    const impact = buildImpact(["force/server.ts", "types/force/particle.ts"])

    expect(impact.ok).toBe(true)
    expect(impact.areas).toEqual(["force-contract"])
    expect(impact.automated).toContain("bun test force")
    expect(impact.live).toEqual(["inflaton-add", "meta-read"])
    expect(impact.skillSurfaces).toContain("current milestone")
  })

  test("maps Bulk changes to visual acceptance", () => {
    const impact = buildImpact(["bulk/projection.ts", "pkg/ui/elements/div.ts", "ui/elements/div.ts"])

    expect(impact.ok).toBe(true)
    expect(impact.areas).toEqual(["bulk-manifestation"])
    expect(impact.automated).toContain("bun test ./pkg/ui")
    expect(impact.live).toEqual(["bulk-baseline", "inflaton-add"])
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

  test("builds the one trusted external Particle without caller-supplied by", () => {
    expect(buildInflatonAddMessage(42)).toEqual({
      parts: [{part: "inflaton", op: "add", path: "wimp", ts: 42, value: {src: "capsule", name: "Capsule"}}],
    })
  })

  test("builds the root Meta read trigger without a terminal marker payload", () => {
    expect(buildInflatonTestMessage("owner/root", 43)).toEqual({
      parts: [{part: "inflaton", op: "test", path: "owner/root", ts: 43}],
    })
  })
})
