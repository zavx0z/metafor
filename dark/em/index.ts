import {
  isPhotonMessage,
  openElectromagnetismBroadcastChannel,
  type PhotonMessage,
  type ProtocolChannelOptions,
} from "@shared/protocol"

export interface DarkPhotonStore {
  messages: PhotonMessage[]
}

export interface DarkPhotonSubscription {
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

export type { PhotonMessage, ProtocolChannelOptions } from "@shared/protocol"
