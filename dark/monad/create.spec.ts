import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import {mkdir, mkdtemp, readFile, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {
  META_AUTHORING_CONTRACT_VERSION,
  META_CREATE_CAPABILITY,
  META_CREATE_METHOD,
  type MetaAuthoringCapability,
  type MetaCreateRequest,
} from "@metafor/types/metafor/authoring"
import {parseMetaAddress} from "@metafor/types/metafor/graph"
import {MetaCreateService} from "./create.ts"

const ADDRESS = parseMetaAddress("zavx0z/lada-test")!
const RPC_SOURCE = "test/create"

describe("Meta Create service", () => {
  let root: string
  let cluster: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "metafor-create-service-"))
    cluster = join(root, "cluster")
    await mkdir(join(cluster, "zavx0z"), {recursive: true})
  })

  afterEach(async () => {
    await rm(root, {recursive: true, force: true})
  })

  const request = (): MetaCreateRequest => ({
    contractVersion: META_AUTHORING_CONTRACT_VERSION,
    operationId: "create-lada-test",
    capability: META_CREATE_CAPABILITY,
    address: ADDRESS,
    name: "Lada Test",
    description: "Inert RPC authoring package",
    profile: "empty",
    target: "absent",
  })

  const grant: MetaAuthoringCapability = {
    capability: META_CREATE_CAPABILITY,
    method: META_CREATE_METHOD,
    scopes: [ADDRESS],
    operationClass: "create",
    liveState: false,
    gitCommit: false,
  }

  test("validates capability and creates the complete empty profile through one service", async () => {
    const service = new MetaCreateService((source) => source === RPC_SOURCE ? [grant] : [], cluster)

    const first = await service.create(request(), RPC_SOURCE)
    const repeated = await service.create(request(), RPC_SOURCE)

    expect(first).toMatchObject({
      contractVersion: META_AUTHORING_CONTRACT_VERSION,
      operationId: "create-lada-test",
      phase: "created",
      outcome: "created",
      address: ADDRESS,
      repository: {initialized: true, branch: "main", head: null, staged: false},
    })
    expect(first.requestDigest).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(first.sourceRevision).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(repeated).toEqual({...first, outcome: "already_created"})
    const metaPath = join(cluster, ADDRESS, "meta.ts")
    const meta = await readFile(metaPath, "utf8")
    expect(meta).toContain(".fields((field) => ({}))")
    expect(meta).toContain(".matter(({ html }) => html``)")
    await expect(service.create({...request(), name: "Other Lada"}, RPC_SOURCE))
      .rejects.toMatchObject({code: "target_conflict"})
    expect(await readFile(metaPath, "utf8")).toBe(meta)
  })

  test("rejects a caller without create capability before touching the target", async () => {
    const service = new MetaCreateService(() => [], cluster)

    await expect(service.create(request(), RPC_SOURCE)).rejects.toThrow("capability_denied")
    await expect(readFile(join(cluster, ADDRESS, "meta.ts"), "utf8")).rejects.toMatchObject({code: "ENOENT"})
  })
})
