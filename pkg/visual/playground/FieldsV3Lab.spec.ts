import {describe, expect, test} from "bun:test"
import type {BulkObserverSnapshot} from "@bulk/types/initial"
import {BulkVisualSceneLifecycle} from "bulk/visual"
import {buildFieldsV2Source} from "./FieldsV2Lab.ts"
import {FIELDS_V3_SLUG} from "./FieldsV3Lab.ts"
import snapshotJson from "./fixture/oracle-snapshot.json"

describe("Fields v3 playground", () => {
  test("stages only the standard root lada Torus", async () => {
    const lifecycle = new BulkVisualSceneLifecycle()
    lifecycle.prepare(structuredClone(snapshotJson as BulkObserverSnapshot))
    const source = buildFieldsV2Source(lifecycle)
    const implementation = await Bun.file(
      new URL("./FieldsV3Lab.ts", import.meta.url),
    ).text()

    expect(FIELDS_V3_SLUG).toBe("analysis-fields-v3")
    expect(source.root.label).toBe("lada")
    expect(source.root.torusRadius + source.root.torusTube).toBe(50)
    expect(implementation).toContain("new TorusGeometry({")
    expect(implementation).toContain("source.root.torusRadius")
    expect(implementation).toContain("source.root.torusTube")
    expect(implementation).toContain("createQuantumFilmMaterial(")
    expect(implementation).toContain("outerRadius * 2.35 / Math.min(1, aspect)")
    expect(implementation).toContain("resetTopView()")
    expect(implementation).not.toContain("createFlatFieldBandGeometry")
    expect(implementation).not.toContain("createAccretionBandGeometry")
    expect(implementation).not.toContain("new Text(")
  })
})
