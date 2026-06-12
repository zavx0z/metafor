import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import {createProtocolChannel, type ProtocolPatch} from "../../protocol.ts"
import {open} from "../../store/server.ts"
import {matter} from "../index.ts"

const waitForPatches = async (predicate: () => boolean): Promise<void> => {
  const deadline = Date.now() + 1000
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("Expected dark protocol patches")
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

describe("dark matter — protocol patches", () => {
  const patches: ProtocolPatch[] = []
  let store: Awaited<ReturnType<typeof open>>
  let channel: ReturnType<typeof createProtocolChannel>

  beforeAll(async () => {
    store = await open(":memory:")
    globalThis.store = store
    channel = createProtocolChannel()
    channel.onmessage = (event) => patches.push(...event.data.patches)
    await matter("zavx0z/git")
    await waitForPatches(() => {
      const actorCount = patches.filter((patch) => patch.part === "graviton" && patch.op === "add" && patch.value === "actor").length
      const topologyCount = patches.filter((patch) => patch.part === "graviton" && patch.op === "add" && patch.value === "topology").length
      return actorCount > 20 && topologyCount > 0
    })
  })

  afterAll(async () => {
    channel.close()
    await store.close()
  })

  const actorPatches = (): ProtocolPatch[] =>
    patches.filter((patch) => patch.part === "graviton" && patch.op === "add" && patch.value === "actor")

  const topologyPatches = (): ProtocolPatch[] =>
    patches.filter((patch) => patch.part === "graviton" && patch.op === "add" && patch.value === "topology")

  test("первый actor patch соответствует root actor", async () => {
    const roots = await store.actor.roots.all()
    expect(roots).toHaveLength(1)
    expect(actorPatches()[0]?.path).toBe(roots[0]!.uuid)
  })

  test("публикует actor patches для рекурсивно materialized child wimps", () => {
    expect(actorPatches().length).toBeGreaterThan(20)
  })

  test("публикует runtime topology patches", () => {
    expect(topologyPatches().length).toBeGreaterThan(0)
  })

  test("каждый runtime particle uuid уникален в patches", () => {
    const uuids = [...actorPatches(), ...topologyPatches()].map((patch) => patch.path)
    expect(new Set(uuids).size).toBe(uuids.length)
  })
})
