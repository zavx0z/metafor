import { describe, expect, test } from "bun:test"

import {
  buildImpact,
  buildInflatonAddMessage,
  buildInflatonRemoveMessage,
  buildInflatonTestMessage,
  canonicalWimpSource,
  parseDarkHistoryReadArgs,
  resolveMetaReadSource,
  universeResetPaths,
  validateSkill,
} from "./metafor-dev.mjs"
import { classifyWorldOwner, interpreterProcessMatchesService } from "./world-owner.mjs"

describe("MetaFor Dev contour", () => {
  test("distinguishes every runtime process owner without an ambiguous boolean", () => {
    expect(classifyWorldOwner({metaforDevOwned: true})).toBe("metafor-dev")
    expect(classifyWorldOwner({interpreterServices: ["force", "dark"]})).toBe("interpreter")
    expect(classifyWorldOwner({healthyServices: ["force"]})).toBe("external")
    expect(classifyWorldOwner({})).toBe("none")
  })

  test("treats mixed Interpreter and unknown listeners as external", () => {
    expect(classifyWorldOwner({
      interpreterServices: ["force"],
      healthyServices: ["force", "dark"],
    })).toBe("external")
  })

  test("recognizes Interpreter modules from the Bun command when modulePath is absent", () => {
    const repositoryRoot = "/workspace/metafor"
    const service = {name: "force", modulePath: "force/server.ts"}
    const processState = {
      id: "force",
      modulePath: null,
      target: {
        state: "running",
        cwd: repositoryRoot,
        command: ["bun", "--inspect=ws://127.0.0.1:6717/", "--hot", "force/server.ts"],
      },
    }

    expect(interpreterProcessMatchesService({processState, service, repositoryRoot})).toBe(true)
    expect(interpreterProcessMatchesService({
      processState: {...processState, target: {...processState.target, command: ["bun", "dark/server.ts"]}},
      service,
      repositoryRoot,
    })).toBe(false)
  })

  test("keeps an explicit mismatched Interpreter modulePath external", () => {
    const repositoryRoot = "/workspace/metafor"
    const service = {name: "force", modulePath: "force/server.ts"}
    const processState = {
      id: "force",
      modulePath: "dark/server.ts",
      target: {
        state: "running",
        cwd: repositoryRoot,
        command: ["bun", "force/server.ts"],
      },
    }

    expect(interpreterProcessMatchesService({processState, service, repositoryRoot})).toBe(false)
  })

  test("maps Force transport and relay changes to focused tests and live stories", () => {
    const impact = buildImpact(["force/server.ts", "types/force/particle.ts"])

    expect(impact.ok).toBe(true)
    expect(impact.areas).toEqual(["force-contract"])
    expect(impact.automated).toContain("bun test force")
    expect(impact.live).toEqual(["inflaton-add", "meta-read"])
    expect(impact.skillSurfaces).toContain("current milestone")
  })

  test("maps shared transport and protocol to every affected live boundary", () => {
    const impact = buildImpact(["shared/transport/force/server.ts", "shared/protocol/monad/rpc.ts"])

    expect(impact.ok).toBe(true)
    expect(impact.areas).toEqual(["shared-contract"])
    expect(impact.automated).toContain("bun test shared")
    expect(impact.live).toEqual(["inflaton-add", "meta-read", "bulk-baseline"])
    expect(impact.skillSurfaces).toContain("module boundaries")
  })

  test("maps Boundary to its exact directory without matching ignored Cluster repositories", () => {
    const impact = buildImpact(["boundary/incremental.ts"])

    expect(impact.ok).toBe(true)
    expect(impact.areas).toEqual(["boundary-projection"])
    expect(impact.automated).toContain("bun test ./boundary")
    expect(impact.automated).not.toContain("bun test boundary")
  })

  test("maps the Energy cold-start integration proof to the Energy runtime", () => {
    const impact = buildImpact(["energy.cold-start.spec.ts"])

    expect(impact.ok).toBe(true)
    expect(impact.areas).toEqual(["energy-runtime"])
    expect(impact.automated).toContain("bun test energy")
    expect(impact.unmappedPaths).toEqual([])
  })

  test("maps the Field entanglement cold-start proof across Boundary and Matrix", () => {
    const impact = buildImpact(["field-entanglement.cold-start.spec.ts"])

    expect(impact.ok).toBe(true)
    expect(impact.areas).toEqual(["field-entanglement-integration"])
    expect(impact.automated).toEqual(["bun test ./boundary", "bun test matrix", "bun run typecheck"])
    expect(impact.live).toEqual(["inflaton-add", "bulk-baseline"])
    expect(impact.unmappedPaths).toEqual([])
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

  test("maps the root DSL and strict type suites to the types contract", () => {
    const impact = buildImpact([
      "metafor.ts",
      "matter.spec.ts",
      "process.ts",
      "tests/fields/typing.spec.ts",
      "tests/types/processes.typing.spec.ts",
    ])

    expect(impact.ok).toBe(true)
    expect(impact.areas).toEqual(["types-contract"])
    expect(impact.automated).toEqual([
      "bun run typecheck",
      "bun run typecheck:expect-errors",
      "bun test ./action.spec.ts ./finally.spec.ts ./matter.spec.ts ./process.spec.ts ./reactions.spec.ts ./tests/fields ./tests/types",
    ])
    expect(impact.unmappedPaths).toEqual([])
  })

  test("maps the physical Cluster boundary without treating it as a workspace", () => {
    const impact = buildImpact([".gitignore", "legacy/.gitkeep", "tsconfig.json"])

    expect(impact.ok).toBe(true)
    expect(impact.areas).toEqual(["source-cluster", "workspace-contract"])
    expect(impact.live).toEqual(["meta-read", "bulk-baseline"])
    expect(impact.skillSurfaces).toContain("runtime")
  })

  test("maps static Matter src validation to template tests and Meta read", () => {
    const impact = buildImpact(["pkg/template/node/meta.ts"])

    expect(impact.ok).toBe(true)
    expect(impact.areas).toEqual(["matter-template"])
    expect(impact.automated).toEqual(["bun test ./pkg/template", "bun run typecheck"])
    expect(impact.live).toEqual(["meta-read"])
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
    expect(buildInflatonAddMessage(43, "capsule-43")).toEqual({
      parts: [{part: "inflaton", op: "add", path: "wimp", ts: 43, value: {src: "capsule-43", name: "Capsule"}}],
    })
  })

  test("builds the root Meta read trigger without a terminal marker payload", () => {
    expect(buildInflatonTestMessage("owner/root", 43)).toEqual({
      parts: [{part: "inflaton", op: "test", path: "owner/root", ts: 43}],
    })
  })

  test("builds the root Boundary cleanup with the existing Inflaton remove protocol", () => {
    expect(buildInflatonRemoveMessage("zavx0z/capsule", 44)).toEqual({
      parts: [{part: "inflaton", op: "remove", path: "wimp", ts: 44, value: {src: "zavx0z/capsule"}}],
    })
  })

  test("builds a Dark history request in parallel time-step coordinates", () => {
    expect(parseDarkHistoryReadArgs([
      "--from-ts", "42",
      "--to-ts", "84",
      "--limit-steps", "3",
    ])).toEqual({fromTs: 42, toTs: 84, limitSteps: 3})
    expect(() => parseDarkHistoryReadArgs(["--limit-steps", "0"])).toThrow("greater than zero")
    expect(() => parseDarkHistoryReadArgs(["--from-ts", "84", "--to-ts", "42"]))
      .toThrow("greater than or equal")
  })

  test("limits universe reset to the exact persistent files owned by the dev contour", () => {
    expect(universeResetPaths().map((path) => path.slice(path.lastIndexOf("/.metafor/")))).toEqual([
      "/.metafor/dev.sqlite",
      "/.metafor/dev.sqlite-shm",
      "/.metafor/dev.sqlite-wal",
      "/.metafor/dark-history.jsonl",
    ])
  })

  test("accepts only root Atom and internal Atom WIMP sources", () => {
    expect(canonicalWimpSource("zavx0z/capsule")).toBe(true)
    expect(canonicalWimpSource("zavx0z/capsule/profile")).toBe(true)
    expect(canonicalWimpSource("capsule")).toBe(false)
    expect(canonicalWimpSource("zavx0z/capsule/profile/nested")).toBe(false)
    expect(canonicalWimpSource("zavx0z/capsule/../profile")).toBe(false)
  })

  test("reads every WIMP from the one physical Cluster root", () => {
    const ordinary = resolveMetaReadSource("zavx0z/capsule")

    expect(ordinary.modulePath.endsWith("/cluster/zavx0z/capsule/meta.ts")).toBe(true)
  })
})
