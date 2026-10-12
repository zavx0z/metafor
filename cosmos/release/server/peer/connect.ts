import {RTCPeerConnection, type PeerConfig, type RTCDataChannel} from "werift"
import {createReleasePeer} from "./index"
import {createWeriftReleaseChannel} from "./werift"
import type {ReleasePeer, ReleasePeerOptions, ReleasePeerSource} from "./contracts"

/** Plain signaling DTO; его передача и авторизация принадлежат вызывающему runtime. */
export interface ReleasePeerDescription {
  type: "offer" | "answer"
  sdp: string
}

/** Собственное соединение runtime. closed отмечает недоступность; close ждёт cleanup transport и RTC. */
export interface ConnectedReleasePeer {
  peer: ReleasePeer
  closed: Promise<void>
  close(): Promise<void>
}

/** Answer доступен до открытия DataChannel; pending endpoint также имеет явный cleanup. */
export interface AcceptedReleasePeer {
  answer: ReleasePeerDescription
  connected: Promise<ConnectedReleasePeer>
  closed: Promise<void>
  close(): Promise<void>
}

/** Настройки platform adapter. signal отменяет подготовку; после connected lifecycle принадлежит close/closed. */
export interface ReleasePeerConnectionOptions {
  rtc?: Partial<PeerConfig>
  peer?: ReleasePeerOptions
  timeoutMs?: number
  signal?: AbortSignal
}

/**
Создаёт RTC endpoint и получает answer через переданный signaling callback.
Callback может использовать существующий peer или разрешённый bootstrap.
Artifact bytes передаются только по созданному DataChannel. Abort подготовки
закрывает owned endpoint; closed наблюдает последующее окончание живой связи.
*/
export async function createConnectedReleasePeer(
  signal: (offer: ReleasePeerDescription, options: {signal: AbortSignal}) => Promise<ReleasePeerDescription>,
  options: ReleasePeerConnectionOptions = {},
): Promise<ConnectedReleasePeer> {
  const owner = ownedConnection(options)
  try {
    const channel = owner.pc.createDataChannel("cosmos-release-v1", {ordered: true})
    const offer = await interrupted(owner.pc.createOffer(), owner.signal)
    await interrupted(owner.pc.setLocalDescription(offer), owner.signal)
    const local = owner.pc.localDescription!
    const answer = await interrupted(signal({type: "offer", sdp: local.sdp}, {signal: owner.signal}), owner.signal)
    if (answer.type !== "answer" || typeof answer.sdp !== "string") throw new Error("Release RTC signaling returned no answer")
    await interrupted(owner.pc.setRemoteDescription(answer), owner.signal)
    await channelOpen(channel, owner.signal)
    return owner.attach(channel)
  } catch (error) {
    await owner.close()
    throw error
  }
}

/**
Принимает разрешённый offer и возвращает answer до открытия DataChannel.
connected завершается после ICE/DTLS/SCTP; это позволяет вызывающему сначала
доставить answer. Source раздаёт подготовленные bytes и не назначает выпуск.
Abort signal действует и после возврата answer, пока connected ещё ожидается.
*/
export async function acceptReleasePeer(
  offer: ReleasePeerDescription,
  source: ReleasePeerSource,
  options: ReleasePeerConnectionOptions = {},
): Promise<AcceptedReleasePeer> {
  if (offer.type !== "offer" || typeof offer.sdp !== "string") throw new Error("Release RTC requires an offer")
  const owner = ownedConnection(options)
  const channel = new Promise<RTCDataChannel>((resolve, reject) => {
    const abort = () => {
      subscription.unSubscribe()
      reject(owner.signal.reason)
    }
    const subscription = owner.pc.onDataChannel.subscribe(value => {
      subscription.unSubscribe()
      owner.signal.removeEventListener("abort", abort)
      if (value.label !== "cosmos-release-v1") reject(new Error("Unexpected release RTC channel"))
      else resolve(value)
    })
    owner.signal.addEventListener("abort", abort, {once: true})
  })
  const connected = (async () => {
    const value = await interrupted(channel, owner.signal)
    await channelOpen(value, owner.signal)
    const result = owner.attach(value)
    result.peer.serve(source)
    return result
  })().catch(async error => {
    await owner.close()
    throw error
  })
  void connected.catch(() => {})
  try {
    await interrupted(owner.pc.setRemoteDescription(offer), owner.signal)
    const answer = await interrupted(owner.pc.createAnswer(), owner.signal)
    await interrupted(owner.pc.setLocalDescription(answer), owner.signal)
    const local = owner.pc.localDescription!
    return {answer: {type: "answer", sdp: local.sdp}, connected, close: owner.close, closed: owner.closed}
  } catch (error) {
    await owner.close()
    throw error
  }
}

function ownedConnection(options: ReleasePeerConnectionOptions) {
  const timeoutMs = connectionTimeout(options)
  options.signal?.throwIfAborted()
  const pc = new RTCPeerConnection({iceServers: [], ...options.rtc})
  const abort = new AbortController()
  let peer: ReleasePeer | undefined
  let ownedChannel: RTCDataChannel | undefined
  let cleanup: Promise<void> | undefined
  let resolveClosed!: () => void
  const closed = new Promise<void>(resolve => { resolveClosed = resolve })
  let releaseChannel = () => {}
  const finishPreparation = () => {
    clearTimeout(timer)
    options.signal?.removeEventListener("abort", externalAbort)
  }
  const close = (): Promise<void> => {
    if (cleanup) return cleanup
    finishPreparation()
    abort.abort(new Error("Release RTC connection closed"))
    cleanup = (async () => {
      try {
        peer?.close()
        await peer?.whenIdle()
        if (ownedChannel) await closeChannel(ownedChannel)
        await pc.close()
      } finally {
        resolveClosed()
        releaseChannel()
        stateSubscription.unSubscribe()
      }
    })()
    return cleanup
  }
  const unavailable = (reason: Error) => {
    abort.abort(reason)
    resolveClosed()
    void close().catch(() => {})
  }
  const externalAbort = () => {
    abort.abort(options.signal?.reason ?? new Error("Release RTC preparation aborted"))
    void close().catch(() => {})
  }
  const timer = setTimeout(() => unavailable(new Error("Release RTC connection timed out")), timeoutMs)
  const stateSubscription = pc.connectionStateChange.subscribe(state => {
    if (state === "closed" || state === "failed") unavailable(new Error(`Release RTC connection ${state}`))
  })
  options.signal?.addEventListener("abort", externalAbort, {once: true})
  return {
    pc,
    signal: abort.signal,
    close,
    closed,
    attach(channel: RTCDataChannel): ConnectedReleasePeer {
      abort.signal.throwIfAborted()
      ownedChannel = channel
      peer = createReleasePeer(createWeriftReleaseChannel(channel), options.peer)
      const subscriptions = [
        channel.stateChange.subscribe(state => {
          if (state === "closed") unavailable(new Error("Release RTC channel closed"))
        }),
        channel.error.subscribe(() => unavailable(new Error("Release RTC channel failed"))),
      ]
      releaseChannel = () => { for (const subscription of subscriptions) subscription.unSubscribe() }
      finishPreparation()
      return {peer, close, closed}
    },
  }
}

function connectionTimeout(options: ReleasePeerConnectionOptions) {
  const timeout = options.timeoutMs ?? 30_000
  if (!Number.isSafeInteger(timeout) || timeout <= 0) throw new Error("Invalid release RTC connection timeout")
  return timeout
}

function channelOpen(channel: RTCDataChannel, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  if (channel.readyState === "open") return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const dispose = () => {
      subscription.unSubscribe()
      signal.removeEventListener("abort", abort)
    }
    const abort = () => {
      dispose()
      reject(signal.reason)
    }
    const subscription = channel.stateChange.subscribe(state => {
      if (state === "open" || state === "closed") {
        dispose()
        if (state === "open") resolve()
        else reject(new Error("Release RTC channel closed before opening"))
      }
    })
    signal.addEventListener("abort", abort, {once: true})
  })
}

function interrupted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener("abort", abort, {once: true})
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort))
  })
}


/** Даёт SCTP stream reset завершиться до остановки DTLS; недоступный remote не блокирует cleanup. */
async function closeChannel(channel: RTCDataChannel): Promise<void> {
  if (channel.readyState === "closed") return
  await new Promise<void>(resolve => {
    const finish = () => {
      clearTimeout(timer)
      subscription.unSubscribe()
      resolve()
    }
    const subscription = channel.stateChange.subscribe(state => { if (state === "closed") finish() })
    const timer = setTimeout(finish, 1_000)
    try {
      channel.close()
      if (channel.readyState === "closed") finish()
    } catch { finish() }
  })
}
