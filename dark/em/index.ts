import {
  METAFOR_PROTOCOL_KIND,
  isPhotonMessage,
  openElectromagnetismBroadcastChannel,
  openGluonBroadcastChannel,
  openHiggsBroadcastChannel,
  type PhotonMessage,
  type ProtocolChannelOptions,
  type GluonMessage,
  type HiggsMessage,
  type ValueProtocolPatch,
} from "@shared/protocol"

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

export const subscribeDarkPhotons = (
  listener?: (message: PhotonMessage) => void,
  options: ProtocolChannelOptions = {},
): DarkPhotonSubscription => {
  const channel = openElectromagnetismBroadcastChannel(options)

  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (!isPhotonMessage(event.data)) return
    if (event.data.target !== "dark" && event.data.target !== "broadcast") return

    darkPhoton$.messages = [...darkPhoton$.messages, event.data]
    listener?.(event.data)
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
): GluonMessage | HiggsMessage => ({
  protocol: METAFOR_PROTOCOL_KIND,
  channel: kind,
  boson: kind,
  source: "dark",
  target: "boundary",
  patches,
})

export const createDarkElectromagnetismProtocol = (
  options: { gluonChannelName?: string; higgsChannelName?: string } = {},
): DarkElectromagnetismProtocol => {
  const gluon = openGluonBroadcastChannel(
    options.gluonChannelName === undefined ? {} : { channelName: options.gluonChannelName },
  )
  const higgs = openHiggsBroadcastChannel(
    options.higgsChannelName === undefined ? {} : { channelName: options.higgsChannelName },
  )

  return {
    emitGluonPatches(patches) {
      if (patches.length === 0) return
      gluon.postMessage(createFieldBosonMessage("gluon", patches))
    },

    emitHiggsPatches(patches) {
      if (patches.length === 0) return
      higgs.postMessage(createFieldBosonMessage("higgs", patches))
    },

    emitGluonReplace(wimpFieldId, value) {
      gluon.postMessage(createFieldBosonMessage("gluon", [{ op: "replace", path: `/field/${wimpFieldId}`, value }]))
    },

    emitHiggsReplace(wimpFieldId, value) {
      higgs.postMessage(createFieldBosonMessage("higgs", [{ op: "replace", path: `/field/${wimpFieldId}`, value }]))
    },

    close() {
      gluon.close()
      higgs.close()
    },
  }
}

export type { PhotonMessage, ProtocolChannelOptions, ValueProtocolPatch, GluonMessage, HiggsMessage } from "@shared/protocol"
