import {describe, expect, test} from "bun:test"
import {mkdtempSync, readFileSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import type {BulkManifest} from "@metafor/types/bulk/manifest"
import {visualContextTorusMaterial} from "@metafor/visual"
import {
  describeVisualPreparedScene,
  VISUAL_PAYLOAD_CURVE_LAW,
  type VisualScenePayload,
} from "@metafor/visual/payload"
import {hydrateBulkVisualStore} from "./visual-store.ts"

const manifest = (label = "root"): BulkManifest => ({
  rootSrc: "owner/root",
  darkParticles: [{
    activity: "neutral",
    darkParticleId: 2,
    darkParticleKind: "atom",
    darkParticleOrder: 0,
    depth: 0,
    label,
    metaSrc: "owner/root",
    parentDarkParticleId: null,
    src: "owner/root",
  }],
  fieldParticles: [],
})

const payload = (localX = 0): VisualScenePayload => ({
  curveLaw: VISUAL_PAYLOAD_CURVE_LAW,
  darkTorusMeshDetail: {radialSegments: 64, tubularSegments: 192},
  embeddedTorusMeshDetail: {radialSegments: 32, tubularSegments: 192},
  fieldAliases: [],
  fieldProxies: [],
  fields: [],
  kind: "visual-scene-payload",
  layoutSlug: "centered-nested",
  orbitals: [],
  relationBatches: [],
  sphereMeshDetail: {heightSegments: 24, widthSegments: 32},
  stats: {
    darkParticleCount: 1,
    fieldParticleCount: 0,
    orbitalParticleCount: 0,
    relationChannelCount: 0,
    rootSrc: "owner/root",
    transitionChannelCount: 0,
  },
  tori: [{
    color: [0.2, 0.4, 0.8],
    darkParticleId: 2,
    darkParticleKind: "atom",
    depth: 0,
    label: "root",
    localX,
    localY: 0,
    localZ: 0,
    material: visualContextTorusMaterial([0.2, 0.4, 0.8]),
    parentDarkParticleId: null,
    radius: 50,
    src: "owner/root",
    tube: 12.5,
  }],
  transitionBatches: [],
})

const store = () => hydrateBulkVisualStore(
  describeVisualPreparedScene(payload()),
  {
    placement: {currentState: false, fieldValue: true},
    slug: "centered-nested",
  },
)

describe("legacy Bulk visual test oracle", () => {
  test("depends only on stateless Visual helpers, not layout or Engine", () => {
    const directory = mkdtempSync(join(tmpdir(), "metafor-bulk-visual-store-"))
    const output = join(directory, "oracle.js")
    const result = Bun.spawnSync([
      process.execPath,
      "build",
      new URL("./visual-store.ts", import.meta.url).pathname,
      "--target=browser",
      "--minify",
      "--outfile",
      output,
    ])
    expect(result.exitCode).toBe(0)
    const javascript = readFileSync(output, "utf8")
    rmSync(directory, {force: true, recursive: true})

    expect(javascript).not.toContain("outside-in")
    expect(javascript).not.toContain("centered-nested")
    expect(javascript).not.toContain("defineVisualLayout")
    expect(javascript).not.toContain("ThinFilmMaterial")
    expect(javascript).not.toContain("Renderer")
  })

  test("hydrates the exact prepared payload", () => {
    const hydrated = store()
    expect(hydrated.layoutSlug).toBe("centered-nested")
    expect(hydrated.payload.tori).toHaveLength(1)
    expect(hydrated.describe().payload).toBe(hydrated.payload)
  })

  test("repaints appearance without running a layout", () => {
    const hydrated = store()
    const applied = hydrated.apply({
      affectedAtomIds: [1],
      changed: true,
      facet: "appearance",
      structural: false,
    }, manifest("renamed"))

    expect(applied.kind).toBe("visual-store-applied")
    if (applied.kind !== "visual-store-applied") throw new Error("refused")
    expect(applied.scope).toBe("appearance")
    expect(applied.patch.kind).toBe("visual-delta-patch")
    if (applied.patch.kind !== "visual-delta-patch") throw new Error("no delta")
    expect(applied.patch.tori.updated.map(({label}) => label)).toEqual([
      "renamed",
    ])
  })

  test("adopts geometry as exact operations while keeping identity", () => {
    const hydrated = store()
    const generation = hydrated.rendererRecord("torus", "2")!.generation
    const patch = hydrated.adopt(payload(12))

    expect(patch.tori.added).toEqual([])
    expect(patch.tori.removed).toEqual([])
    expect(patch.tori.updated.map(({darkParticleId}) => darkParticleId))
      .toEqual([2])
    expect(hydrated.rendererRecord("torus", "2")?.generation)
      .toBe(generation + 1)
  })
})
