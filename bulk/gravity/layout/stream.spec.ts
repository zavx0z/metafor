import { describe, expect, test } from "bun:test"
import type { BulkDarkParticle, BulkDarkParticleInput, BulkFieldParticle, BulkManifestSink } from "@metafor/types/bulk"
import { streamBulkManifest } from "./stream"

const createFieldParticle = (fieldParticleId: number) => ({
  fieldParticleId,
  fieldId: fieldParticleId,
  fieldKey: String(fieldParticleId),
  fieldLabel: String(fieldParticleId),
  fieldParticleKind: "string" as const,
  valueText: String(fieldParticleId),
  colorR: 1,
  colorG: 1,
  colorB: 1,
})

const createDarkParticle = (
  darkParticleId: number,
  children: BulkDarkParticleInput[] = [],
  fieldParticleIds: number[] = [],
): BulkDarkParticleInput => ({
  darkParticleId,
  darkParticleKind: "wimp",
  src: String(darkParticleId),
  metaSrc: String(darkParticleId),
  label: String(darkParticleId),
  colorR: 0.4,
  colorG: 0.45,
  colorB: 0.98,
  fieldParticles: fieldParticleIds.map(createFieldParticle),
  children,
})

interface CapturedSink extends BulkManifestSink {
  events: Array<{ kind: "clear" | "darkParticle" | "fieldParticle"; rootSrc: string; item?: BulkDarkParticle | BulkFieldParticle }>
}

const createCapturingSink = (): CapturedSink => {
  const events: CapturedSink["events"] = []
  return {
    events,
    async clearManifest(rootSrc) {
      events.push({ kind: "clear", rootSrc })
    },
    async insertDarkParticle(rootSrc, item) {
      events.push({ kind: "darkParticle", rootSrc, item })
    },
    async insertFieldParticle(rootSrc, item) {
      events.push({ kind: "fieldParticle", rootSrc, item })
    },
  }
}

describe("bulk/gravity/layout streamBulkManifest", () => {
  test("первое событие — clear manifest, дальше идут Dark particles, потом Field particles", async () => {
    const sink = createCapturingSink()
    await streamBulkManifest(
      "root",
      [
        createDarkParticle(1, [createDarkParticle(2, [], [102])], [101]),
      ],
      {},
      sink,
    )

    expect(sink.events.length).toBeGreaterThan(0)
    expect(sink.events[0]?.kind).toBe("clear")
    expect(sink.events.every((event) => event.rootSrc === "root")).toBe(true)

    const darkParticleEvents = sink.events.filter((event) => event.kind === "darkParticle")
    const fieldParticleEvents = sink.events.filter((event) => event.kind === "fieldParticle")
    expect(darkParticleEvents.map((event) => (event.item as BulkDarkParticle).darkParticleId)).toEqual([
      1,
      2,
    ])
    expect(fieldParticleEvents.map((event) => (event.item as BulkFieldParticle).fieldParticleId).sort()).toEqual([
      101,
      102,
    ])
    expect(fieldParticleEvents.map((event) => (event.item as BulkFieldParticle).fieldId).sort()).toEqual([
      101,
      102,
    ])
  })

  test("без inputs всё равно публикует clear manifest", async () => {
    const sink = createCapturingSink()
    await streamBulkManifest("empty", [], {}, sink)

    expect(sink.events).toEqual([{ kind: "clear", rootSrc: "empty" }])
  })
})
