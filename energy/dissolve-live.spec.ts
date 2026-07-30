import {afterEach, describe, expect, test} from "bun:test"
import {cpSync, mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {Database} from "bun:sqlite"
import {
  BOUNDARY_INITIAL_PROJECTION_METHOD,
} from "@metafor/types/boundary/initial"
import {
  MF117_CANDIDATE_DIRECTORY,
} from "../shared/mf117.ts"
import type {BoundaryDissolvePlan} from "../boundary/dissolve.ts"
import {open} from "../boundary/sqlite.ts"
import {EnergyMonad} from "./monad.ts"

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, {recursive: true, force: true})
  }
})

describe("Energy MF-117 live preflight adapter", () => {
  test("proves five current generations, four bytes and explicit absent chatOutbox", async () => {
    const directory = mkdtempSync(join(tmpdir(), "metafor-mf117-energy-live-"))
    directories.push(directory)
    const boundaryPath = join(directory, "boundary.sqlite")
    cpSync(
      join(
        MF117_CANDIDATE_DIRECTORY,
        "restoration-proof",
        "boundary.sqlite",
      ),
      boundaryPath,
    )
    const boundary = await open(boundaryPath)
    const candidate = new Database(
      join(MF117_CANDIDATE_DIRECTORY, "candidate", "boundary.sqlite"),
      {readonly: true, strict: true},
    )
    try {
      const row = candidate.query<{plan_json: string}, []>(`
        SELECT plan_json FROM boundary_dissolve_candidate_stage
      `).get()
      if (!row) throw new Error("MF-117 candidate plan is missing")
      const plan = JSON.parse(row.plan_json) as BoundaryDissolvePlan
      const bindings = plan.transfers.map((transfer, index) => ({
        ordinal: index + 1,
        sourceAtom: plan.source.atom,
        sourceDeclaration: transfer.sourceDeclaration,
        sourceAuthoredKey: transfer.sourceAuthoredKey,
        sourceGlobalKey: transfer.sourceGlobalKey,
        targetAtom: plan.target.atom,
        targetDeclaration: transfer.targetDeclaration,
        targetAuthoredKey: transfer.targetAuthoredKey,
        targetPreviousGlobalKey: transfer.targetPreviousGlobalKey,
        format: transfer.format,
        dependentBindings: transfer.dependents.map((dependent) => ({
          atom: dependent.atom,
          declaration: dependent.declaration,
          previousKey: dependent.currentKey,
          parentAtom: dependent.parentAtom,
          parentDeclaration: dependent.parentDeclaration,
        })),
        retention: "retain-until-explicit-gc" as const,
      }))
      const monad = new EnergyMonad()
      monad.onServerStarting({expose() {}} as never)
      await monad.onServerStarted({
        async call(_target: string, method: string) {
          if (method !== BOUNDARY_INITIAL_PROJECTION_METHOD) {
            throw new Error(`Unexpected Energy provider: ${method}`)
          }
          return await boundary.initialProjection()
        },
      } as never)

      const receipt = await monad.mf117.preflight({
        schema: "metafor/energy-mf117-live/v1",
        bindings,
      })

      expect(receipt.generations).toEqual([1, 1, 1, 1, 1])
      expect(receipt.evidence.filter(({kind}) => kind === "present")).toHaveLength(4)
      expect(receipt.evidence.filter(({kind}) => kind === "absent")).toEqual([{
        kind: "absent",
        marker: "metafor/mass-absent/v1",
      }])
      expect(receipt.rollback).toMatchObject({files: 4, verified: true})
    } finally {
      candidate.close(false)
      await boundary.close()
    }
  })
})
