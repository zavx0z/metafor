import type {PeerConnectionFactory, PeerDataChannel, PeerDescription} from "./contracts"

/**
Browser adapter использует native RTCPeerConnection и полный ICE gathering.
ICE/STUN/TURN назначает caller. Browser globals читаются при создании endpoint,
поэтому import factory допустим вне browser. Закон: [связи участников](README.md).
*/
export function createBrowserPeerConnectionFactory(): PeerConnectionFactory {
  return ({iceServers}) => {
    const pc = new RTCPeerConnection({iceServers: iceServers.map(server => ({...server, urls: typeof server.urls === "string" ? server.urls : [...server.urls]}))})
    const gathering = new Set<() => void>()
    const description = (value: RTCSessionDescriptionInit): PeerDescription => {
      if ((value.type !== "offer" && value.type !== "answer") || typeof value.sdp !== "string")
        throw new Error("Unsupported RTC description")
      return {type: value.type, sdp: value.sdp}
    }
    return {
      get localDescription() { return pc.localDescription ? description(pc.localDescription) : undefined },
      async createOffer() { return description(await pc.createOffer()) },
      async createAnswer() { return description(await pc.createAnswer()) },
      async setLocalDescription(value) {
        await pc.setLocalDescription(value)
        if (pc.iceGatheringState === "complete") return
        await new Promise<void>((resolve, reject) => {
          const finish = () => { gathering.delete(stopped)
            pc.removeEventListener("icegatheringstatechange", gathered)
            pc.removeEventListener("connectionstatechange", state) }
          const stopped = () => { finish()
            reject(new Error("RTC closed during ICE gathering")) }
          gathering.add(stopped)
          const gathered = () => { if (pc.iceGatheringState === "complete") { finish()
            resolve() } }
          const state = () => { if (pc.connectionState === "closed" || pc.connectionState === "failed") { finish()
            reject(new Error("RTC closed during ICE gathering")) } }
          pc.addEventListener("icegatheringstatechange", gathered)
          pc.addEventListener("connectionstatechange", state)
          gathered()
          state()
        })
      },
      async setRemoteDescription(value) { await pc.setRemoteDescription(value) },
      createDataChannel(label) { return channelPort(pc.createDataChannel(label, {ordered: true})) },
      onDataChannel(listener) {
        const received = (event: RTCDataChannelEvent) => {
          const channel = event.channel
          if (!reliable(channel)) { channel.close()
            return }
          listener(channelPort(channel))
        }
        pc.addEventListener("datachannel", received)
        return () => pc.removeEventListener("datachannel", received)
      },
      onState(listener) { const state = () => listener(pc.connectionState)
        pc.addEventListener("connectionstatechange", state)
        return () => pc.removeEventListener("connectionstatechange", state) },
      async close() { for (const stop of [...gathering]) stop()
        pc.close() },
    }
  }
}
function reliable(channel: RTCDataChannel) {
  return channel.ordered && channel.maxRetransmits === null && channel.maxPacketLifeTime === null
}
function channelPort(channel: RTCDataChannel): PeerDataChannel {
  if (!reliable(channel)) throw new Error("Peer requires a reliable ordered RTCDataChannel")
  channel.binaryType = "arraybuffer"
  return {
    get label() { return channel.label },
    get readyState() { return channel.readyState },
    get bufferedAmount() { return channel.bufferedAmount },
    send(bytes) { channel.send(Uint8Array.from(bytes)) },
    close() { channel.close() },
    subscribe(handlers) {
      const message = (event: MessageEvent) => {
        if (event.data instanceof ArrayBuffer) handlers.message(new Uint8Array(event.data))
        else handlers.error(new Error("Peer requires binary frames"))
      }
      const error = () => handlers.error(new Error("RTC channel failed"))
      channel.addEventListener("message", message)
      channel.addEventListener("open", handlers.open)
      channel.addEventListener("close", handlers.close)
      channel.addEventListener("error", error)
      return () => {
        channel.removeEventListener("message", message)
        channel.removeEventListener("open", handlers.open)
        channel.removeEventListener("close", handlers.close)
        channel.removeEventListener("error", error)
      }
    },
  }
}
