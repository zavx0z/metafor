import { describe, expect, test } from "bun:test"
import type { DbFieldOrbitRow, DbParticleShellRow } from "@boundary/actor"
import { streamDbWorldRows, type DbWorldRowSink } from "./stream"
import type { DbWorldParticleDescriptor } from "./snapshot"

const createField = (id: string) => ({
  id,
  fieldKey: id,
  fieldLabel: id,
  fieldValueKind: "text" as const,
  valueText: id,
  colorR: 1,
  colorG: 1,
  colorB: 1,
})

const createParticle = (
  particleId: string,
  children: DbWorldParticleDescriptor[] = [],
  fieldIds: string[] = [],
): DbWorldParticleDescriptor => ({
  particleId,
  kind: "wimp",
  src: particleId,
  metaSrc: particleId,
  label: particleId,
  colorR: 0.4,
  colorG: 0.45,
  colorB: 0.98,
  fields: fieldIds.map(createField),
  children,
})

interface CapturedSink extends DbWorldRowSink {
  events: Array<{ kind: "clear" | "particle" | "field"; rootSrc: string; row?: DbParticleShellRow | DbFieldOrbitRow }>
}

const createCapturingSink = (): CapturedSink => {
  const events: CapturedSink["events"] = []
  return {
    events,
    async clearWorld(rootSrc) {
      events.push({ kind: "clear", rootSrc })
    },
    async insertParticleShell(rootSrc, row) {
      events.push({ kind: "particle", rootSrc, row })
    },
    async insertFieldOrbit(rootSrc, row) {
      events.push({ kind: "field", rootSrc, row })
    },
  }
}

describe("bulk/gravity/layout streamDbWorldRows", () => {
  test("первое событие — clear-world, дальше идут particles, потом fields", async () => {
    const sink = createCapturingSink()
    await streamDbWorldRows(
      "root",
      [
        createParticle("root", [createParticle("child", [], ["leaf-field"])], ["root-field"]),
      ],
      {},
      sink,
    )

    expect(sink.events.length).toBeGreaterThan(0)
    expect(sink.events[0]?.kind).toBe("clear")
    expect(sink.events.every((e) => e.rootSrc === "root")).toBe(true)

    const particleEvents = sink.events.filter((e) => e.kind === "particle")
    const fieldEvents = sink.events.filter((e) => e.kind === "field")
    expect(particleEvents.map((e) => (e.row as DbParticleShellRow).particleId)).toEqual([
      "root",
      "child",
    ])
    expect(fieldEvents.map((e) => (e.row as DbFieldOrbitRow).id).sort()).toEqual([
      "leaf-field",
      "root-field",
    ])
  })

  test("без descriptors всё равно публикует clear-world", async () => {
    const sink = createCapturingSink()
    await streamDbWorldRows("empty", [], {}, sink)

    expect(sink.events).toEqual([{ kind: "clear", rootSrc: "empty" }])
  })
})
