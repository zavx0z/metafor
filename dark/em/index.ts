import {
  isPhotonMessage,
  openElectromagnetismBroadcastChannel,
  openGluonBroadcastChannel,
  openHiggsBroadcastChannel,
  type PhotonMessage,
  type ProtocolChannelOptions,
  type GluonMessage,
  type HiggsMessage,
  type ValueProtocolPatch,
} from "pkg/protocol"

export interface DarkPhotonStore {
  messages: PhotonMessage[]
}

export interface DarkPhotonSubscription {
  close(): void
}

export interface DarkElectromagnetismProtocol {
  emitGluonPatches(patches: ValueProtocolPatch[]): void
  emitHiggsPatches(patches: ValueProtocolPatch[]): void
  emitGluonReplace(wimpFieldId: string, value: unknown): void
  emitHiggsReplace(wimpFieldId: string, value: unknown): void
  close(): void
}

export const darkPhoton$: DarkPhotonStore = {
  messages: [],
}

export const clearDarkPhotonMessages = (): void => {
  darkPhoton$.messages = []
}

const channelOptions = (channelName?: string): ProtocolChannelOptions =>
  channelName === undefined ? {} : { channelName }

export const subscribeDarkPhotons = (
  listener?: (message: PhotonMessage) => void,
  options: ProtocolChannelOptions = {},
): DarkPhotonSubscription => {
  const channel = openElectromagnetismBroadcastChannel(options)

  channel.onmessage = (event: MessageEvent<unknown>) => {
    const message = event.data
    if (!isPhotonMessage(message)) return

    darkPhoton$.messages.push(message)
    listener?.(message)
  }

  return {
    close() {
      channel.close()
    },
  }
}

const createFieldBosonMessage = (
  kind: "gluon" | "higgs",
  patches: ValueProtocolPatch[],
): GluonMessage | HiggsMessage =>
  kind === "gluon"
    ? {
        channel: "gluon",
        boson: "gluon",
        source: "dark",
        patches,
      }
    : {
        channel: "higgs",
        boson: "higgs",
        source: "dark",
        patches,
      }

const createReplacePatch = (wimpFieldId: string, value: unknown): ValueProtocolPatch => ({
  op: "replace",
  path: `/field/${wimpFieldId}`,
  value,
})

export const createDarkElectromagnetismProtocol = (
  options: { gluonChannelName?: string; higgsChannelName?: string } = {},
): DarkElectromagnetismProtocol => {
  const gluon = openGluonBroadcastChannel(channelOptions(options.gluonChannelName))
  const higgs = openHiggsBroadcastChannel(channelOptions(options.higgsChannelName))
  const emitGluonPatches = (patches: ValueProtocolPatch[]): void => {
    if (patches.length === 0) return
    gluon.postMessage(createFieldBosonMessage("gluon", patches))
  }
  const emitHiggsPatches = (patches: ValueProtocolPatch[]): void => {
    if (patches.length === 0) return
    higgs.postMessage(createFieldBosonMessage("higgs", patches))
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

export type { PhotonMessage, ProtocolChannelOptions, ValueProtocolPatch, GluonMessage, HiggsMessage } from "pkg/protocol"
