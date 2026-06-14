import {force} from "store"

export type PhotonPayload = { value: string; path: string }

export interface DarkPhotonStore {
  messages: PhotonPayload[]
}

export interface DarkPhotonSubscription {
  close(): void
}

export interface DarkElectromagnetismForce {
  emitGluonParts(parts: Array<{ op: "replace"; path: string; value: unknown }>): void
  emitHiggsParts(parts: Array<{ op: "replace"; path: string; value: unknown }>): void
  emitGluonReplace(wimpFieldId: string, value: unknown): void
  emitHiggsReplace(wimpFieldId: string, value: unknown): void
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

const createReplacePart = (wimpFieldId: string, value: unknown): { op: "replace"; path: string; value: unknown } => ({
  op: "replace",
  path: `/field/${wimpFieldId}`,
  value,
})

export const createDarkElectromagnetismForce = (
  options: { channelName?: string } = {},
): DarkElectromagnetismForce => {
  void options
  const emitGluonParts = (parts: Array<{ op: "replace"; path: string; value: unknown }>): void => {
    force.emit({ parts: parts.map((part) => ({ part: "gluon", ...part })) })
  }
  const emitHiggsParts = (parts: Array<{ op: "replace"; path: string; value: unknown }>): void => {
    force.emit({ parts: parts.map((part) => ({ part: "higgs", ...part })) })
  }

  return {
    emitGluonParts,
    emitHiggsParts,
    emitGluonReplace(wimpFieldId, value) {
      emitGluonParts([createReplacePart(wimpFieldId, value)])
    },

    emitHiggsReplace(wimpFieldId, value) {
      emitHiggsParts([createReplacePart(wimpFieldId, value)])
    },

    close() {
      // Store owns force transport lifecycle.
    },
  }
}
