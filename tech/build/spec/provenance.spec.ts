import {test, expect} from "bun:test"
import {writeFileSync} from "node:fs"
import {join} from "node:path"
import {createPackageBuilder} from "@metafor/tech-build"
import {buildFixture} from "./fixture"

const assignment = (root: string) => ({
  roots: [root],
  excludedDirectoryNames: ["dist", "node_modules"],
})

test("direct CLI build confirms Bun inputs and the assigned source inventory", async () => {
  const fixture = await buildFixture(join(import.meta.dir, "fixture/single"))
  try {
    const builder = createPackageBuilder({
      resolvePackage: () => fixture.root,
      provenance: assignment(fixture.root),
    })
    const checked = await builder.sourceInventory()
    const result = await builder.buildPackage(fixture.name)
    expect(result.success, result.stderr).toBe(true)
    expect(result.provenance?.kind).toBe("bounded-source-inventory")
    expect(result.provenance?.inventorySha256).toBe(checked.sha256)
    expect(result.provenance?.compilerInputs.some(({path}) => path.endsWith("/main/index.ts"))).toBe(true)
    expect(result.provenance?.bun.version).toBe(Bun.version)
    expect((await builder.sourceInventory()).sha256).toBe(checked.sha256)
    await builder.verifyProvenance(
      fixture.name,
      {env: "main", version: "1.0.0"},
      result.provenance!,
      checked.sha256,
    )
    await expect(builder.verifyProvenance(
      fixture.name,
      {env: "main", version: "1.0.0"},
      {...result.provenance!, buildPlanSha256: "0".repeat(64)},
      checked.sha256,
    )).rejects.toThrow("plan differs")
  } finally {
    await fixture.cleanup()
  }
})

test("plugin build confirms actual compiler inputs and plugin/config bytes", async () => {
  const fixture = await buildFixture(join(import.meta.dir, "fixture/plugin"))
  try {
    const builder = createPackageBuilder({
      resolvePackage: () => fixture.root,
      provenance: {...assignment(fixture.root), roots: [fixture.root, join(import.meta.dir, "..")]},
    })
    const result = await builder.buildPackage(fixture.name)
    expect(result.success, result.stderr).toBe(true)
    const inputs = result.provenance?.compilerInputs.map(({path}) => path) ?? []
    expect(inputs.some((path) => path.endsWith("/build/plugin.ts"))).toBe(true)
    expect(inputs.some((path) => path.endsWith("/bunfig.toml"))).toBe(true)
    expect(inputs.some((path) => path.endsWith("/main/index.ts"))).toBe(true)
    expect(result.provenance?.adapter?.path.endsWith("/tech/build/adapter.ts")).toBe(true)
  } finally {
    await fixture.cleanup()
  }
})

test("host adapter path must resolve to an existing absolute file", async () => {
  const fixture = await buildFixture(join(import.meta.dir, "fixture/plugin"))
  try {
    const builder = createPackageBuilder({
      resolvePackage: () => fixture.root,
      provenance: assignment(fixture.root),
      adapterEntrypoint: async () => join(fixture.root, "missing-adapter.js"),
    })
    const result = await builder.buildPackage(fixture.name)
    expect(result.success).toBe(false)
    expect(result.stage).toBe("configuration")
    expect(result.stderr).toContain("Package build adapter is missing")
  } finally {
    await fixture.cleanup()
  }
})

test("host adapter is attested separately from the source inventory", async () => {
  const fixture = await buildFixture(join(import.meta.dir, "fixture/plugin"))
  try {
    const adapter = join(import.meta.dir, "../adapter.ts")
    const builder = createPackageBuilder({
      resolvePackage: () => fixture.root,
      provenance: assignment(fixture.root),
      adapterEntrypoint: async () => adapter,
    })
    const before = await builder.sourceInventory()
    const result = await builder.buildPackage(fixture.name)
    expect(result.success, result.stderr).toBe(true)
    expect(result.provenance?.adapter?.path).toBe(adapter)
    await builder.verifyProvenance(
      fixture.name,
      {env: "main", version: "1.0.0"},
      result.provenance!,
      before.sha256,
    )
  } finally {
    await fixture.cleanup()
  }
})

test("source edit during compiler process rejects an otherwise successful output", async () => {
  const fixture = await buildFixture(join(import.meta.dir, "fixture/single"))
  try {
    const spawn = ((command: string[], options: Parameters<typeof Bun.spawn>[1]) => {
      const child = Bun.spawn(command, options)
      if (!command.includes("--silent")) {
        writeFileSync(join(fixture.root, "main/index.ts"), "export const editedDuringBuild = true\n")
      }
      return child
    }) as typeof Bun.spawn
    const builder = createPackageBuilder({
      resolvePackage: () => fixture.root,
      provenance: assignment(fixture.root),
      spawn,
    })
    const result = await builder.buildPackage(fixture.name)
    expect(result.success).toBe(false)
    expect(result.stage).toBe("inputs")
    expect(result.stderr).toContain("source inventory changed during preparation")
    expect(result.provenance).toBeUndefined()
  } finally {
    await fixture.cleanup()
  }
})

test("compiler input omitted by host inventory is rejected", async () => {
  const fixture = await buildFixture(join(import.meta.dir, "fixture/single"))
  try {
    const builder = createPackageBuilder({
      resolvePackage: () => fixture.root,
      provenance: {
        roots: [fixture.root],
        excludedDirectoryNames: ["dist", "node_modules", "main"],
      },
    })
    const result = await builder.buildPackage(fixture.name)
    expect(result.success).toBe(false)
    expect(result.stage).toBe("inputs")
    expect(result.stderr).toContain("outside assigned source inventory")
  } finally {
    await fixture.cleanup()
  }
})
