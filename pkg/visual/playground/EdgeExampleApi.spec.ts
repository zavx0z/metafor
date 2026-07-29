import {afterEach, describe, expect, test} from "bun:test"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {EDGE_EXAMPLE_SCHEMA} from "./EdgeExample.ts"
import {createEdgeExampleApi} from "./EdgeExampleApi.ts"

const directories: string[] = []

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, {force: true, recursive: true})
    ),
  )
})

const draft = {
  createdAt: "2026-07-29T02:00:00.000Z",
  input: {
    centerDistance: 152,
    clearance: 3,
    extraLift: 0,
    leftSphereX: 1.2,
    leftSphereY: -0.4,
    leftTorusScale: 0.75,
    rightSphereX: -2.1,
    rightSphereY: 0.8,
    rightTorusScale: 1.5,
    sphereRadius: 2.5,
    torusRadius: 27.78,
    torusTube: 22.22,
  },
  schema: EDGE_EXAMPLE_SCHEMA,
  sourceVariant: "source-sink",
} as const

describe("Edges saved-example REST API", () => {
  test("stores one input set for every Edges algorithm to reuse", async () => {
    const directory = await mkdtemp(join(tmpdir(), "metafor-edge-example-"))
    directories.push(directory)
    const api = createEdgeExampleApi(directory)

    const created = await api(new Request(
      "http://localhost/api/edge-examples",
      {
        body: JSON.stringify(draft),
        headers: {"content-type": "application/json"},
        method: "POST",
      },
    ))
    expect(created?.status).toBe(201)
    const stored = await created!.json()
    expect(stored).toMatchObject(draft)
    expect(stored.id).toMatch(/^[a-z0-9-]+$/)

    const list = await api(new Request(
      "http://localhost/api/edge-examples",
    ))
    expect(await list?.json()).toEqual([stored])

    const exact = await api(new Request(
      `http://localhost/api/edge-examples/${stored.id}`,
    ))
    expect(await exact?.json()).toEqual(stored)
  })

  test("rejects incomplete parameter sets", async () => {
    const directory = await mkdtemp(join(tmpdir(), "metafor-edge-example-"))
    directories.push(directory)
    const api = createEdgeExampleApi(directory)
    const response = await api(new Request(
      "http://localhost/api/edge-examples",
      {
        body: JSON.stringify({...draft, input: {centerDistance: 100}}),
        headers: {"content-type": "application/json"},
        method: "POST",
      },
    ))

    expect(response?.status).toBe(400)
    expect(await response?.json()).toEqual({
      error: "invalid_example_contract",
    })
  })
})
