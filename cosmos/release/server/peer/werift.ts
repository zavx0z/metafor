import type {RTCDataChannel} from "werift"
import type {ReleaseDataChannelPort} from "./contracts"

/**
Адаптирует существующий connected werift channel без создания peer или signaling.
Consumer закрывает свой RTCPeerConnection после завершения runtime.
Проверка двух Bun processes: ../../spec/peer-rtc.spec.ts.
*/
export function createWeriftReleaseChannel(channel: RTCDataChannel): ReleaseDataChannelPort {
  if (!channel.ordered || channel.maxRetransmits !== undefined || channel.maxPacketLifeTime !== undefined)
    throw new Error("Release requires a reliable ordered RTCDataChannel")
  channel.bufferedAmountLowThreshold = 0
  return {
    get readyState() { return channel.readyState },
    get bufferedAmount() { return channel.bufferedAmount },
    get maxMessageSize() {
      const sizes = [channel.sctp.maxMessageSize, channel.sctp.remoteMaxMessageSize].filter(value => value > 0)
      return sizes.length === 0 ? 16_384 : Math.min(...sizes)
    },
    send(message) { channel.send(Buffer.from(message)) },
    subscribe(handlers) {
      const subscriptions = [
        channel.onMessage.subscribe(message => {
          if (typeof message === "string") handlers.error(new Error("Release expects binary RTC frames"))
          else handlers.message(new Uint8Array(message.buffer, message.byteOffset, message.byteLength))
        }),
        channel.stateChange.subscribe(state => { if (state === "closed") handlers.close() }),
        channel.error.subscribe(handlers.error),
        channel.bufferedAmountLow.subscribe(handlers.bufferedAmountLow),
      ]
      return () => { for (const subscription of subscriptions) subscription.unSubscribe() }
    },
  }
}
