import { describe, expect, test } from "bun:test"

const runProtocolScenario = async <T>(source: string): Promise<T> => {
  const cwd = import.meta.dir ? `${import.meta.dir}/../..` : "."
  const child = Bun.spawn(["bun", "-e", source], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])

  if (exitCode !== 0) {
    throw new Error(stderr || stdout || `Protocol scenario failed with code ${exitCode}`)
  }

  return JSON.parse(stdout) as T
}

describe("boundary <-> dark protocol channels", () => {
  test("Dark Graviton broadcast мутирует gravity$ без rebuild до barrier и потом пересобирает boundary$", async () => {
    const result = await runProtocolScenario<{
      afterAdd: { active: string[]; dirty: boolean; branes: number; mapSize: number }
      afterBarrier: { dirty: boolean; branes: number; rootIndex?: number; childIndex?: number; index0?: string; index1?: string }
      afterRemove: { active: string[]; dirty: boolean; branes: number; rootIndex?: number; childIndex?: number; index0?: string }
    }>(`
      const { createSharedDbFixture } = await import("./fixture/db.fixture.ts")
      const { openSharedDbSqliteBackend, openSharedDbMaterializationWriter } = await import("@shared/db")
      const { createDarkGravityProtocol } = await import("@dark/gravity")
      const { subscribeBoundaryGravityBroadcast, gravity$, boundary$, closeBoundaryProtocolChannels } = await import("./boundary/boundary.ts")

      const nextTick = async () => {
        await Promise.resolve()
        await Bun.sleep(0)
      }

      const waitFor = async (predicate) => {
        for (let attempt = 0; attempt < 50; attempt += 1) {
          if (predicate()) return
          await nextTick()
          await boundaryGravity.flush()
        }

        throw new Error("Gravity protocol scenario timed out")
      }

      const fixture = createSharedDbFixture()
      const backend = openSharedDbSqliteBackend()
      const writer = openSharedDbMaterializationWriter(backend)
      const channelName = "metafor.gravity.test." + crypto.randomUUID()
      const gravityProtocol = createDarkGravityProtocol({ channelName })
      const boundaryGravity = subscribeBoundaryGravityBroadcast(backend, { channelName })

      try {
        fixture.root.save(writer, gravityProtocol)
        fixture.child.save(writer, gravityProtocol)
        await nextTick()
        await boundaryGravity.flush()

        const afterAdd = {
          active: [...gravity$.activeWimpIds],
          dirty: gravity$.structuralDirty,
          branes: boundary$.branes.length,
          mapSize: gravity$.wimpIdToBraneIndex.size,
        }

        gravityProtocol.emitBarrier()
        await nextTick()
        await boundaryGravity.flush()
        await waitFor(() => gravity$.structuralDirty === false && boundary$.branes.length === 2)

        const afterBarrier = {
          dirty: gravity$.structuralDirty,
          branes: boundary$.branes.length,
          rootIndex: gravity$.getBraneIndex(fixture.root.id),
          childIndex: gravity$.getBraneIndex(fixture.child.id),
          index0: gravity$.getWimpId(0),
          index1: gravity$.getWimpId(1),
        }

        gravityProtocol.emitRemove(fixture.child.id)
        await nextTick()
        await boundaryGravity.flush()

        gravityProtocol.emitBarrier()
        await nextTick()
        await boundaryGravity.flush()
        await waitFor(() => gravity$.structuralDirty === false && boundary$.branes.length === 1)

        const afterRemove = {
          active: [...gravity$.activeWimpIds],
          dirty: gravity$.structuralDirty,
          branes: boundary$.branes.length,
          rootIndex: gravity$.getBraneIndex(fixture.root.id),
          childIndex: gravity$.getBraneIndex(fixture.child.id),
          index0: gravity$.getWimpId(0),
        }

        console.log(JSON.stringify({ afterAdd, afterBarrier, afterRemove }))
      } finally {
        await boundaryGravity.close()
        gravityProtocol.close()
        backend.close()
        closeBoundaryProtocolChannels()
      }
    `)

    expect(result.afterAdd.dirty).toBe(true)
    expect(result.afterAdd.branes).toBe(0)
    expect(result.afterAdd.mapSize).toBe(0)
    expect(result.afterAdd.active).toHaveLength(2)

    expect(result.afterBarrier.dirty).toBe(false)
    expect(result.afterBarrier.branes).toBe(2)
    expect(result.afterBarrier.rootIndex).toBe(0)
    expect(result.afterBarrier.childIndex).toBe(1)
    expect(result.afterBarrier.index0).toBe(result.afterAdd.active[0])
    expect(result.afterBarrier.index1).toBe(result.afterAdd.active[1])

    expect(result.afterRemove.active).toEqual([result.afterAdd.active[0]!])
    expect(result.afterRemove.dirty).toBe(false)
    expect(result.afterRemove.branes).toBe(1)
    expect(result.afterRemove.rootIndex).toBe(0)
    expect(result.afterRemove.childIndex).toBeUndefined()
    expect(result.afterRemove.index0).toBe(result.afterAdd.active[0])
  })

  test("Boundary Photon broadcast публикует UUID-addressed state changes и Dark их получает", async () => {
    const result = await runProtocolScenario<{
      changes: Array<[number, number]>
      messages: Array<{
        protocol: string
        channel: string
        boson: string
        source: string
        target: string
        uuid: string
        state: number
      }>
      stateByUuid: Record<string, number>
    }>(`
      const { createSharedDbFixture } = await import("./fixture/db.fixture.ts")
      const { openSharedDbSqliteBackend, openSharedDbMaterializationWriter } = await import("@shared/db")
      const { clearDarkPhotonMessages, darkPhoton$, subscribeDarkPhotons } = await import("@dark/em")
      const {
        addRuntimeWimp,
        configureBoundaryElectromagnetismBroadcast,
        gravity$,
        rebuildRuntime,
        update,
        boundary$,
        closeBoundaryProtocolChannels,
      } = await import("./boundary/boundary.ts")

      const nextTick = async () => {
        await Promise.resolve()
        await Bun.sleep(0)
      }

      clearDarkPhotonMessages()
      const photonChannelName = "metafor.electromagnetism.test." + crypto.randomUUID()
      configureBoundaryElectromagnetismBroadcast({ channelName: photonChannelName })

      const fixture = createSharedDbFixture()
      const backend = openSharedDbSqliteBackend()
      const writer = openSharedDbMaterializationWriter(backend)
      fixture.root.save(writer)
      fixture.child.save(writer)

      const received = []
      const subscription = subscribeDarkPhotons((message) => {
        received.push(message)
      }, { channelName: photonChannelName })

      try {
        addRuntimeWimp(fixture.root.id)
        addRuntimeWimp(fixture.child.id)
        await rebuildRuntime(backend)

        const changes = await update([[gravity$.getBraneIndex(fixture.root.id), [[1, "ready"]]]])
        await nextTick()

        const stateByUuid = Object.fromEntries(
          received.map((message) => [message.uuid, boundary$.states[gravity$.getBraneIndex(message.uuid)]])
        )

        console.log(JSON.stringify({ changes, messages: darkPhoton$.messages, stateByUuid }))
      } finally {
        subscription.close()
        backend.close()
        closeBoundaryProtocolChannels()
      }
    `)

    expect(result.changes.length).toBeGreaterThan(0)
    expect(result.messages).toHaveLength(result.changes.length)

    for (const message of result.messages) {
      expect(message.protocol).toBe("metafor")
      expect(message.channel).toBe("electromagnetism")
      expect(message.boson).toBe("photon")
      expect(message.source).toBe("boundary")
      expect(message.target).toBe("dark")
      expect(typeof message.uuid).toBe("string")
      expect(typeof message.state).toBe("number")
      expect((message as Record<string, unknown>).braneIndex).toBeUndefined()
      expect(result.stateByUuid[message.uuid]).toBe(message.state)
    }
  })
})
