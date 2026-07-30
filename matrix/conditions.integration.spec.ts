import {afterEach, describe, expect, test} from "bun:test"
import type {MetaDSL} from "@metafor/types/metafor/schema"
import type {Particle} from "shared/protocol/force/particle"
import {normalizeMetaTemplateV1} from "../dark/meta-json.ts"
import {createForceTestFixture} from "../dark/force/fixture.ts"
import {open, type BoundaryDatabase} from "../boundary/sqlite.ts"
import {matrix$} from "./store.ts"
import {prepareMatrixBirthFixture} from "./tests/shared/fixtures.ts"
import {weak$} from "./weak"

const ROOT = "example/condition-path"
type ParticleInput = Omit<Particle, "ts"> & {ts?: number}

const declaration: MetaDSL = {
  name: "Condition path",
  fields: [
    {key: "title", type: "string", required: true, default: "Ready"},
    {key: "code", type: "string", required: true, default: "OK"},
    {key: "items", type: "array", required: true, default: [1, 2, 3], data: "number"},
    {key: "exact", type: "array", required: true, default: [1, 2], data: "number"},
    {key: "count", type: "number", required: true, default: 10},
    {key: "enabled", type: "boolean", required: true, default: true},
    {key: "mode", type: "enum", required: true, default: "idle", values: ["idle", "ready"]},
    {key: "zero", type: "number", required: true, default: 0},
  ],
  superposition: [
    {
      name: "idle",
      transitions: {
        ready: {
          title: {
            startsWith: "Re",
            pattern: /^ready$/i,
            length: {min: 5, max: 5},
          },
          code: /^ok$/i,
          items: {
            length: {min: 3, max: 3},
            notIncludes: 9,
            every: {gte: 1},
            some: {gt: 2},
          },
          exact: [1, 2],
          count: {notGt: 10, gte: 10},
          enabled: {logicalEq: true},
          mode: {oneOf: ["idle"]},
          zero: {null: false, eq: 0},
        },
      },
    },
    {name: "ready", transitions: null},
  ],
  mass: [],
  processes: [],
}

describe("MetaJSON → Boundary → Matrix Conditions", () => {
  let boundary: BoundaryDatabase | null = null

  afterEach(async () => {
    weak$.dispose()
    if (boundary) await boundary.close()
    boundary = null
  })

  test("сохраняет весь публичный язык и выполняет один и тот же Transition", async () => {
    const template = normalizeMetaTemplateV1(declaration, ROOT)
    boundary = await open(":memory:")

    const apply = async (part: ParticleInput): Promise<void> => {
      await boundary!.materialize({parts: [{ts: 1, ...part}] as [Particle]})
    }

    await apply({
      part: "inflaton",
      op: "add",
      path: "wimp",
      value: {src: ROOT, name: template.name},
    })

    const fieldIdByKey = new Map<string, number>()
    let variantId = 1
    for (let index = 0; index < template.fields.length; index++) {
      const field = template.fields[index]!
      const id = index + 1
      fieldIdByKey.set(field.key, id)
      await apply({
        part: "inflaton",
        op: "add",
        path: "field",
        value: {wimp: ROOT, id, position: index, ...field},
      })
      if (field.type === "enum") {
        for (let position = 0; position < field.values.length; position++) {
          await apply({
            part: "inflaton",
            op: "add",
            path: "variant",
            value: {
              wimp: ROOT,
              id: variantId++,
              field: id,
              position,
              value: field.values[position],
            },
          })
        }
      }
    }

    for (let index = 0; index < template.superposition.length; index++) {
      await apply({
        part: "inflaton",
        op: "add",
        path: "state",
        value: {
          wimp: ROOT,
          id: index + 1,
          name: template.superposition[index]!.name,
          position: index,
        },
      })
    }

    const wave = template.superposition[0]!.transitions!.ready!
    await apply({
      part: "inflaton",
      op: "add",
      path: "transition",
      value: {wimp: ROOT, id: 1, from: 1, to: 2, position: 0},
    })
    let conditionId = 1
    for (const [key, predicate] of Object.entries(wave)) {
      await apply({
        part: "inflaton",
        op: "add",
        path: "condition",
        value: {
          wimp: ROOT,
          id: conditionId++,
          transition: 1,
          field: fieldIdByKey.get(key),
          position: conditionId - 2,
          predicate,
        },
      })
    }
    await apply({
      part: "inflaton",
      op: "add",
      path: "process",
      value: {
        wimp: ROOT,
        id: 1,
        key: "ready",
        type: "action",
        env: ["server"],
        action: {src: "./ready.ts", read: [1]},
        success: {src: "() => {}", read: [], write: []},
      },
    })

    const atomId = (await boundary.initialState()).atoms[0]!.id
    await apply({part: "photon", op: "replace", path: atomId, value: "idle"})
    const zeroFieldBeforeBirth = (await boundary.initialState()).declarations.find(
      (item) => item.section === "fields" && item.value.key === "zero",
    )?.value.id
    if (typeof zeroFieldBeforeBirth !== "number") {
      throw new Error("zero Field was not materialized")
    }
    await apply({
      part: "gluon",
      op: "replace",
      path: atomId,
      value: {fields: {[String(zeroFieldBeforeBirth)]: 1}},
    })
    const initial = await boundary.initialState()

    const predicates = initial.declarations
      .filter((item) => item.section === "conditions")
      .map((item) => item.value.predicate)
    expect(predicates).toContainEqual({
      startsWith: "Re",
      pattern: {source: "^ready$", flags: "i"},
      length: {min: 5, max: 5},
    })
    expect(predicates).toContainEqual({
      pattern: {source: "^ok$", flags: "i"},
    })
    expect(predicates).toContainEqual({
      length: {min: 3, max: 3},
      notInclude: 9,
      every: {gte: 1},
      some: {gt: 2},
    })

    await prepareMatrixBirthFixture(initial)
    expect(matrix$.conditions.length).toBeGreaterThan(6)

    const previousBackend = Bun.env.METAFOR_WEAK_BACKEND
    Bun.env.METAFOR_WEAK_BACKEND = "cpu"
    const force = createForceTestFixture()
    try {
      await prepareMatrixBirthFixture(initial)
      const waiting = force.nextClient("matrix")
      const runtime = await import(`./matrix.ts?conditions-path=${crypto.randomUUID()}`)
      const client = await waiting
      expect(runtime.matrix$.getStateName(0, runtime.matrix$.states[0]!)).toBe("idle")

      const zeroField = initial.declarations.find(
        (item) => item.section === "fields" && item.value.key === "zero",
      )?.value.id
      if (typeof zeroField !== "number") throw new Error("zero Field was not materialized")
      const fromUpdate = force.messages.length
      force.impulse(client, {
        parts: [{
          ts: 2,
          part: "gluon",
          op: "replace",
          path: atomId,
          by: "boundary",
          value: {fields: {[String(zeroField)]: 0}},
        }],
      })
      const ready = await force.waitForMessage(
        (message) =>
          message.client === client &&
          message.message.parts[0]?.part === "photon" &&
          message.message.parts[0]?.value === "ready",
        fromUpdate,
      )
      expect(ready.message.parts[0]).toMatchObject({
        part: "photon",
        op: "test",
        path: atomId,
        value: "ready",
        from: expect.any(String),
      })
      expect(runtime.matrix$.branes[0]?.lock).toBe(true)
    } finally {
      force.close()
      if (previousBackend === undefined) delete Bun.env.METAFOR_WEAK_BACKEND
      else Bun.env.METAFOR_WEAK_BACKEND = previousBackend
    }
  })

  test("неизвестная операция не превращает Transition в безусловный", async () => {
    boundary = await open(":memory:")
    const apply = async (part: ParticleInput): Promise<void> => {
      await boundary!.materialize({parts: [{ts: 1, ...part}] as [Particle]})
    }
    await apply({part: "inflaton", op: "add", path: "wimp", value: {src: ROOT, name: "Invalid"}})
    await apply({
      part: "inflaton",
      op: "add",
      path: "field",
      value: {wimp: ROOT, id: 1, key: "value", type: "number", required: true, default: 0},
    })
    await apply({part: "inflaton", op: "add", path: "state", value: {wimp: ROOT, id: 1, name: "idle", position: 0}})
    await apply({part: "inflaton", op: "add", path: "state", value: {wimp: ROOT, id: 2, name: "ready", position: 1}})
    await apply({
      part: "inflaton",
      op: "add",
      path: "transition",
      value: {wimp: ROOT, id: 1, from: 1, to: 2, position: 0},
    })

    await expect(apply({
      part: "inflaton",
      op: "add",
      path: "condition",
      value: {
        wimp: ROOT,
        id: 1,
        transition: 1,
        field: 1,
        position: 0,
        predicate: {unknown: 1},
      },
    })).rejects.toThrow()

    await expect(apply({
      part: "inflaton",
      op: "add",
      path: "condition",
      value: {
        wimp: ROOT,
        id: 2,
        transition: 1,
        field: 1,
        position: 0,
        predicate: {},
      },
    })).rejects.toThrow("at least one operator")

    await apply({
      part: "inflaton",
      op: "add",
      path: "condition",
      value: {
        wimp: ROOT,
        id: 3,
        transition: 1,
        field: 1,
        position: 0,
        predicate: {startsWith: "1"},
      },
    })
    await expect(prepareMatrixBirthFixture(await boundary.initialState()))
      .rejects.toThrow("not valid for Field type")
  })
})
