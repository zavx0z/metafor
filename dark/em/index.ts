import { createProtocolChannel } from "store/protocol"

export type PhotonPayload = { value: string; path: string }

export interface DarkPhotonStore {
  messages: PhotonPayload[]
}

export interface DarkPhotonSubscription {
  close(): void
}

export interface DarkElectromagnetismProtocol {
  emitGluonPatches(patches: Array<{ op: "replace"; path: string; value: unknown }>): void
  emitHiggsPatches(patches: Array<{ op: "replace"; path: string; value: unknown }>): void
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
  const channel = createProtocolChannel(options.channelName)

  channel.onmessage = (event) => {
    for (const patch of event.data.patches) {
      if (patch.part !== "photon") continue
      const message: PhotonPayload = { path: patch.path, value: String(patch.value ?? "") }

      darkPhoton$.messages.push(message)
      listener?.(message)
    }
  }

  return {
    close() {
      channel.close()
    },
  }
}

const createReplacePatch = (wimpFieldId: string, value: unknown): { op: "replace"; path: string; value: unknown } => ({
  op: "replace",
  path: `/field/${wimpFieldId}`,
  value,
})

export const createDarkElectromagnetismProtocol = (
  options: { channelName?: string } = {},
): DarkElectromagnetismProtocol => {
  const channel = createProtocolChannel(options.channelName)
  const emitGluonPatches = (patches: Array<{ op: "replace"; path: string; value: unknown }>): void => {
    channel.postMessage({ patches: patches.map((patch) => ({ part: "gluon", ...patch })) })
  }
  const emitHiggsPatches = (patches: Array<{ op: "replace"; path: string; value: unknown }>): void => {
    channel.postMessage({ patches: patches.map((patch) => ({ part: "higgs", ...patch })) })
  }

  return {
    emitGluonPatches,
    emitHiggsPatches,
    emitGluonReplace(wimpFieldId, value) {
      emitGluonPatches([createReplacePatch(wimpFieldId, value)])
    },

    emitHiggsReplace(wimpFieldId, value) {
      emitHiggsPatches([createReplacePatch(wimpFieldId, value)])
    },

    close() {
      channel.close()
    },
  }
}
