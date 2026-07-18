import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import type {
  ProcessExecutionGrant,
  ProcessResultCommit,
  ProcessResultProposal,
} from "@metafor/types/force/execution"
import type {ForceMessage} from "@metafor/types/force/message"
import type {Particle} from "@metafor/types/force/particle"
import {open, type BoundaryDatabase} from "./sqlite.ts"
import {readBoundaryValue} from "./world.ts"

const ROOT = "test/execution"
const ENERGY = "energy-test"
const HISTORY = "test/execution-history"

type ParticleInput = Omit<Particle, "ts"> & {ts?: number}
const message = (part: ParticleInput): ForceMessage => ({parts: [{ts: 1, ...part}] as [Particle]})

describe("Boundary canonical Process result", () => {
  let boundary: BoundaryDatabase
  let atomId: number
  let INPUT: number
  let OUTPUT: number
  let ERROR: number
  let OPERATION: number
  let PROCESS: number

  beforeEach(async () => {
    boundary = await open(":memory:")

    const declarations: ParticleInput[] = [
      {part: "inflaton", op: "add", path: "wimp", value: {src: ROOT, name: "Execution"}},
      {part: "inflaton", op: "add", path: "field", value: {wimp: ROOT, id: 1, key: "input", type: "number", default: 0}},
      {part: "inflaton", op: "add", path: "field", value: {wimp: ROOT, id: 2, key: "output", type: "number", default: 0}},
      {part: "inflaton", op: "add", path: "field", value: {wimp: ROOT, id: 3, key: "error", type: "string", default: ""}},
      {part: "inflaton", op: "add", path: "field", value: {wimp: ROOT, id: 4, key: "operation", type: "enum", default: "start"}},
      {part: "inflaton", op: "add", path: "variant", value: {wimp: ROOT, id: 1, field: 4, position: 0, value: "start"}},
      {part: "inflaton", op: "add", path: "variant", value: {wimp: ROOT, id: 2, field: 4, position: 1, value: "history"}},
      {part: "inflaton", op: "add", path: "state", value: {wimp: ROOT, id: 1, name: "idle", position: 0}},
      {part: "inflaton", op: "add", path: "state", value: {wimp: ROOT, id: 2, name: "ready", position: 1}},
      {
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
          success: {src: "({update}) => update({output: 2})", read: [2], write: [2, 4]},
          error: {src: "({update, error}) => update({error: error.message})", read: [3], write: [3]},
        },
      },
      {part: "inflaton", op: "add", path: "matter", value: {
        wimp: ROOT,
        id: 1,
        parent: null,
        edgeSlot: "root",
        position: 0,
        kind: "fuzzy",
        fuzzyKind: "dynamic-meta",
        predicateBinding: {data: "operation", expr: "test/execution-${_[0]}"},
      }},
      {part: "inflaton", op: "add", path: "matter", value: {
        wimp: ROOT,
        id: 2,
        parent: 1,
        edgeSlot: "branch",
        position: 0,
        kind: "wimp",
        src: HISTORY,
      }},
      {part: "inflaton", op: "add", path: "wimp", value: {src: HISTORY, name: "History"}},
    ]

    for (const part of declarations) await boundary.materialize(message(part))
    const fields = await boundary.projection.sql<Array<{id: number; localId: number}>>`
      SELECT id, local_id AS localId FROM field WHERE wimp = ${ROOT} ORDER BY local_id
    `
    INPUT = Number(fields.find((field) => Number(field.localId) === 1)?.id)
    OUTPUT = Number(fields.find((field) => Number(field.localId) === 2)?.id)
    ERROR = Number(fields.find((field) => Number(field.localId) === 3)?.id)
    OPERATION = Number(fields.find((field) => Number(field.localId) === 4)?.id)
    PROCESS = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM process WHERE wimp = ${ROOT} AND local_id = 1
    `)[0]?.id)
    const atom = (await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM atom WHERE wimp = ${ROOT} ORDER BY id LIMIT 1
    `)[0]
    if (!atom) throw new Error("Boundary did not materialize root atom")
    atomId = Number(atom.id)
  })

  afterEach(async () => {
    await boundary.close()
  })

  const fieldValue = async (fieldId: number): Promise<unknown> => {
    const row = (await boundary.projection.sql<Array<{value: number}>>`
      SELECT value
        FROM atom_value
       WHERE atom = ${atomId} AND field = ${fieldId}
    `)[0]
    return row ? await readBoundaryValue(boundary.projection.sql, Number(row.value)) : undefined
  }

  const beginExecution = async (processExecutionId: string, energy = ENERGY): Promise<void> => {
    await boundary.materialize(message({
      part: "photon",
      op: "test",
      path: atomId,
      from: processExecutionId,
      value: "ready",
    }))
    const grant: ProcessExecutionGrant = {
      processExecutionId,
      fields: {
        [String(INPUT)]: await fieldValue(INPUT),
        [String(OUTPUT)]: await fieldValue(OUTPUT),
        [String(ERROR)]: await fieldValue(ERROR),
      },
    }
    await boundary.materialize(message({
      part: "z",
      op: "copy",
      path: atomId,
      from: energy,
      value: grant,
    }))
  }

  test("commits declared writes once and emits consequences only after commit", async () => {
    const processExecutionId = "execution-success"
    await beginExecution(processExecutionId)

    const proposal: ProcessResultProposal = {
      processExecutionId,
      processId: PROCESS,
      fields: {[String(OUTPUT)]: 2},
    }
    const commit = await boundary.materialize(message({
      part: "w+",
      op: "replace",
      path: atomId,
      from: ENERGY,
      value: proposal,
    }))

    expect(await fieldValue(OUTPUT)).toBe(2)
    const parts = commit?.messages.map((item) => item.parts[0])
    expect(parts).toHaveLength(2)
    expect(parts?.[0]).toEqual({
      part: "gluon",
      op: "replace",
      path: atomId,
      ts: expect.any(Number),
      from: processExecutionId,
      value: {fields: {[String(OUTPUT)]: 2}},
    })
    const acknowledgement: ProcessResultCommit = {
      processExecutionId,
      processId: PROCESS,
      energy: ENERGY,
    }
    expect(parts?.[1]).toEqual({
      part: "w+",
      op: "copy",
      path: atomId,
      ts: expect.any(Number),
      from: processExecutionId,
      value: acknowledgement,
    })

    expect(await boundary.materialize(message({
      part: "w+",
      op: "replace",
      path: atomId,
      from: ENERGY,
      value: proposal,
    }))).toBeNull()

    await expect(boundary.materialize(message({
      part: "w+",
      op: "replace",
      path: atomId,
      from: ENERGY,
      value: {...proposal, fields: {[String(OUTPUT)]: 3}},
    }))).rejects.toThrow("already committed")
    expect(await fieldValue(OUTPUT)).toBe(2)
  })

  test("rejects undeclared and mismatched writes without partial world mutation", async () => {
    const processExecutionId = "execution-rollback"
    await beginExecution(processExecutionId)

    await expect(boundary.materialize(message({
      part: "w+",
      op: "replace",
      path: atomId,
      from: ENERGY,
      value: {
        processExecutionId,
        processId: PROCESS,
        fields: {
          [String(OUTPUT)]: 2,
          [String(INPUT)]: 9,
        },
      } satisfies ProcessResultProposal,
    }))).rejects.toThrow("cannot write field")
    expect(await fieldValue(INPUT)).toBe(0)
    expect(await fieldValue(OUTPUT)).toBe(0)

    const valid = await boundary.materialize(message({
      part: "w+",
      op: "replace",
      path: atomId,
      from: ENERGY,
      value: {
        processExecutionId,
        processId: PROCESS,
        fields: {[String(OUTPUT)]: 2},
      } satisfies ProcessResultProposal,
    }))
    expect(valid?.messages).toHaveLength(2)
    expect(await fieldValue(OUTPUT)).toBe(2)

    const wrongEnergyExecution = "execution-wrong-energy"
    await beginExecution(wrongEnergyExecution)
    await expect(boundary.materialize(message({
      part: "w+",
      op: "replace",
      path: atomId,
      from: "energy-other",
      value: {
        processExecutionId: wrongEnergyExecution,
        processId: PROCESS,
        fields: {[String(OUTPUT)]: 4},
      } satisfies ProcessResultProposal,
    }))).rejects.toThrow("does not match selected execution")
    expect(await fieldValue(OUTPUT)).toBe(2)
  })

  test("commits error handler writes through the same transaction path", async () => {
    const processExecutionId = "execution-error"
    await beginExecution(processExecutionId)

    const commit = await boundary.materialize(message({
      part: "w-",
      op: "replace",
      path: atomId,
      from: ENERGY,
      value: {
        processExecutionId,
        processId: PROCESS,
        error: "boom",
        fields: {[String(ERROR)]: "boom"},
      } satisfies ProcessResultProposal,
    }))

    expect(await fieldValue(ERROR)).toBe("boom")
    expect(commit?.messages.at(-1)?.parts[0]).toEqual({
      part: "w-",
      op: "copy",
      path: atomId,
      ts: expect.any(Number),
      from: processExecutionId,
      value: {
        processExecutionId,
        processId: PROCESS,
        energy: ENERGY,
      },
    })
  })

	test("materializes Fuzzy children in the same Process commit as an enum write", async () => {
		const processExecutionId = "execution-topology"
		await beginExecution(processExecutionId)

		const commit = await boundary.materialize(message({
			part: "w+",
			op: "replace",
			path: atomId,
			from: ENERGY,
			value: {
				processExecutionId,
				processId: PROCESS,
				fields: {[String(OPERATION)]: "history"},
			} satisfies ProcessResultProposal,
		}))

		expect(await fieldValue(OPERATION)).toBe("history")
		expect((await boundary.projection.sql<Array<{wimp: string}>>`
			SELECT wimp FROM atom WHERE wimp = ${HISTORY}
		`)).toEqual([{wimp: HISTORY}])
		expect(commit?.messages.some((item) => item.parts[0]?.part === "graviton" && item.parts[0]?.op === "add")).toBe(true)
	})
})
