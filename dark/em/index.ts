import {force} from "boundary"
import type {PhotonPayload} from "@metafor/types/force"

type RuntimeFieldPatchValue = { fields: Record<string, unknown> }
type DarkGluonPatchPart = { op: "replace" | "remove"; path: number; value: RuntimeFieldPatchValue }
type DarkHiggsPatchPart = { op: "replace" | "remove"; path: number | string; value: RuntimeFieldPatchValue }

export interface DarkPhotonStore {
  messages: PhotonPayload[]
}

export interface DarkPhotonSubscription {
  close(): void
}

export interface DarkElectromagnetismForce {
  emitGluonParts(parts: DarkGluonPatchPart[]): void
  emitHiggsParts(parts: DarkHiggsPatchPart[]): void
  emitGluonReplace(actorId: number, fieldId: number, value: unknown): void
  emitHiggsReplace(path: number | string, fieldId: number, value: unknown): void
  close(): void
}

export const darkPhoton$: DarkPhotonStore = {
  messages: [],
}

export const clearDarkPhotonPayloads = (): void => {
  darkPhoton$.messages = []
}

export const subscribeDarkPhotons = (
  listener?: (message: PhotonPayload) => void,
  options: { channelName?: string } = {},
): DarkPhotonSubscription => {
  void options

  const subscription = force.observe((event) => {
    for (const part of event.data.parts) {
      if (part.part !== "photon") continue
      const message: PhotonPayload = { path: part.path, value: String(part.value ?? "") }

      darkPhoton$.messages.push(message)
      listener?.(message)
    }
  })

  return {
    close() {
      subscription.close()
    },
  }
}

const createRuntimeFieldPatchValue = (fieldId: number, value: unknown): RuntimeFieldPatchValue => ({
  fields: {
    [String(fieldId)]: value,
  },
})

const createGluonReplacePart = (actorId: number, fieldId: number, value: unknown): DarkGluonPatchPart => ({
  op: "replace",
  path: actorId,
  value: createRuntimeFieldPatchValue(fieldId, value),
})

const createHiggsReplacePart = (path: number | string, fieldId: number, value: unknown): DarkHiggsPatchPart => ({
  op: "replace",
  path,
  value: createRuntimeFieldPatchValue(fieldId, value),
})

export const createDarkElectromagnetismForce = (
  options: { channelName?: string } = {},
): DarkElectromagnetismForce => {
  void options
  const emitGluonParts = (parts: DarkGluonPatchPart[]): void => {
    force.emit({ parts: parts.map((part) => ({ part: "gluon", ...part })) })
  }
  const emitHiggsParts = (parts: DarkHiggsPatchPart[]): void => {
    force.emit({ parts: parts.map((part) => ({ part: "higgs", ...part })) })
  }

  return {
    emitGluonParts,
    emitHiggsParts,
    emitGluonReplace(actorId, fieldId, value) {
      emitGluonParts([createGluonReplacePart(actorId, fieldId, value)])
    },

    emitHiggsReplace(path, fieldId, value) {
      emitHiggsParts([createHiggsReplacePart(path, fieldId, value)])
    },

    close() {
      // Boundary owns force transport lifecycle.
    },
  }
}
