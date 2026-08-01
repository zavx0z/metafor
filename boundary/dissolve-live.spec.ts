import {afterEach, describe, expect, test} from "bun:test"
import {createHash} from "node:crypto"
import {cpSync, existsSync, mkdtempSync, readFileSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {massFileName, MassCatalog} from "../shared/mass.ts"
import {
  MF117_CANDIDATE_DIRECTORY,
  MF117_ENERGY_EVIDENCE_METHOD,
} from "../shared/mf117.ts"
import {
  DARK_DECLARATION_PROJECTION_METHOD,
  readDarkDeclarationProjection,
} from "../dark/graph.ts"
import {assembleGraph} from "../dark/monad/graph.ts"
import {canonicalizeGraph} from "../dark/checkpoint/projection.ts"
import {
  BOUNDARY_GRAPH_PROJECTION_METHOD,
  readBoundaryGraphProjection,
} from "./graph.ts"
import {BoundaryMF117LiveAdapter} from "./dissolve-live.ts"
import {open} from "./sqlite.ts"
import {forceDomains} from "../dark/force/store.ts"

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, {recursive: true, force: true})
  }
})

describe("Boundary MF-117 live preflight adapter", () => {
  test("revalidates the exact accepted cut from a fresh private restoration", async () => {
    await import("../index.ts")
    const directory = mkdtempSync(join(tmpdir(), "metafor-mf117-boundary-live-"))
    directories.push(directory)
    const restoration = join(
      MF117_CANDIDATE_DIRECTORY,
      "restoration-proof",
    )
    const boundaryPath = join(directory, "boundary.sqlite")
    const massPath = join(directory, "mass")
    cpSync(join(restoration, "boundary.sqlite"), boundaryPath)
    cpSync(join(restoration, "mass"), massPath, {recursive: true})
    const boundary = await open(boundaryPath, {
      massCatalog: new MassCatalog(massPath),
    })
    try {
      const peer = {
        expose() {},
        async call<T>(
          target: string,
          method: string,
          params: Record<string, unknown>,
        ): Promise<T> {
          if (
            target === "dark" &&
            method === DARK_DECLARATION_PROJECTION_METHOD
          ) return await readDarkDeclarationProjection(params) as T
          if (
            target === "energy" &&
            method === MF117_ENERGY_EVIDENCE_METHOD
          ) {
            const filename = join(
              massPath,
              massFileName(
                String(params.keyId),
                params.format as "json" | "binary",
              ),
            )
            if (!existsSync(filename)) {
              return {
                kind: "absent",
                marker: "metafor/mass-absent/v1",
              } as T
            }
            return {
              kind: "present",
              digestSha256: createHash("sha256")
                .update(readFileSync(filename))
                .digest("hex"),
            } as T
          }
          throw new Error(`Unexpected MF-117 provider: ${target}.${method}`)
        },
      }
      const adapter = new BoundaryMF117LiveAdapter(boundary)
      adapter.register(peer as never)
      const current = await assembleGraph({
        async call<T>(target: string, method: string, params: unknown): Promise<T> {
          if (target === "dark") {
            return await readDarkDeclarationProjection(params) as T
          }
          if (target === "boundary" && method === BOUNDARY_GRAPH_PROJECTION_METHOD) {
            return await readBoundaryGraphProjection(boundary, params) as T
          }
          throw new Error(`${target}.${method}`)
        },
      } as never, {root: "zavx0z/inference"})
      expect(canonicalizeGraph(current).sha256).toBe(
        "ea0511057c063d0aaa40f34888ce8d70102e8733581ddc0f719f7dd5b8484cd1",
      )

      const result = await adapter.preflight({
        schema: "metafor/boundary-mf117-live/v1",
        admissionId: "mf117-private-restoration",
        cutId: "mf102-20260726T150016Z-53b4bd78-0930-4ccf-b83e-c147f3cea66a",
        sequence: 1,
      })

      expect(result).toMatchObject({
        beforeProjectionSha256:
          "ea0511057c063d0aaa40f34888ce8d70102e8733581ddc0f719f7dd5b8484cd1",
        postProjectionSha256:
          "9d4d8bb5976c1988095ed2eeb445056dc846882a22b97b17031e98207a0edd5d",
        integrity: {quickCheck: "ok", foreignKeyViolations: 0},
        rollback: {files: 3, verified: true},
        retention: "retain-until-explicit-gc",
      })
      expect(result.causalPlan.retainedBindings).toHaveLength(5)
      expect(result.admissionInput.plan.privateManifest.entries.filter(
        ({evidence}) => evidence.kind === "absent",
      )).toHaveLength(1)

      const admitted = await adapter.admit({
        schema: "metafor/boundary-mf117-live/v1",
        admissionInput: result.admissionInput,
      })
      const quiescent = await adapter.quiescent({
        schema: "metafor/boundary-mf117-live/v1",
        admissionId: admitted.admissionId,
        frontier: {
          cutId: result.causalPlan.checkpoint.cutId,
          phase: "held",
          acceptanceSequence: result.causalPlan.checkpoint.sequence,
          domains: forceDomains.map((domain) => ({
            domain,
            sentOrdinal: 0,
            appliedOrdinal: 0,
            appliedAcceptanceSequence: 0,
          })),
        },
        energy: {
          schema: "metafor/energy-dissolve-fence-binding/v1",
          receiptId: "1".repeat(64),
          receiptSha256: "2".repeat(64),
          admissionId: admitted.admissionId,
          admissionReceiptId: admitted.receiptId,
          stageId: admitted.plan.stageId,
          stageReceiptId: admitted.plan.stageReceiptId,
          planSha256: admitted.plan.structuralPlanSha256,
          phase: "fenced",
          handleCount: 5,
        },
      })
      expect(quiescent.phase).toBe("quiescent")
      const committed = await adapter.commit({
        schema: "metafor/boundary-mf117-live/v1",
        admissionInput: result.admissionInput,
      })
      expect(committed.admission.phase).toBe("committed")
      expect(committed.proof).toEqual(result.admissionInput.proof)
      expect(committed.consequences).toHaveLength(2)
      expect(committed.consequences.at(-1)).toMatchObject({
        part: "graviton",
        op: "remove",
        path: "atom/1",
      })
      await expect(adapter.verify({
        schema: "metafor/boundary-mf117-live/v1",
        admissionInput: result.admissionInput,
      })).resolves.toMatchObject({
        activeRoot: "zavx0z/lada",
        previousRoot: "zavx0z/inference",
        sourceAtomAbsent: true,
        preservedAtomIds: [2, 3, 4, 5, 6],
        massKeysRetained: 5,
        rollbackVerified: true,
      })
    } finally {
      await boundary.close()
    }
  })
})
