import {
  ELECTROMAGNETISM_BROADCAST_CHANNEL,
  GLUON_BROADCAST_CHANNEL,
  HIGGS_BROADCAST_CHANNEL,
} from "../../protocol.ts"

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
  const channel = new BroadcastChannel(options.channelName ?? ELECTROMAGNETISM_BROADCAST_CHANNEL)

  channel.onmessage = (event: MessageEvent<PhotonPayload>) => {
    const message = event.data

    darkPhoton$.messages.push(message)
    listener?.(message)
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
  options: { gluonChannelName?: string; higgsChannelName?: string } = {},
): DarkElectromagnetismProtocol => {
  const gluon = new BroadcastChannel(options.gluonChannelName ?? GLUON_BROADCAST_CHANNEL)
  const higgs = new BroadcastChannel(options.higgsChannelName ?? HIGGS_BROADCAST_CHANNEL)
  const emitGluonPatches = (patches: Array<{ op: "replace"; path: string; value: unknown }>): void => {
    if (patches.length === 0) return
    gluon.postMessage({ patches })
  }
  const emitHiggsPatches = (patches: Array<{ op: "replace"; path: string; value: unknown }>): void => {
    if (patches.length === 0) return
    higgs.postMessage({ patches })
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
      gluon.close()
      higgs.close()
    },
  }
}
