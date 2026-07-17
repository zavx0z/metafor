import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import type {
  ProcessExecutionGrant,
  ProcessResultCommit,
  ProcessResultProposal,
} from "@metafor/types/force/execution"
import type {ForceMessage} from "@metafor/types/force/message"
import type {Particle} from "@metafor/types/force/particle"
import {boundaryEntityId} from "./incremental.ts"
import {open, type BoundaryDatabase} from "./sqlite.ts"

const ROOT = "test/execution"
const INPUT = boundaryEntityId(`${ROOT}/fields/1`)
const OUTPUT = boundaryEntityId(`${ROOT}/fields/2`)
const ERROR = boundaryEntityId(`${ROOT}/fields/3`)
const OPERATION = boundaryEntityId(`${ROOT}/fields/4`)
const PROCESS = boundaryEntityId(`${ROOT}/processes/1`)
const ENERGY = "energy-test"
const HISTORY = "test/execution-history"

type ParticleInput = Omit<Particle, "ts"> & {ts?: number}
const message = (part: ParticleInput): ForceMessage => ({parts: [{ts: 1, ...part}] as [Particle]})

describe("Boundary canonical Process result", () => {
  let boundary: BoundaryDatabase
  let atomId: number

  beforeEach(async () => {
    boundary = await open(":memory:")

    const declarations: ParticleInput[] = [
      {part: "inflaton", op: "add", path: `${ROOT}/meta`, value: {name: "Execution"}},
      {part: "inflaton", op: "add", path: `${ROOT}/fields/1`, value: {key: "input", type: "number", default: 0}},
      {part: "inflaton", op: "add", path: `${ROOT}/fields/2`, value: {key: "output", type: "number", default: 0}},
      {part: "inflaton", op: "add", path: `${ROOT}/fields/3`, value: {key: "error", type: "string", default: ""}},
	  {part: "inflaton", op: "add", path: `${ROOT}/fields/4`, value: {key: "operation", type: "enum", enum: ["start", "history"], default: "start"}},
      {part: "inflaton", op: "add", path: `${ROOT}/states/1`, value: {name: "idle", position: 0}},
      {part: "inflaton", op: "add", path: `${ROOT}/states/2`, value: {name: "ready", position: 1}},
      {
        part: "inflaton",
        op: "add",
        path: `${ROOT}/processes/1`,
        value: {
          key: "ready",
          type: "action",
          env: ["server"],
          action: {src: "./ready.ts", read: ["1"]},
          success: {src: "({update}) => update({output: 2})", read: ["2"], write: ["2", "4"]},
          error: {src: "({update, error}) => update({error: error.message})", read: ["3"], write: ["3"]},
        },
      },
	  {part: "inflaton", op: "add", path: `${HISTORY}/meta`, value: {name: "History"}},
	  {part: "inflaton", op: "add", path: `${ROOT}/matter/1`, value: {
		parent: null,
		edgeSlot: "root",
		position: 0,
		kind: "fuzzy",
		fuzzyKind: "dynamic-meta",
		predicateBinding: {data: "operation", expr: "test/execution-${_[0]}"},
	  }},
	  {part: "inflaton", op: "add", path: `${ROOT}/matter/2`, value: {
		parent: "1",
		edgeSlot: "branch",
		position: 0,
		kind: "wimp",
		src: HISTORY,
	  }},
      {part: "inflaton", op: "test", path: ROOT},
    ]

    for (const part of declarations) await boundary.materialize(message(part))
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
    const row = (await boundary.projection.sql<Array<{valueJson: string}>>`
      SELECT value_json AS valueJson
        FROM boundary_atom_field
       WHERE atom = ${atomId} AND field = ${fieldId}
    `)[0]
    return row ? JSON.parse(row.valueJson) as unknown : undefined
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
