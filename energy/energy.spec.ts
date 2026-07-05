import {describe, expect, test} from "bun:test"
import type {ForceMessage, Particle} from "boundary"
import {energyProtocol, startEnergyProtocol} from "./energy.ts"

energyProtocol.close()

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

const createHarness = (energyId = "energy-local", timeoutMs = 1) => {
  const name = `force-energy-test-${Date.now()}-${++channelSequence}`
  const energyForce = new BroadcastChannel(name)
  const input = new BroadcastChannel(name)
  const output = new BroadcastChannel(name)
  const messages: ForceMessage[] = []
  const protocol = startEnergyProtocol({force: energyForce, energyId, timeoutMs})

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

describe("Energy Weak v0 protocol", () => {
  test("Energy sends z test on photon", async () => {
    const harness = createHarness("energy-local")

    try {
      harness.emit({
        parts: [{part: "photon", op: "replace", path: 17, value: "ready"}],
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

  test("Energy waits for z copy before w+", async () => {
    const harness = createHarness("energy-local", 1)

    try {
      harness.emit({
        parts: [{part: "photon", op: "replace", path: 17, value: "ready"}],
      })

      await waitFor(() => collectParts(harness.messages, "z", "test").length > 0)
      await sleep(10)

      expect(collectParts(harness.messages, "z", "test")).toHaveLength(1)
      expect(collectParts(harness.messages, "w+", "replace")).toEqual([])
    } finally {
      harness.close()
    }
  })

  test("Energy sends w+ after z copy timeout", async () => {
    const harness = createHarness("energy-local", 1)

    try {
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

      expect(collectParts(harness.messages, "w+", "replace")[0]).toEqual({
        part: "w+",
        op: "replace",
        path: 17,
        value: {fields: {}},
      })
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
