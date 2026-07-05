import {describe, expect, test} from "bun:test"
import type {BoundaryEnergyRuntimeSnapshot, ForceMessage, Particle} from "boundary"
import {startEnergyProtocol} from "./energy.ts"

let channelSequence = 0

const waitFor = async (predicate: () => boolean): Promise<void> => {
  const deadline = Date.now() + 1000

  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error("Expected asynchronous Energy broadcast effect")
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

const createCatalog = (env: string[] = ["server"]): BoundaryEnergyRuntimeSnapshot => ({
  version: 1,
  actors: [[17, "owner/process"]],
  processes: [{
    wimp: "owner/process",
    state: "ready",
    descriptor: {
      type: "action",
      key: "ready",
      env,
      action: {
        src: "./actions/ready.ts",
        readFields: [[2, "level"]],
      },
    },
  }],
})

const createHarness = (
  energyId = "energy-local",
  timeoutMs = 1,
  catalog: BoundaryEnergyRuntimeSnapshot = createCatalog(),
  runtimeKind = "server",
) => {
  const name = `force-energy-test-${Date.now()}-${++channelSequence}`
  const energyForce = new BroadcastChannel(name)
  const input = new BroadcastChannel(name)
  const output = new BroadcastChannel(name)
  const messages: ForceMessage[] = []
  const protocol = startEnergyProtocol({force: energyForce, energyId, timeoutMs, catalog, runtimeKind})

  output.onmessage = (event) => {
    messages.push(event.data as ForceMessage)
  }

  return {
    messages,
    emit(message: ForceMessage) {
      input.postMessage(message)
    },
    close() {
      protocol.close()
      input.close()
      output.close()
    },
  }
}

const collectParts = (messages: ForceMessage[], part: string, op?: string): Particle[] =>
  messages.flatMap((message) =>
    message.parts.filter((item) => item.part === part && (op === undefined || item.op === op)),
  )

describe("Energy Weak protocol", () => {
  test("Energy ignores photon/replace", async () => {
    const harness = createHarness("energy-local")

    try {
      harness.emit({
        parts: [{part: "photon", op: "replace", path: 17, value: "ready"}],
      })
      await sleep(10)

      expect(collectParts(harness.messages, "z", "test")).toEqual([])
      expect(collectParts(harness.messages, "w-", "replace")).toEqual([])
    } finally {
      harness.close()
    }
  })

  test("Energy sends z test on photon/test with matching catalog and env", async () => {
    const harness = createHarness("energy-local")

    try {
      harness.emit({
        parts: [{part: "photon", op: "test", path: 17, value: "ready"}],
      })

      await waitFor(() => collectParts(harness.messages, "z", "test").length > 0)

      expect(collectParts(harness.messages, "z", "test")[0]).toEqual({
        part: "z",
        op: "test",
        path: 17,
        value: {energy: "energy-local"},
      })
    } finally {
      harness.close()
    }
  })

  test("Energy does not claim photon/test without descriptor", async () => {
    const harness = createHarness("energy-local", 1, {...createCatalog(), processes: []})

    try {
      harness.emit({
        parts: [{part: "photon", op: "test", path: 17, value: "ready"}],
      })
      await sleep(10)

      expect(collectParts(harness.messages, "z", "test")).toEqual([])
      expect(collectParts(harness.messages, "w-", "replace")).toEqual([])
    } finally {
      harness.close()
    }
  })

  test("Energy does not claim photon/test when env does not match", async () => {
    const harness = createHarness("energy-local", 1, createCatalog(["browser"]), "server")

    try {
      harness.emit({
        parts: [{part: "photon", op: "test", path: 17, value: "ready"}],
      })
      await sleep(10)

      expect(collectParts(harness.messages, "z", "test")).toEqual([])
      expect(collectParts(harness.messages, "w-", "replace")).toEqual([])
    } finally {
      harness.close()
    }
  })

  test("Energy waits for z copy before w+", async () => {
    const harness = createHarness("energy-local", 1)

    try {
      harness.emit({
        parts: [{part: "photon", op: "test", path: 17, value: "ready"}],
      })

      await waitFor(() => collectParts(harness.messages, "z", "test").length > 0)
      await sleep(10)

      expect(collectParts(harness.messages, "z", "test")).toHaveLength(1)
      expect(collectParts(harness.messages, "w+", "replace")).toEqual([])
    } finally {
      harness.close()
    }
  })

  test("Energy sends actor-addressed w+ after z copy timeout", async () => {
    const harness = createHarness("energy-local", 1)

    try {
      harness.emit({
        parts: [{part: "photon", op: "test", path: 17, value: "ready"}],
      })
      await waitFor(() => collectParts(harness.messages, "z", "test").length > 0)

      harness.emit({
        parts: [{
          part: "z",
          op: "copy",
          path: 17,
          from: "energy-local",
          value: {fields: {"2": 11}},
        }],
      })

      await waitFor(() => collectParts(harness.messages, "w+", "replace").length > 0)

      const result = collectParts(harness.messages, "w+", "replace")[0]
      expect(result).toEqual({
        part: "w+",
        op: "replace",
        path: 17,
        value: {fields: {}},
      })
      expect("energyId" in result!).toBe(false)
      expect("executorId" in result!).toBe(false)
      expect("processId" in result!).toBe(false)
      expect("token" in result!).toBe(false)
      expect("wimpId" in result!).toBe(false)
    } finally {
      harness.close()
    }
  })

  test("Energy ignores z copy for another energy", async () => {
    const harness = createHarness("energy-local", 1)

    try {
      harness.emit({
        parts: [{
          part: "z",
          op: "copy",
          path: 17,
          from: "energy-other",
          value: {fields: {"2": 11}},
        }],
      })
      await sleep(10)

      expect(collectParts(harness.messages, "w+", "replace")).toEqual([])
    } finally {
      harness.close()
    }
  })
})
