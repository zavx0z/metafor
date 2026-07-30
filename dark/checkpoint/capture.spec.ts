import {afterEach, describe, expect, test} from "bun:test"
import {existsSync, mkdtempSync, readFileSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {
  META_JSON_V1_SCHEMA,
  parseMetaAddress,
  type MetaJSONV1,
} from "@metafor/types/metafor/meta-json"
import {
  LOCAL_CHECKPOINT_LIMITS_V1,
  publishCurrentOfflineCheckpoint,
  publishFirstOfflineCheckpoint,
  type CurrentOfflineCheckpointPublication,
  type FirstOfflineCheckpointPublication,
} from "./capture.ts"

const directories: string[] = []
const ROOT = parseMetaAddress("example/root")!

const directory = (): string => {
  const value = mkdtempSync(join(tmpdir(), "metafor-checkpoint-capture-"))
  directories.push(value)
  return value
}

const projection = (name = "Root"): MetaJSONV1 => ({
  schema: META_JSON_V1_SCHEMA,
  root: ROOT,
  template: {
    [ROOT]: {
      name,
      fields: [],
      superposition: [{name: "idle", transitions: null}],
      mass: [],
      processes: [],
    },
  },
  runtime: {
    roots: [{
      kind: "atom",
      declaration: "#/template/example~1root",
      meta: ROOT,
      state: "idle",
      values: {},
      children: [],
    }],
  },
})

const publication = (
  root: string,
  override: Partial<FirstOfflineCheckpointPublication> = {},
): FirstOfflineCheckpointPublication => ({
  cutId: "cut-capture",
  sequence: 1,
  acceptedSequences: [1],
  base: projection(),
  result: projection(),
  boundary: new TextEncoder().encode("standalone-sqlite"),
  mass: [{
    keyId: "11111111-1111-4111-8111-111111111111",
    format: "json",
    bytes: new TextEncoder().encode('{"ready":true}'),
  }],
  repository: join(root, "checkpoint.git"),
  controlState: join(root, "control", "state.json"),
  capturedAt: "2026-07-26T18:00:00.000Z",
  trigger: "owner-bookmark",
  limits: LOCAL_CHECKPOINT_LIMITS_V1,
  ...override,
})

afterEach(() => {
  for (const value of directories.splice(0)) rmSync(value, {recursive: true, force: true})
})

describe("first offline checkpoint publication", () => {
  test("publishes one commit, initializes the non-zero baseline and resumes exactly", () => {
    const root = directory()
    const input = publication(root)
    const first = publishFirstOfflineCheckpoint(input)
    const resumed = publishFirstOfflineCheckpoint(input)

    expect(resumed.commit).toBe(first.commit)
    expect(first.manifest.identity).toEqual({cutId: "cut-capture", sequence: 1})
    expect(first.manifest.patches).toMatchObject({
      previousSnapshotSequence: null,
      fromSequence: 1,
      throughSequence: 1,
      entries: 1,
    })
    expect(JSON.parse(readFileSync(input.controlState, "utf8"))).toMatchObject({
      barrier: {cutId: "cut-capture", acceptanceSequence: 1},
    })
  })

  test("fails closed on an unproved sequence-zero projection or mismatched resume", () => {
    const firstRoot = directory()
    const mismatchedProjection = publication(firstRoot, {result: projection("Changed")})
    expect(() => publishFirstOfflineCheckpoint(mismatchedProjection)).toThrow("unchanged sequence-zero")
    expect(existsSync(mismatchedProjection.repository)).toBe(false)

    const secondRoot = directory()
    const accepted = publication(secondRoot)
    publishFirstOfflineCheckpoint(accepted)
    expect(() => publishFirstOfflineCheckpoint({
      ...accepted,
      capturedAt: "2026-07-26T18:00:01.000Z",
    })).toThrow("does not match")
  })
})

describe("generalized stopped checkpoint publication", () => {
  test("publishes and resumes an exact current-sequence span after the prior checkpoint", () => {
    const root = directory()
    const first = publication(root)
    publishFirstOfflineCheckpoint(first)
    const current: CurrentOfflineCheckpointPublication = {
      cutId: first.cutId,
      sequence: 3,
      previousSnapshotSequence: 1,
      acceptedSequences: [2, 3],
      base: first.result,
      result: projection("Current"),
      boundary: new TextEncoder().encode("standalone-sqlite-current"),
      mass: first.mass,
      patches: [
        {
          sequence: 2,
          operations: [{
            op: "replace",
            path: "/template/example~1root/name",
            value: "Intermediate",
          }],
        },
        {
          sequence: 3,
          operations: [{
            op: "replace",
            path: "/template/example~1root/name",
            value: "Current",
          }],
        },
      ],
      repository: first.repository,
      capturedAt: "2026-07-26T18:00:03.000Z",
      trigger: "owner-bookmark",
      limits: LOCAL_CHECKPOINT_LIMITS_V1,
    }

    const published = publishCurrentOfflineCheckpoint(current)
    const resumed = publishCurrentOfflineCheckpoint(current)
    expect(resumed.commit).toBe(published.commit)
    expect(published.manifest.identity).toEqual({cutId: first.cutId, sequence: 3})
    expect(published.manifest.patches).toMatchObject({
      previousSnapshotSequence: 1,
      fromSequence: 2,
      throughSequence: 3,
      entries: 2,
    })
  })

  test("rejects gaps and a different patch span on resume", () => {
    const root = directory()
    const first = publication(root)
    publishFirstOfflineCheckpoint(first)
    const current: CurrentOfflineCheckpointPublication = {
      cutId: first.cutId,
      sequence: 2,
      previousSnapshotSequence: 1,
      acceptedSequences: [2],
      base: first.result,
      result: projection("Current"),
      boundary: new TextEncoder().encode("standalone-sqlite-current"),
      mass: first.mass,
      patches: [{
        sequence: 2,
        operations: [{
          op: "replace",
          path: "/template/example~1root/name",
          value: "Current",
        }],
      }],
      repository: first.repository,
      capturedAt: "2026-07-26T18:00:02.000Z",
      trigger: "owner-bookmark",
      limits: LOCAL_CHECKPOINT_LIMITS_V1,
    }
    expect(() => publishCurrentOfflineCheckpoint({
      ...current,
      acceptedSequences: [],
    })).toThrow("coverage")

    publishCurrentOfflineCheckpoint(current)
    expect(() => publishCurrentOfflineCheckpoint({
      ...current,
      patches: [{
        sequence: 2,
        operations: [{
          op: "replace",
          path: "/template/example~1root/name",
          value: "Different but same final digest is impossible",
        }],
      }],
    })).toThrow()
  })
})
