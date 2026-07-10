import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import {mkdirSync, rmSync} from "node:fs"
import {join} from "node:path"
import {SQL} from "bun"
import type { ForceMessage } from "@metafor/types/force/message"
import type { Particle } from "@metafor/types/force/particle"
import type { MatrixRuntimeSnapshot } from "@metafor/types/matrix/runtime"
import {createForceTestFixture, type ForceTestClient, type ForceTestFixture} from "force/fixture"
import {FieldType} from "./gravity"
import { STATE_NONE, STATE_UNDEFINED } from "@metafor/types/matrix/runtime"
import {open} from "../boundary/sqlite.ts"

let forceFixture: ForceTestFixture

beforeAll(() => {
  forceFixture = createForceTestFixture()
})

afterAll(() => {
  forceFixture?.close()
})

const createRuntimeSnapshot = (): MatrixRuntimeSnapshot => ({
  version: 1,
  runtime: {
    actorIdByBraneIndex: [17],
    braneIndexByActorId: [[17, 0]],
    wimpSrcByActorId: [[17, "zavx0z/linux"]],
    actorIdsByWimpSrc: [["zavx0z/linux", [17]]],
    runtimeFieldIndexByActorFieldId: [
      [17, 2, 0],
      [17, 5, 1],
      [17, 7, 2],
      [17, 9, 3],
    ],
  },
  data: {
    fields: [
      {type: FieldType.F32},
      {type: FieldType.U32, enum: ["native", "css"]},
      {type: FieldType.U32},
      {type: FieldType.ARRAY_PTR, elementType: "string"},
    ],
    branes: [
      {
        values: [
          [0, 0],
          [1, "native"],
          [2, 3],
          [3, ["seed"]],
        ],
        state: 0,
        collapses: [
          [[1, {0: {gt: 10}}]],
          [],
        ],
      },
    ],
    stateNames: [["idle", "ready"]],
  },
  strong: {
    runtimeFieldIndexByWimpFieldId: [],
    wimpFieldIdsByRuntimeFieldIndex: [[], [], [], []],
    braneIndexByWimpFieldId: [],
    topologyWimpFieldIds: [],
    topologyActorFieldIds: [[17, 5], [17, 9]],
  },
  weak: {
    stateMetaStateIdsByBraneIndex: [[101, 102]],
    stateHasProcessByBraneIndex: [[false, false]],
  },
})

const createProcessReadySnapshot = (): MatrixRuntimeSnapshot => {
  const snapshot = createRuntimeSnapshot()
  snapshot.weak.stateHasProcessByBraneIndex = [[false, true]]
  return snapshot
}

const createThreeStateProcessSnapshot = (): MatrixRuntimeSnapshot => {
  const snapshot = createRuntimeSnapshot()
  snapshot.data.branes[0]!.collapses = [
    [[1, {0: {gt: 10}}]],
    [[2, {0: {gt: 11}}]],
    [],
  ]
  snapshot.data.stateNames = [["idle", "ready", "done"]]
  snapshot.weak.stateMetaStateIdsByBraneIndex = [[101, 102, 103]]
  snapshot.weak.stateHasProcessByBraneIndex = [[false, true, false]]
  return snapshot
}

const settleMessages = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const markMessages = (): number => forceFixture.messages.length

const partsSince = (client: ForceTestClient, fromIndex: number): Particle[] =>
  forceFixture.messages
    .slice(fromIndex)
    .filter((entry) => entry.client === client)
    .flatMap((entry) => entry.message.parts)

const waitForPart = async (
  client: ForceTestClient,
  predicate: (part: Particle) => boolean,
  fromIndex: number = 0,
): Promise<Particle> => {
  const entry = await forceFixture.waitForMessage((entry) => (
    entry.client === client && entry.message.parts.some(predicate)
  ), fromIndex)
  const part = entry.message.parts.find(predicate)
  if (!part) throw new Error("Matched Force message did not contain expected part")
  return part
}

const expectNoParts = async (client: ForceTestClient, fromIndex: number): Promise<void> => {
  await settleMessages()
  expect(partsSince(client, fromIndex)).toEqual([])
}

const startMatrix = async (): Promise<ForceTestClient> => {
  const client = forceFixture.nextClient("matrix")
  await import(`./matrix.ts?force-test=${crypto.randomUUID()}`)
  return await client
}

const createMatrix = async (snapshot: MatrixRuntimeSnapshot = createRuntimeSnapshot()): Promise<ForceTestClient> => {
  const client = await startMatrix()
  forceFixture.create(client, snapshot)
  await settleMessages()
  return client
}

const sendForce = (client: ForceTestClient, message: ForceMessage): void => {
  forceFixture.impulse(client, message)
}

const enterReadyProcessState = async (
  snapshot: MatrixRuntimeSnapshot = createProcessReadySnapshot(),
): Promise<ForceTestClient> => {
  const client = await createMatrix(snapshot)
  const from = markMessages()
  sendForce(client, {
    parts: [{
      part: "gluon",
      op: "replace",
      path: 17,
      value: {fields: {"2": 11}},
    }],
  })
  await waitForPart(client, (part) => (
    part.part === "photon" && part.op === "test" && part.path === 17 && part.value === "ready"
  ), from)
  return client
}

const acceptEnergy = async (client: ForceTestClient, energy: string): Promise<Particle> => {
  const from = markMessages()
  sendForce(client, {
    parts: [{
      part: "z",
      op: "test",
      path: 17,
      value: {energy},
    }],
  })
  return await waitForPart(client, (part) => part.part === "z" && part.op === "copy" && part.from === energy, from)
}

const enterReadyAndCopy = async (client: ForceTestClient, energy = "energy-local"): Promise<Particle> => {
  const fromReady = markMessages()
  sendForce(client, {
    parts: [{
      part: "gluon",
      op: "replace",
      path: 17,
      value: {fields: {"2": 11}},
    }],
  })
  await waitForPart(client, (part) => (
    part.part === "photon" && part.op === "test" && part.path === 17 && part.value === "ready"
  ), fromReady)
  return await acceptEnergy(client, energy)
}

describe("matrix Force runtime over WebSocket", () => {
  test("gluon принимает actor ID и value.fields[fieldId], затем публикует photon с actor ID", async () => {
    const client = await createMatrix()
    const from = markMessages()

    sendForce(client, {
      parts: [{
        part: "gluon",
        op: "replace",
        path: 17,
        value: {fields: {"2": 11}},
      }],
    })

    expect(await waitForPart(client, (part) => part.part === "photon", from)).toEqual({
      part: "photon",
      op: "replace",
      path: 17,
      value: "ready",
    })
  })

  test("process-bound state emits photon/test and does not emit z before Energy asks", async () => {
    const client = await createMatrix(createProcessReadySnapshot())
    const from = markMessages()

    sendForce(client, {
      parts: [{
        part: "gluon",
        op: "replace",
        path: 17,
        value: {fields: {"2": 11}},
      }],
    })

    expect(await waitForPart(client, (part) => part.part === "photon", from)).toEqual({
      part: "photon",
      op: "test",
      path: 17,
      value: "ready",
    })
    await settleMessages()
    expect(partsSince(client, from).filter((part) => part.part === "z")).toEqual([])
  })

  test("Matrix stores process field snapshot at state entry", async () => {
    const client = await createMatrix(createProcessReadySnapshot())
    const fromReady = markMessages()

    sendForce(client, {
      parts: [{
        part: "gluon",
        op: "replace",
        path: 17,
        value: {fields: {"2": 11}},
      }],
    })
    await waitForPart(client, (part) => part.part === "photon" && part.op === "test", fromReady)

    sendForce(client, {
      parts: [{
        part: "gluon",
        op: "replace",
        path: 17,
        value: {fields: {"2": 14}},
      }],
    })
    await settleMessages()

    const copy = await acceptEnergy(client, "energy-local")
    expect(copy).toEqual({
      part: "z",
      op: "copy",
      path: 17,
      from: "energy-local",
      value: {fields: {"2": 11, "5": 0, "7": 3, "9": [1]}},
    })
    expect(Object.keys(copy.value as Record<string, unknown>)).toEqual(["fields"])
  })

  test("Matrix accepts only first z/test for locked process state", async () => {
    const client = await enterReadyProcessState()
    const first = await acceptEnergy(client, "energy-one")
    expect(first.from).toBe("energy-one")

    const from = markMessages()
    sendForce(client, {
      parts: [{
        part: "z",
        op: "test",
        path: 17,
        value: {energy: "energy-two"},
      }],
    })

    await expectNoParts(client, from)
  })

  test("Matrix accepts w+ actor result and can transition after applying fields", async () => {
    const client = await enterReadyProcessState(createThreeStateProcessSnapshot())
    await acceptEnergy(client, "energy-local")
    const from = markMessages()

    sendForce(client, {
      parts: [{
        part: "w+",
        op: "replace",
        path: 17,
        value: {fields: {"2": 12}},
      }],
    })

    expect(await waitForPart(client, (part) => part.part === "photon", from)).toEqual({
      part: "photon",
      op: "replace",
      path: 17,
      value: "done",
    })
  })

  test("Matrix accepts w- actor result and can transition after applying fields", async () => {
    const client = await enterReadyProcessState(createThreeStateProcessSnapshot())
    await acceptEnergy(client, "energy-local")
    const from = markMessages()

    sendForce(client, {
      parts: [{
        part: "w-",
        op: "replace",
        path: 17,
        value: {error: "failed", fields: {"2": 13}},
      }],
    })

    expect(await waitForPart(client, (part) => part.part === "photon", from)).toEqual({
      part: "photon",
      op: "replace",
      path: 17,
      value: "done",
    })
  })

  test("Boundary runtime snapshot reaches Matrix through create and produces z/copy without legacy payload fields", async () => {
    const src = "owner/process-runtime-smoke"
    const actorId = 1701
    const dir = join(import.meta.dir, "..", "boundary", "tmp")
    mkdirSync(dir, {recursive: true})
    const filename = join(dir, `matrix-energy-${crypto.randomUUID()}.sqlite`)
    const boundary = await open(filename)
    const sql = new SQL(`sqlite://${filename}`)

    try {
      await boundary.wimp.create(src, {
        fields: [
          {key: "command", type: "number"},
          {key: "result", type: "number"},
        ],
        superposition: [{name: "ready"}],
        processes: [{
          key: "ready",
          declaration: {
            type: "action",
            env: ["server"],
            action: {
              src: "./actions/run.ts",
              wrapperSrc: "async ({ value }) => ({ result: value.command + 35 })",
              read: ["command"],
            },
            success: {
              src: "({ update, data }) => update({ result: data.result })",
              read: ["result"],
              write: ["result"],
            },
          },
        }],
      })
      const commandId = (
        await sql<Array<{id: number}>>`SELECT id FROM field WHERE wimp = ${src} AND key = ${"command"} LIMIT 1`
      )[0]?.id
      const resultId = (
        await sql<Array<{id: number}>>`SELECT id FROM field WHERE wimp = ${src} AND key = ${"result"} LIMIT 1`
      )[0]?.id
      if (commandId === undefined || resultId === undefined) throw new Error("smoke fields missing")

      await boundary.actor.create({
        actor: {id: actorId, parentActor: null, parentTopology: null, wimp: src},
        values: [
          {actor: actorId, field: commandId, value: 17101},
          {actor: actorId, field: resultId, value: 17102},
        ],
        valueRecords: [
          {id: 17101, kind: "number", number: 7},
          {id: 17102, kind: "number", number: 0},
        ],
        valueItems: [],
        state: {actor: actorId, metaState: null},
      })

      const runtime = await boundary.matrixRuntime()
      expect("processes" in runtime).toBe(false)
      expect(JSON.stringify(runtime)).not.toContain("wrapperSrc")

      const client = await startMatrix()
      const fromCreate = markMessages()
      forceFixture.create(client, runtime)
      expect(await waitForPart(client, (part) => part.part === "photon", fromCreate)).toEqual({
        part: "photon",
        op: "test",
        path: actorId,
        value: "ready",
      })

      const fromEnergy = markMessages()
      sendForce(client, {
        parts: [{
          part: "z",
          op: "test",
          path: actorId,
          value: {energy: "energy-smoke"},
        }],
      })
      const zCopy = await waitForPart(client, (part) => (
        part.part === "z" && part.op === "copy" && part.path === actorId
      ), fromEnergy)

      expect(zCopy.from).toBe("energy-smoke")
      expect(Object.keys(zCopy.value as Record<string, unknown>)).toEqual(["fields"])
      expect((zCopy.value as {fields: Record<string, unknown>}).fields[String(commandId)]).toBe(7)
      expect("energyId" in zCopy).toBe(false)
      expect("executorId" in zCopy).toBe(false)
      expect("processId" in zCopy).toBe(false)
      expect("token" in zCopy).toBe(false)
      expect("wimpId" in zCopy).toBe(false)
    } finally {
      await sql.close()
      await boundary.close()
      rmSync(filename, {force: true})
      rmSync(`${filename}-shm`, {force: true})
      rmSync(`${filename}-wal`, {force: true})
    }
  })

  test("Matrix emits photon/test on first process-bound runtime undefined entry", async () => {
    const snapshot = createRuntimeSnapshot()
    snapshot.data.branes[0]!.state = STATE_UNDEFINED
    snapshot.weak.stateHasProcessByBraneIndex = [[true, false]]
    const client = await startMatrix()
    const from = markMessages()

    forceFixture.create(client, snapshot)

    expect(await waitForPart(client, (part) => part.part === "photon", from)).toEqual({
      part: "photon",
      op: "test",
      path: 17,
      value: "idle",
    })
    await settleMessages()
    expect(partsSince(client, from).filter((part) => part.part === "z")).toEqual([])
  })

  test("non-process runtime undefined entry emits replace and can continue through messages", async () => {
    const snapshot = createRuntimeSnapshot()
    snapshot.data.branes[0]!.state = STATE_UNDEFINED
    snapshot.weak.stateHasProcessByBraneIndex = [[false, false]]
    const client = await startMatrix()
    const fromCreate = markMessages()

    forceFixture.create(client, snapshot)

    expect(await waitForPart(client, (part) => part.part === "photon", fromCreate)).toEqual({
      part: "photon",
      op: "replace",
      path: 17,
      value: "idle",
    })

    const fromUpdate = markMessages()
    sendForce(client, {
      parts: [{
        part: "gluon",
        op: "replace",
        path: 17,
        value: {fields: {"2": 11}},
      }],
    })

    expect(await waitForPart(client, (part) => part.part === "photon", fromUpdate)).toEqual({
      part: "photon",
      op: "replace",
      path: 17,
      value: "ready",
    })
  })

  test("actor without state graph accepts addressed input without emitting weak messages", async () => {
    const snapshot = createRuntimeSnapshot()
    snapshot.data.branes[0] = {
      values: snapshot.data.branes[0]!.values,
      state: STATE_NONE,
      collapses: [],
    }
    snapshot.data.stateNames = [[]]
    snapshot.weak.stateMetaStateIdsByBraneIndex = [[]]
    snapshot.weak.stateHasProcessByBraneIndex = [[]]
    const client = await createMatrix(snapshot)
    const from = markMessages()

    sendForce(client, {
      parts: [{
        part: "gluon",
        op: "replace",
        path: 17,
        value: {fields: {"2": 14}},
      }],
    })

    await expectNoParts(client, from)
  })

  test("gluon rejects /field path, key-addressing and numeric order-addressing", async () => {
    const client = await createMatrix()
    const from = markMessages()

    sendForce(client, {
      parts: [
        {part: "gluon", op: "replace", path: "/field/2", value: {fields: {"2": 11}}},
        {part: "gluon", op: "replace", path: 17, value: {fields: {method: 11}}},
        {part: "gluon", op: "replace", path: 17, value: {fields: {"1": 11}}},
      ],
    })

    await expectNoParts(client, from)
  })

  test("higgs actor-scope does not update ordinary field as gluon", async () => {
    const client = await createMatrix()
    const fromHiggs = markMessages()

    sendForce(client, {
      parts: [{
        part: "higgs",
        op: "replace",
        path: 17,
        value: {fields: {"2": 11}},
      }],
    })
    await expectNoParts(client, fromHiggs)

    const fromGluon = markMessages()
    sendForce(client, {
      parts: [{
        part: "gluon",
        op: "replace",
        path: 17,
        value: {fields: {"2": 11}},
      }],
    })
    expect(await waitForPart(client, (part) => part.part === "photon", fromGluon)).toEqual({
      part: "photon",
      op: "replace",
      path: 17,
      value: "ready",
    })
  })

  test("higgs actor-scope applies topology-compatible enum field by fieldId", async () => {
    const client = await createMatrix(createProcessReadySnapshot())

    sendForce(client, {
      parts: [{
        part: "higgs",
        op: "replace",
        path: 17,
        value: {fields: {"5": "css"}},
      }],
    })

    const copy = await enterReadyAndCopy(client)
    expect((copy.value as {fields: Record<string, unknown>}).fields["5"]).toBe(1)
  })

  test("higgs remove resets enum field to default enum value", async () => {
    const client = await createMatrix(createProcessReadySnapshot())

    sendForce(client, {
      parts: [{
        part: "higgs",
        op: "replace",
        path: 17,
        value: {fields: {"5": "css"}},
      }],
    })
    sendForce(client, {
      parts: [{
        part: "higgs",
        op: "remove",
        path: 17,
        value: {fields: {"5": true}},
      }],
    })

    const copy = await enterReadyAndCopy(client)
    expect((copy.value as {fields: Record<string, unknown>}).fields["5"]).toBe(0)
  })

  test("higgs remove resets array field to empty array", async () => {
    const client = await createMatrix(createProcessReadySnapshot())

    sendForce(client, {
      parts: [{
        part: "higgs",
        op: "remove",
        path: 17,
        value: {fields: {"9": true}},
      }],
    })

    const copy = await enterReadyAndCopy(client)
    expect((copy.value as {fields: Record<string, unknown>}).fields["9"]).toEqual([])
  })

  test("bare U32 is not topology-compatible and remains gluon-addressed", async () => {
    const higgsClient = await createMatrix(createProcessReadySnapshot())
    sendForce(higgsClient, {
      parts: [{
        part: "higgs",
        op: "replace",
        path: 17,
        value: {fields: {"7": 8}},
      }],
    })
    const higgsCopy = await enterReadyAndCopy(higgsClient)
    expect((higgsCopy.value as {fields: Record<string, unknown>}).fields["7"]).toBe(3)

    const gluonClient = await createMatrix(createProcessReadySnapshot())
    sendForce(gluonClient, {
      parts: [{
        part: "gluon",
        op: "replace",
        path: 17,
        value: {fields: {"7": 8}},
      }],
    })
    const gluonCopy = await enterReadyAndCopy(gluonClient)
    expect((gluonCopy.value as {fields: Record<string, unknown>}).fields["7"]).toBe(8)
  })

  test("higgs class-scope by WIMP SRC does not emit runtime Force messages", async () => {
    const client = await createMatrix()
    const from = markMessages()

    sendForce(client, {
      parts: [{
        part: "higgs",
        op: "replace",
        path: "zavx0z/linux",
        value: {fields: {"5": {key: "method", type: "enum"}}},
      }],
    })

    await expectNoParts(client, from)
  })
})
