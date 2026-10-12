import {RTCPeerConnection, type PeerConfig, type RTCDataChannel} from "werift"
import type {PeerConnectionFactory, PeerDataChannel, PeerDescription} from "./contracts"

/**
Bun/Node adapter создаёт owned werift endpoints. Платформенный config может
ограничить интерфейсы/порты; ICE servers назначает PeerNetwork для каждой связи.
Проверки настоящего loopback RTC: [network](spec/network.spec.ts).
*/
export function createWeriftPeerConnectionFactory(config: Partial<PeerConfig> = {}): PeerConnectionFactory {
  return ({iceServers}) => {
    const hostOnly = iceServers.length === 0
    const pc = new RTCPeerConnection({...config, iceServers: iceServers.flatMap(server => (typeof server.urls === "string" ? [server.urls] : server.urls).map(urls => ({...server, urls})))})
    const prepareGathering = () => {
      // werift 0.23 defaults an absent parsed STUN server to Google even when
      // the caller explicitly supplied []. Its public IceConnection field is
      // the effective gatherer setting; peer-to-peer ICE binding stays enabled.
      if (hostOnly) for (const transport of pc.iceTransports) delete transport.connection.stunServer
    }
    const description = (value: {type: string, sdp: string}): PeerDescription => {
      if (value.type !== "offer" && value.type !== "answer") throw new Error("Unsupported RTC description")
      return {type: value.type, sdp: value.sdp}
    }
    return {
      get localDescription() { return pc.localDescription ? description(pc.localDescription) : undefined },
      async createOffer() { return description(await pc.createOffer()) },
      async createAnswer() { return description(await pc.createAnswer()) },
      async setLocalDescription(value) { prepareGathering(); await pc.setLocalDescription(value) },
      async setRemoteDescription(value) { await pc.setRemoteDescription(value) },
      createDataChannel(label) { return channelPort(pc.createDataChannel(label, {ordered: true})) },
      onDataChannel(listener) {
        const subscription = pc.onDataChannel.subscribe(channel => {
          if (!reliable(channel)) { channel.close()
            return }
          listener(channelPort(channel))
        })
        return () => subscription.unSubscribe()
      },
      onState(listener) { const subscription = pc.connectionStateChange.subscribe(listener)
        return () => subscription.unSubscribe() },
      async close() { await pc.close() },
    }
  }
}

function reliable(channel: RTCDataChannel) {
  return channel.ordered && channel.maxRetransmits === undefined && channel.maxPacketLifeTime === undefined
}
function channelPort(channel: RTCDataChannel): PeerDataChannel {
  if (!reliable(channel)) throw new Error("Peer requires a reliable ordered RTCDataChannel")
  return {
    get label() { return channel.label },
    get readyState() { return channel.readyState },
    get bufferedAmount() { return channel.bufferedAmount },
    send(bytes) { channel.send(Buffer.from(bytes)) },
    close() { channel.close() },
    subscribe(handlers) {
      const subscriptions = [
        channel.stateChange.subscribe(state => {
          if (state === "open") handlers.open()
          else if (state === "closed") handlers.close()
        }),
        channel.onMessage.subscribe(data => {
          if (typeof data === "string") handlers.error(new Error("Peer requires binary frames"))
          else handlers.message(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
        }),
        channel.error.subscribe(handlers.error),
      ]
      return () => { for (const subscription of subscriptions) subscription.unSubscribe() }
    },
  }
}
