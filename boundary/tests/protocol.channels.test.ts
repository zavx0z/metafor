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
        await fixture.root.save(writer, gravityProtocol)
        await fixture.child.save(writer, gravityProtocol)
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
        value: string
        path: string
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
      const { isPhotonMessage } = await import("@shared/protocol")

      type PhotonMessage = Awaited<typeof import("@shared/protocol")>["PhotonMessage"]

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
      await fixture.root.save(writer)
      await fixture.child.save(writer)

      const received: PhotonMessage[] = []
      const subscription = subscribeDarkPhotons((message) => {
        received.push(message)
      }, { channelName: photonChannelName })

      try {
        addRuntimeWimp(fixture.root.id)
        addRuntimeWimp(fixture.child.id)
        await rebuildRuntime(backend)

        const changes = await update([[gravity$.getBraneIndex(fixture.root.id), [[1, "ready"]]]])
        await nextTick()

        const stateByPath = Object.fromEntries(
          received.map((message) => [message.path, boundary$.states[gravity$.getBraneIndex(message.path)]])
        )

        console.log(JSON.stringify({ changes, messages: received, stateByPath }))
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
      expect(message.target).toBe("broadcast")
      expect(typeof message.value).toBe("string")
      expect(typeof message.path).toBe("string")
      expect((message as Record<string, unknown>).braneIndex).toBeUndefined()
      expect((message as Record<string, unknown>).state).toBeUndefined()
    }
  })

  test("process-state поднимает boundary lock, Bulk координируется через Z и завершает процесс через единый W packet", async () => {
    const result = await runProtocolScenario<{
      photons: Array<{ path: string; value: string; target: string }>
      coordination: Array<{ wimpId: string; processId: string; coordination: string; executorId?: string }>
      rawW?: { boson: string; wimpId: string; processId: string; patchCount: number; hasBraneIndex: boolean }
      beforeResult: { lock: boolean; state: number; output: unknown; processId?: string }
      afterResult: { lock: boolean; state: number; output: unknown; persistedOutput: unknown }
    }>(`
      const { Meta, Wimp, materializeFields } = await import("@dark/strong")
      const { openSharedDbSqliteBackend, openSharedDbMaterializationWriter } = await import("@shared/db")
      const {
        boundary$,
        closeBoundaryProtocolChannels,
        configureBoundaryElectromagnetismBroadcast,
        gravity$,
        strong$,
        subscribeBoundaryWeakResultBroadcast,
        writeRuntimeFromSharedDb,
        setValues,
      } = await import("./boundary/boundary.ts")
      const { createBulkWeakProtocol, subscribeBulkPhotons, subscribeBulkWeakCoordination } = await import("./bulk/em/index.ts")
      const { openWeakWBroadcastChannel, isWMessage } = await import("@shared/protocol")

      const nextTick = async () => {
        await Promise.resolve()
        await Bun.sleep(0)
      }

      const waitFor = async (predicate) => {
        for (let attempt = 0; attempt < 50; attempt += 1) {
          if (predicate()) return
          await nextTick()
          await boundaryWeak.flush()
        }
        throw new Error("Weak process protocol scenario timed out")
      }

      const meta = new Meta({
        src: "meta/process-protocol",
        fieldSchemas: {
          mode: { type: "enum<string>", required: true, values: ["idle", "pending"], default: "idle" },
          output: { type: "string", required: true, default: "" },
        },
        superposition: {
          idle: {
            pending: {
              mode: "pending",
            },
          },
          pending: null,
        },
        processes: {
          pending: {
            type: "action",
            action: {
              src: "() => null",
              read: ["mode"],
            },
            success: {
              src: "({ update }) => update({ output: 'done' })",
              write: ["output"],
            },
            error: {
              src: "({ update }) => update({ output: 'error' })",
              write: ["output"],
            },
          },
        },
      })

      const wimp = new Wimp({ src: meta.src, meta, parent: null })
      wimp.fields = materializeFields(wimp, meta.fields)
      wimp.fields.mode.value = "idle"
      wimp.fields.output.value = ""

      const backend = openSharedDbSqliteBackend()
      const writer = openSharedDbMaterializationWriter(backend)
      await wimp.save(writer)
      await writeRuntimeFromSharedDb(backend)

      const photonChannelName = "metafor.process.photon." + crypto.randomUUID()
      const zChannelName = "metafor.process.z." + crypto.randomUUID()
      const wChannelName = "metafor.process.w." + crypto.randomUUID()
      configureBoundaryElectromagnetismBroadcast({ channelName: photonChannelName })

      const photons = []
      const coordination = []
      const photonSubscription = subscribeBulkPhotons((message) => {
        photons.push({ path: message.path, value: message.value, target: message.target })
      }, { channelName: photonChannelName })
      const coordinationSubscription = subscribeBulkWeakCoordination((message) => {
        coordination.push({
          wimpId: message.wimpId,
          processId: message.processId,
          coordination: message.coordination,
          ...(message.executorId !== undefined ? { executorId: message.executorId } : {}),
        })
      }, { channelName: zChannelName })
      const boundaryWeak = subscribeBoundaryWeakResultBroadcast({ channelName: wChannelName })
      const protocol = createBulkWeakProtocol({ zChannelName, wChannelName })
      const rawWChannel = openWeakWBroadcastChannel({ channelName: wChannelName })

      let rawW
      rawWChannel.onmessage = (event) => {
        if (!isWMessage(event.data)) return
        rawW = {
          boson: event.data.boson,
          wimpId: event.data.wimpId,
          processId: event.data.processId,
          patchCount: event.data.patches.length,
          hasBraneIndex: Object.prototype.hasOwnProperty.call(event.data, "braneIndex"),
        }
      }

      try {
        const processId = backend.readData().metaProcesses.find((row) => row.ownerMetaId === meta.id && row.processKey === "pending")?.id
        if (!processId) {
          throw new Error("Process id is missing for pending state")
        }

        await setValues({ [wimp.fields.mode.id]: "pending" })
        await waitFor(() => photons.length === 1)

        const braneIndex = gravity$.getBraneIndex(wimp.id)
        if (braneIndex === undefined) {
          throw new Error("Brane index is missing for process runtime test")
        }
        const outputFieldIndex = strong$.runtimeFieldIndexByWimpFieldId.get(wimp.fields.output.id)
        if (outputFieldIndex === undefined) {
          throw new Error("Runtime output field index is missing for process runtime test")
        }

        const outputValueBefore = boundary$.getField(braneIndex, outputFieldIndex)?.value
        const beforeResult = {
          lock: boundary$.branes[braneIndex]?.lock ?? false,
          state: boundary$.states[braneIndex] ?? -1,
          output: typeof outputValueBefore === "number" ? boundary$.stringTable[outputValueBefore] : outputValueBefore,
          processId,
        }

        protocol.emitZClaim(wimp.id, processId, "worker-1")
        await waitFor(() => coordination.length === 1)

        protocol.emitWSuccessValues(wimp.id, processId, { [wimp.fields.output.id]: "done" })
        await waitFor(() => (boundary$.branes[braneIndex]?.lock ?? true) === false && rawW !== undefined)

        const outputValueAfter = boundary$.getField(braneIndex, outputFieldIndex)?.value
        const afterResult = {
          lock: boundary$.branes[braneIndex]?.lock ?? true,
          state: boundary$.states[braneIndex] ?? -1,
          output: typeof outputValueAfter === "number" ? boundary$.stringTable[outputValueAfter] : outputValueAfter,
          persistedOutput: backend.readData().fieldValues.find((row) => row.ownerWimpFieldId === wimp.fields.output.id)?.value,
        }

        console.log(JSON.stringify({ photons, coordination, rawW, beforeResult, afterResult }))
      } finally {
        rawWChannel.close()
        await boundaryWeak.close()
        coordinationSubscription.close()
        photonSubscription.close()
        protocol.close()
        backend.close()
        closeBoundaryProtocolChannels()
      }
    `)

    expect(result.photons).toEqual([{ path: expect.any(String), value: "pending", target: "broadcast" }])
    expect(result.photons[0]?.path).toBe(result.rawW?.wimpId)
    expect(result.beforeResult.lock).toBe(true)
    expect(result.beforeResult.state).toBe(1)
    expect(result.beforeResult.output).toBe("")
    expect(result.coordination).toEqual([
      {
        wimpId: result.rawW?.wimpId ?? "",
        processId: result.beforeResult.processId!,
        coordination: "claim",
        executorId: "worker-1",
      },
    ])
    expect(result.rawW).toEqual({
      boson: "w+",
      wimpId: result.photons[0]!.path,
      processId: result.beforeResult.processId!,
      patchCount: 1,
      hasBraneIndex: false,
    })
    expect(result.afterResult.lock).toBe(false)
    expect(result.afterResult.state).toBe(1)
    expect(result.afterResult.output).toBe("done")
    expect(result.afterResult.persistedOutput).toBe("done")
  })

  test("Boundary принимает UUID-addressed Gluon и Higgs patches через отдельные JSON Patch каналы", async () => {
    const result = await runProtocolScenario<{
      aliasValue: unknown
      modeValue: unknown
      rootState: number
      rootWimpStateId?: string
    }>(`
      const { createSharedDbFixture } = await import("./fixture/db.fixture.ts")
      const { openSharedDbSqliteBackend, openSharedDbMaterializationWriter } = await import("@shared/db")
      const { createDarkElectromagnetismProtocol } = await import("@dark/em")
      const {
        writeRuntimeFromSharedDb,
        subscribeBoundaryGluonBroadcast,
        subscribeBoundaryHiggsBroadcast,
        gravity$,
        boundary$,
        closeBoundaryProtocolChannels,
      } = await import("./boundary/boundary.ts")

      const nextTick = async () => {
        await Promise.resolve()
        await Bun.sleep(0)
      }

      const fixture = createSharedDbFixture()
      const backend = openSharedDbSqliteBackend()
      const writer = openSharedDbMaterializationWriter(backend)
      await fixture.root.save(writer)
      await fixture.child.save(writer)
      await writeRuntimeFromSharedDb(backend)

      const gluonChannelName = "metafor.gluon.test." + crypto.randomUUID()
      const higgsChannelName = "metafor.higgs.test." + crypto.randomUUID()
      const protocol = createDarkElectromagnetismProtocol({ gluonChannelName, higgsChannelName })
      const gluon = subscribeBoundaryGluonBroadcast({ channelName: gluonChannelName })
      const higgs = subscribeBoundaryHiggsBroadcast({ channelName: higgsChannelName })

      try {
        protocol.emitGluonReplace(fixture.fields.childAlias!.id, "Alias via gluon")
        protocol.emitHiggsReplace(fixture.fields.rootMode!.id, "ready")
        await nextTick()
        await gluon.flush()
        await higgs.flush()

        const rootBraneIndex = gravity$.getBraneIndex(fixture.root.id)
        const persisted = backend.readData()
        const rootReadyStateId = persisted.metaStates.find(
          (row) => row.ownerMetaId === fixture.root.meta!.id && row.stateName === "ready",
        )?.id

        console.log(JSON.stringify({
          aliasValue: persisted.fieldValues.find((row) => row.ownerWimpFieldId === fixture.fields.childAlias!.id)?.value,
          modeValue: persisted.fieldValues.find((row) => row.ownerWimpFieldId === fixture.fields.rootMode!.id)?.value,
          rootState: boundary$.states[rootBraneIndex],
          rootWimpStateId: persisted.wimpStates.find((row) => row.ownerWimpId === fixture.root.id)?.metaStateId,
        }))
      } finally {
        await gluon.close()
        await higgs.close()
        protocol.close()
        backend.close()
        closeBoundaryProtocolChannels()
      }
    `)

    expect(result.aliasValue).toBe("Alias via gluon")
    expect(result.modeValue).toBe("ready")
    expect(result.rootState).toBe(1)
    expect(result.rootWimpStateId).toBeDefined()
  })
})
