import {force} from "boundary"
import type { DarkElectromagnetismForce, DarkPhotonStore, DarkPhotonSubscription } from "@metafor/types/force/channel"
import type { DarkGluonPatchPart, DarkHiggsPatchPart, RuntimeFieldPatchValue } from "@metafor/types/force/fields"
import type { PhotonPayload } from "@metafor/types/force/particle"

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
