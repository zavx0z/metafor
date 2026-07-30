import {afterEach, describe, expect, test} from "bun:test"
import {createHash} from "node:crypto"
import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {
  MF117_BOUNDARY_PREFLIGHT_METHOD,
  MF117_BULK_PREFLIGHT_METHOD,
  MF117_ENERGY_PREFLIGHT_METHOD,
  MF117_SOURCE,
  MF117_TARGET,
} from "../shared/mf117.ts"
import {MF117LiveCoordinator} from "./dissolve-live.ts"

const cutId = "mf102-20260726T150016Z-53b4bd78-0930-4ccf-b83e-c147f3cea66a"
const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, {recursive: true, force: true})
  }
})

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical)
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).toSorted(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0)
        .map(([key, entry]) => [key, canonical(entry)]),
    )
  }
  return value
}

const digest = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")

describe("MF-117 live coordinator preflight", () => {
  test("verifies every domain and rollback byte without closing live admission", async () => {
    const directory = mkdtempSync(join(tmpdir(), "metafor-mf117-live-"))
    directories.push(directory)
    let admissionCloses = 0
    const lifecycle = {
      status: () => ({
        ok: true,
        state: "running",
        externalAdmission: "open",
      }),
      closeExternalAdmission() {
        admissionCloses += 1
      },
    }
    const frontier = {
      cutId,
      phase: "open",
      acceptanceSequence: 1,
      domains: ["dark", "boundary", "matrix", "energy", "bulk"].map((domain) => ({
        domain,
        sentOrdinal: 0,
        appliedOrdinal: 0,
        appliedAcceptanceSequence: 0,
      })),
    }
    const checkpoint = {barrier: {frontier: () => frontier}}
    const history = {
      status: () => ({cutId, sequence: 1}),
      read: () => [],
    }
    const evidence = [
      {kind: "present", digestSha256: "1".repeat(64)},
      {kind: "present", digestSha256: "2".repeat(64)},
      {kind: "present", digestSha256: "3".repeat(64)},
      {kind: "absent", marker: "metafor/mass-absent/v1"},
      {kind: "present", digestSha256: "5".repeat(64)},
    ]
    const promotion = {
      version: 1,
      kind: "root-promotion",
      verified: true,
      removedRootAtomId: 1,
      removedRootSrc: MF117_SOURCE,
      promotedAtomId: 2,
      promotedRootSrc: MF117_TARGET,
      formerRootFrame: {
        localX: 0,
        localY: 0,
        localZ: 0,
        outerDiameterMm: 100,
      },
    }
    const peer = {
      async call(_target: string, method: string, params: Record<string, unknown>) {
        if (method === MF117_BOUNDARY_PREFLIGHT_METHOD) {
          const admissionId = String(params.admissionId)
          const plan = {
            source: {src: MF117_SOURCE, atom: 1, position: 0},
            target: {src: MF117_TARGET, atom: 2, previousPosition: 0, position: 0},
            transfers: evidence.map((massEvidence, index) => ({
              sourceAuthoredKey: `source-${index}`,
              targetAuthoredKey: `target-${index}`,
              sourceDeclaration: index + 1,
              targetDeclaration: index + 11,
              sourceGlobalKey: `${index + 1}`.repeat(64),
              targetPreviousGlobalKey: `${index + 6}`.repeat(64),
              format: "json",
              targetSource: null,
              dependents: [],
              massEvidence,
            })),
            preservedRuntime: [],
            structuralSha256: "a".repeat(64),
            privateManifest: {
              entries: evidence.map((massEvidence) => ({evidence: massEvidence})),
            },
          }
          const bindings = evidence.map((_entry, index) => ({
            ordinal: index + 1,
            sourceAtom: 1,
            sourceDeclaration: index + 1,
            sourceAuthoredKey: `source-${index}`,
            sourceGlobalKey: `${index + 1}`.repeat(64),
            targetAtom: 2,
            targetDeclaration: index + 11,
            targetAuthoredKey: `target-${index}`,
            targetPreviousGlobalKey: `${index + 6}`.repeat(64),
            format: "json",
            dependentBindings: [],
            retention: "retain-until-explicit-gc",
          }))
          return {
            schema: "metafor/boundary-mf117-live/v1",
            admissionInput: {
              admissionId,
              plan,
              promotionReceipt: promotion,
            },
            causalPlan: {
              checkpoint: {cutId, sequence: 1},
              retainedBindings: bindings,
            },
            integrity: {quickCheck: "ok", foreignKeyViolations: 0},
            rollback: {files: 3, verified: true},
          }
        }
        if (method === MF117_ENERGY_PREFLIGHT_METHOD) {
          return {
            schema: "metafor/energy-mf117-live/v1",
            source: MF117_SOURCE,
            target: MF117_TARGET,
            generations: [1, 1, 1, 1, 1],
            evidence,
            rollback: {files: 4, verified: true},
          }
        }
        if (method === MF117_BULK_PREFLIGHT_METHOD) {
          return {
            schema: "metafor/bulk-mf117-live/v1",
            sourceRootTorus: {darkParticleId: 2, outerDiameterMm: 100},
            targetChildTorus: {darkParticleId: 4, parentDarkParticleId: 2},
            promotionReceiptSha256: digest(promotion),
            noGhostTorus: true,
          }
        }
        throw new Error(`Unexpected method ${method}`)
      },
    }
    const coordinator = new MF117LiveCoordinator(
      lifecycle as never,
      checkpoint as never,
      history as never,
      peer as never,
      {preflightPath: join(directory, "preflight.json")},
    )

    const receipt = await coordinator.preflight()

    expect(receipt).toMatchObject({
      cut: {cutId, sequence: 1},
      liveMutation: false,
      activation: "not-started",
      rollback: {files: 11, verified: true},
      bulk: {noGhostTorus: true},
    })
    expect(receipt.receiptId).toMatch(/^[0-9a-f]{64}$/)
    expect(admissionCloses).toBe(0)
  })
})
