import {force, type ForceSurface} from "boundary"
import {flattenEnergyData, type Data} from "@energy/gravity"
import {gravity$} from "@energy/gravity/store.ts"
import {assembleStoredEnergyData, createStoredStringInterner, normalizeFieldValue, strong$} from "@energy/strong"
import {weak$, weakHeapUpdate, weakInit, weakRunStep} from "@energy/weak"
import {energy$} from "./store"
import type {PreparedData} from "./energy.t"

;(globalThis as typeof globalThis & {force: ForceSurface}).force = force

type EnergyRuntimeSnapshot = {
  ok: true
  version: 1
  wimpIds: string[]
  data: Data
  strong: {
    runtimeFieldIndexByWimpFieldId: Array<[string, number]>
    wimpFieldIdsByRuntimeFieldIndex: string[][]
    braneIndexByWimpFieldId: Array<[string, number]>
    topologyWimpFieldIds: string[]
  }
  weak: {
    stateMetaStateIdsByBraneIndex: string[][]
    stateProcessIdsByBraneIndex: Array<Array<string | null | undefined>>
  }
}

const darkRuntimeUrl = process.env.ENERGY_DARK_RUNTIME_URL ?? "http://127.0.0.1:7101/energy/runtime"

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const applyPreparedData = (prepared: PreparedData): void => {
  energy$.fields = prepared.fields
  energy$.stringTable = prepared.stringTable
  energy$.sharedBlocks = prepared.sharedBlocks
  energy$.sharedValues = prepared.sharedValues
  energy$.branes = prepared.branes
  energy$.braneValues = prepared.braneValues
  energy$.braneSharedBlockRefs = prepared.braneSharedBlockRefs
  energy$.stateTable = prepared.stateTable
  energy$.transitions = prepared.transitions
  energy$.conditions = prepared.conditions
  energy$.states = prepared.states
  energy$.stateNames = prepared.stateNames
}

const loadRuntimeSnapshot = async (snapshot: EnergyRuntimeSnapshot): Promise<void> => {
  const prepared = assembleStoredEnergyData(flattenEnergyData(snapshot.data))
  applyPreparedData(prepared)

  if (prepared.fields.length > 0 || prepared.branes.length > 0) {
    await weakInit(energy$)
  } else {
    weak$.reset()
  }

  gravity$.activeWimpIds = [...snapshot.wimpIds]
  gravity$.braneIndexToWimpId = [...snapshot.wimpIds]
  gravity$.wimpIdToBraneIndex = new Map(snapshot.wimpIds.map((wimpId, braneIndex) => [wimpId, braneIndex] as const))
  gravity$.structuralDirty = false

  strong$.runtimeFieldIndexByWimpFieldId = new Map(snapshot.strong.runtimeFieldIndexByWimpFieldId)
  strong$.wimpFieldIdsByRuntimeFieldIndex = snapshot.strong.wimpFieldIdsByRuntimeFieldIndex.map((ids) => [...ids])
  strong$.braneIndexByWimpFieldId = new Map(snapshot.strong.braneIndexByWimpFieldId)
  strong$.topologyWimpFieldIds = new Set(snapshot.strong.topologyWimpFieldIds)

  weak$.stateMetaStateIdsByBraneIndex = snapshot.weak.stateMetaStateIdsByBraneIndex.map((ids) => [...ids])
  weak$.stateProcessIdsByBraneIndex = snapshot.weak.stateProcessIdsByBraneIndex.map((ids) =>
    ids.map((id) => id ?? undefined),
  )
}

const loadRuntimeFromDark = async (): Promise<void> => {
  let attempt = 0
  for (;;) {
    attempt += 1
    try {
      const response = await fetch(darkRuntimeUrl)
      if (!response.ok) throw new Error(`Dark runtime snapshot HTTP ${response.status}`)
      const snapshot = await response.json() as EnergyRuntimeSnapshot | {ok: false; error?: string}
      if (snapshot.ok !== true) throw new Error(snapshot.error ?? "Dark runtime snapshot failed")
      await loadRuntimeSnapshot(snapshot)
      console.log(`[energy] runtime loaded from ${darkRuntimeUrl}: branes=${energy$.branes.length}, fields=${energy$.fields.length}`)
      return
    } catch (error) {
      if (attempt === 1 || attempt % 10 === 0) {
        console.warn(`[energy] waiting Dark runtime at ${darkRuntimeUrl}: ${error instanceof Error ? error.message : String(error)}`)
      }
      await delay(Math.min(3000, 200 + attempt * 100))
    }
  }
}

const partFieldId = (path: string): string => path.startsWith("/field/") ? path.slice("/field/".length) : path

const applyRuntimeValueParts = async (parts: Array<{part: string; op: string; path: string; value?: unknown}>): Promise<void> => {
  if (!weak$.initialized) return

  const stringInterner = createStoredStringInterner(energy$.stringTable)
  const updates: Array<{kind: "field"; braneIndex: number; fieldIndex: number}> = []

  for (const part of parts) {
    if ((part.part !== "gluon" && part.part !== "higgs") || part.op !== "replace") continue

    const wimpFieldId = partFieldId(part.path)
    const braneIndex = strong$.braneIndexByWimpFieldId.get(wimpFieldId)
    const fieldIndex = strong$.runtimeFieldIndexByWimpFieldId.get(wimpFieldId)
    if (braneIndex === undefined || fieldIndex === undefined) continue

    const field = energy$.fields[fieldIndex]
    const record = energy$.getField(braneIndex, fieldIndex)
    if (!field || !record) continue

    record.value = normalizeFieldValue(part.value, field, stringInterner)
    updates.push({kind: "field", braneIndex, fieldIndex})
  }

  if (updates.length === 0) return
  weakHeapUpdate(updates)
  const changes = await weakRunStep()
  for (const [braneIndex, stateIndex] of changes) {
    const wimpId = gravity$.getWimpId(braneIndex)
    const stateName = energy$.getStateName(braneIndex, stateIndex)
    if (wimpId !== undefined && stateName !== undefined) {
      force.emit({parts: [{part: "photon", op: "replace", path: wimpId, value: stateName}]})
    }
  }
}

force.observe((event) => {
  void applyRuntimeValueParts(event.data.parts as Array<{part: string; op: string; path: string; value?: unknown}>).catch((error) => {
    console.error(`[energy] force message failed: ${error instanceof Error ? error.message : String(error)}`)
  })
})

void loadRuntimeFromDark()

const shutdown = (): void => {
  force.close()
  process.exit(0)
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
