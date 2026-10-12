import type {
  PeerConnection, PeerDataChannel, PeerData, PeerNetwork, PeerNetworkOptions, PeerSignal, PeerSnapshot,
} from "./contracts"
import {dataChannelNames, decoder, encoder, FRAME_BYTES, messageLimit, MAX_SIGNAL_BYTES, parseSignal, positive, validId} from "./protocol"
export type * from "./contracts"

const HEADER = 15
const INTERNAL = "@signal"
const servicePattern = /^[a-zA-Z0-9_.:-]{1,128}$/

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes
    reject = no })
  void promise.catch(() => {})
  return {promise, resolve, reject}
}

type Link = {
  peerId: string
  generation: string
  via?: string
  pc: PeerConnection
  lanes: Map<string, Lane>
  state: "connecting" | "open"
  outgoing: boolean
  ready: ReturnType<typeof deferred<void>>
  stopped: ReturnType<typeof deferred<never>>
  replacement?: Promise<void>
  timer: ReturnType<typeof setTimeout>
  dispose: (() => void)[]
  closed: boolean
  closeWork?: Promise<void>
}

type Lane = {
  name: string
  channel?: PeerDataChannel
  queuedBytes: number
  nextId: number
  sending: Promise<void>
  receiver?: {id: number, size: number, offset: number, text: boolean, channel: string, bytes: Uint8Array, timer: ReturnType<typeof setTimeout>} | undefined
  seen: Set<number>
}

/**
Создаёт независимую сеть из caller-assigned адресов. Bootstrap и выбранный
посредник задают доверенную группу, а прикладные полномочия остаются у caller.
Payload по умолчанию ограничен 16 MiB, явно разрешённый максимум — 32 MiB;
очередь каждого physical DC — maxQueuedBytes, каждый frame
не превышает 16 KiB. Частичное сообщение истекает по timeoutMs. Named DCs share
one PC but own framing, reassembly and backpressure independently; connect waits
for every configured DC. [Channel checks](spec/channels.spec.ts).
Проверки реального RTC и relay: [network](spec/network.spec.ts).
*/
export function createPeerNetwork(options: PeerNetworkOptions): PeerNetwork {
  if (!validId(options.id)) throw new Error("Invalid local peer identity")
  const timeout = positive(options.timeoutMs ?? 30_000, "peer timeout")
  const maxPeers = positive(options.maxPeers ?? 32, "peer limit")
  const maxMessage = messageLimit(options.maxMessageBytes)
  const maxQueued = positive(options.maxQueuedBytes ?? maxMessage * 2, "peer queue limit")
  const names = dataChannelNames(options.dataChannels)
  const defaultLane = names[0]!
  const links = new Map<string, Link>()
  const dataListeners = new Set<(event: PeerData) => void>()
  const listeners = new Set<(snapshot: PeerSnapshot) => void>()
  const retired = new Set<string>()
  let closed = false
  let bootstrap = options.bootstrap
  let signalQueue = Promise.resolve()
  const snapshot = (): PeerSnapshot => ({
    id: options.id,
    peers: [...new Set([...(bootstrap?.peers() ?? []), ...links.keys()])].filter(id => id !== options.id).sort(),
    bootstrap: bootstrap?.open ?? false,
    links: [...links.values()].map(link => ({
      peerId: link.peerId, generation: link.generation, state: link.state,
      ...(options.dataChannels ? {channels: [...link.lanes.values()].map(lane => ({name: lane.name, state: lane.channel?.readyState === "open" ? "open" as const : "connecting" as const}))} : {}),
      ...(link.via ? {via: link.via} : {}),
    })).sort((a, b) => a.peerId.localeCompare(b.peerId)),
  })
  const emit = () => { for (const listener of listeners) {
    try { listener(snapshot()) } catch {}
  } }
  const retire = (generation: string) => {
    retired.add(generation)
    if (retired.size > 256) retired.delete(retired.values().next().value!)
  }
  const closeLink = (link: Link, reason = new Error("Peer link closed")): Promise<void> => {
    if (link.closeWork) return link.closeWork
    link.closed = true
    clearTimeout(link.timer)
    for (const lane of link.lanes.values()) {
      if (lane.receiver) clearTimeout(lane.receiver.timer)
      lane.receiver = undefined
    }
    for (const dispose of link.dispose.splice(0)) dispose()
    link.ready.reject(reason)
    link.stopped.reject(reason)
    retire(link.generation)
    if (links.get(link.peerId) === link) links.delete(link.peerId)
    emit()
    link.closeWork = (async () => {
      for (const lane of link.lanes.values()) { try { lane.channel?.close() } catch {} }
      // SCTP stream reset завершается до остановки DTLS.
      const deadline = Date.now() + 500
      while ([...link.lanes.values()].some(lane => lane.channel && lane.channel.readyState !== "closed") && Date.now() < deadline)
        await new Promise(resolve => setTimeout(resolve, 10))
      await link.pc.close()
    })()
    void link.closeWork.catch(() => {})
    return link.closeWork
  }
  const write = (link: Link, data: Uint8Array | string, channel: string, physicalChannel = defaultLane): Promise<void> => {
    const lane = link.lanes.get(physicalChannel)
    if (!lane) return Promise.reject(new Error("Unknown peer physical channel"))
    if (link.closed || link.state !== "open" || !lane.channel) return Promise.reject(new Error("Peer link is not open"))
    const bytes = typeof data === "string" ? encoder.encode(data) : data
    if (bytes.byteLength > maxMessage || (channel === INTERNAL && bytes.byteLength > MAX_SIGNAL_BYTES))
      return Promise.reject(new Error("Peer message exceeds limit"))
    if (lane.queuedBytes + bytes.byteLength + 1 > maxQueued) return Promise.reject(new Error("Peer send queue exceeds limit"))
    const owned = Uint8Array.from(bytes)
    const name = encoder.encode(channel)
    const id = lane.nextId++ >>> 0
    lane.queuedBytes += owned.byteLength + 1
    const send = async () => {
      try {
        let offset = 0
        do {
          const deadline = Date.now() + timeout
          while (!link.closed && lane.channel!.bufferedAmount > 256 * 1024) {
            if (Date.now() >= deadline) throw new Error("Peer backpressure timed out")
            await new Promise(resolve => setTimeout(resolve, 10))
          }
          if (link.closed || lane.channel!.readyState !== "open") throw new Error("Peer link closed during send")
          const length = Math.min(FRAME_BYTES - HEADER - name.length, owned.length - offset)
          const frame = new Uint8Array(HEADER + name.length + length)
          const view = new DataView(frame.buffer)
          frame[0] = 1
          view.setUint32(1, id)
          view.setUint32(5, owned.length)
          view.setUint32(9, offset)
          frame[13] = typeof data === "string" ? 1 : 0
          frame[14] = name.length
          frame.set(name, HEADER)
          frame.set(owned.subarray(offset, offset + length), HEADER + name.length)
          lane.channel!.send(frame)
          offset += length
        } while (offset < owned.length)
      } catch (error) {
        void closeLink(link, error instanceof Error ? error : new Error("Peer send failed"))
        throw error
      } finally { lane.queuedBytes -= owned.byteLength + 1 }
    }
    const work = lane.sending.then(send)
    lane.sending = work.catch(() => {})
    return work
  }
  const route = async (signal: PeerSignal) => {
    if (signal.via) {
      const via = links.get(signal.via)
      if (!via || via.state !== "open") throw new Error("Peer introducer is not connected")
      await write(via, JSON.stringify(signal), INTERNAL)
    } else {
      if (!bootstrap?.open) throw new Error("Peer bootstrap is unavailable")
      bootstrap.send(signal)
    }
  }
  const queueSignal = (signal: PeerSignal) => {
    signalQueue = signalQueue.then(() => receiveSignal(signal)).catch(() => {})
  }
  const receiveFrame = (link: Link, lane: Lane, frame: Uint8Array) => {
    try {
      if (frame.byteLength < HEADER || frame.byteLength > FRAME_BYTES || frame[0] !== 1)
        throw new Error("Invalid peer frame")
      const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength)
      const id = view.getUint32(1)
      if (lane.seen.has(id)) return
      const size = view.getUint32(5)
      const offset = view.getUint32(9)
      const text = frame[13] === 1
      const nameLength = frame[14]!
      if (frame[13]! > 1 || nameLength === 0 || nameLength > 128 || frame.length < HEADER + nameLength)
        throw new Error("Invalid peer frame header")
      const channel = decoder.decode(frame.subarray(HEADER, HEADER + nameLength))
      if (channel !== INTERNAL && !servicePattern.test(channel)) throw new Error("Invalid peer service channel")
      if (size > maxMessage || (channel === INTERNAL && size > MAX_SIGNAL_BYTES)) throw new Error("Peer receive limit exceeded")
      const payload = frame.subarray(HEADER + nameLength)
      if (offset === 0 && !lane.receiver) {
        lane.receiver = {id, size, offset: 0, text, channel, bytes: new Uint8Array(size),
          timer: setTimeout(() => void closeLink(link, new Error("Partial peer message timed out")), timeout)}
      }
      const receiver = lane.receiver
      if (!receiver || receiver.id !== id || receiver.size !== size || receiver.offset !== offset ||
        receiver.channel !== channel || receiver.text !== text || offset + payload.length > size ||
        (payload.length === 0 && size !== 0)) throw new Error("Peer message is out of sequence")
      receiver.bytes.set(payload, offset)
      receiver.offset += payload.length
      if (receiver.offset === size) {
        clearTimeout(receiver.timer)
        lane.receiver = undefined
        lane.seen.add(id)
        if (lane.seen.size > 256) lane.seen.delete(lane.seen.values().next().value!)
        if (channel === INTERNAL) {
          if (!text) throw new Error("Invalid relay message")
          const signal = parseSignal(JSON.parse(decoder.decode(receiver.bytes)))
          if (signal.via !== options.id && signal.via !== link.peerId) throw new Error("Invalid relay route")
          if (signal.to === options.id) {
            if (signal.via !== link.peerId) throw new Error("Untrusted peer introducer")
            queueSignal(signal)
          } else {
            if (signal.from !== link.peerId || signal.via !== options.id) throw new Error("Invalid relay origin")
            const target = links.get(signal.to)
            if (!target || target.state !== "open") throw new Error("Relay target is unavailable")
            void write(target, JSON.stringify(signal), INTERNAL).catch(() => {})
          }
        } else {
          const data = text ? decoder.decode(receiver.bytes) : receiver.bytes
          for (const listener of dataListeners) { try { listener({peerId: link.peerId, channel, data, ...(options.dataChannels ? {physicalChannel: lane.name} : {})}) } catch {} }
        }
      }
    } catch (error) { void closeLink(link, error instanceof Error ? error : new Error("Invalid peer frame")) }
  }
  const attach = (link: Link, channel: PeerDataChannel) => {
    if (link.closed) { channel.close()
      return }
    const name = channel.label ?? (names.length === 1 ? defaultLane : undefined)
    const lane = name === undefined ? undefined : link.lanes.get(name)
    if (!lane || lane.channel) { channel.close()
      void closeLink(link, new Error("Unexpected or duplicate peer channel"))
      return }
    lane.channel = channel
    const opened = () => {
      if (link.closed || link.state === "open") return
      if ([...link.lanes.values()].some(item => item.channel?.readyState !== "open")) { emit()
        return }
      link.state = "open"
      clearTimeout(link.timer)
      link.ready.resolve(undefined)
      emit()
    }
    link.dispose.push(channel.subscribe({
      message: frame => receiveFrame(link, lane, frame), open: opened,
      close: () => void closeLink(link),
      error: () => void closeLink(link, new Error("Peer RTC channel failed")),
    }))
    if (channel.readyState === "open") opened()
  }
  const makeLink = (peerId: string, generation: string, outgoing: boolean, via?: string): Link => {
    if (closed) throw new Error("Peer network is closed")
    if (links.size >= maxPeers) throw new Error("Peer connection limit exceeded")
    const pc = options.rtc({iceServers: options.iceServers ?? []})
    const link: Link = {
      peerId, generation, pc, outgoing, ...(via ? {via} : {}),
      state: "connecting", ready: deferred<void>(), stopped: deferred<never>(),
      timer: setTimeout(() => void closeLink(link, new Error("Peer connection timed out")), timeout),
      dispose: [], closed: false, lanes: new Map(names.map(name => [name, {name, queuedBytes: 0, nextId: 0, sending: Promise.resolve(), seen: new Set()}])),
    }
    links.set(peerId, link)
    link.dispose.push(pc.onState(state => { if (state === "failed" || state === "closed") void closeLink(link) }))
    link.dispose.push(pc.onDataChannel(channel => attach(link, channel)))
    emit()
    return link
  }
  const prepared = <T>(link: Link, work: Promise<T>) => Promise.race([work, link.stopped.promise])
  const receiveSignal = async (raw: PeerSignal) => {
    const signal = parseSignal(raw)
    if (closed || signal.to !== options.id || retired.has(signal.generation)) return
    let link = links.get(signal.from)
    if (signal.description.type === "offer") {
      let replaced: ReturnType<typeof deferred<void>> | undefined
      if (link) {
        if (link.generation === signal.generation || link.state === "open" || !link.outgoing || options.id < signal.from) return
        replaced = deferred<void>()
        link.replacement = replaced.promise
        await closeLink(link, new Error("Simultaneous peer offer superseded"))
      }
      try { link = makeLink(signal.from, signal.generation, false, signal.via) }
      catch (error) { replaced?.reject(error)
        throw error }
      if (replaced) void link.ready.promise.then(replaced.resolve, replaced.reject)
      try {
        await prepared(link, link.pc.setRemoteDescription(signal.description))
        await prepared(link, link.pc.setLocalDescription(await prepared(link, link.pc.createAnswer())))
        if (link.closed) return
        const description = link.pc.localDescription
        if (!description) throw new Error("Peer answer is unavailable")
        await route({from: options.id, to: signal.from, generation: signal.generation, description,
          ...(signal.via ? {via: signal.via} : {})})
      } catch (error) { await closeLink(link, error instanceof Error ? error : new Error("Peer answer failed")) }
    } else if (link && link.outgoing && link.generation === signal.generation && link.via === signal.via) {
      try { await prepared(link, link.pc.setRemoteDescription(signal.description)) }
      catch { await closeLink(link, new Error("Peer answer rejected")) }
    }
  }
  const disposeSignal = bootstrap?.subscribe(signal => {
    // An external broker cannot nominate a trusted RTC introducer.
    if (signal.via === undefined) queueSignal(signal)
  }) ?? (() => {})
  const disposePeers = bootstrap?.subscribePeers(emit) ?? (() => {})
  const closeBootstrap = () => {
    disposeSignal()
    disposePeers()
    bootstrap?.close()
    bootstrap = undefined
    emit()
  }
  return {
    id: options.id, maxMessageBytes: maxMessage, snapshot,
    async connect(peerId, connectOptions = {}) {
      if (!validId(peerId) || peerId === options.id) throw new Error("Invalid target peer identity")
      if (connectOptions.via !== undefined && (!validId(connectOptions.via) || connectOptions.via === peerId || connectOptions.via === options.id))
        throw new Error("Invalid peer introducer")
      const existing = links.get(peerId)
      if (existing) {
        try {return await existing.ready.promise}
        catch (error) {
          if (existing.replacement) return await existing.replacement
          throw error
        }
      }
      const link = makeLink(peerId, crypto.randomUUID(), true, connectOptions.via)
      try {
        for (const name of names) attach(link, link.pc.createDataChannel(name))
        await prepared(link, link.pc.setLocalDescription(await prepared(link, link.pc.createOffer())))
        if (link.closed) return await link.ready.promise
        const description = link.pc.localDescription
        if (!description) throw new Error("Peer offer is unavailable")
        await route({from: options.id, to: peerId, generation: link.generation, description,
          ...(connectOptions.via ? {via: connectOptions.via} : {})})
        await link.ready.promise
      } catch (error) {
        if (link.replacement) return await link.replacement
        await closeLink(link, error instanceof Error ? error : new Error("Peer connection failed"))
        throw error
      }
    },
    send(peerId, data, sendOptions = {}) {
      const channel = sendOptions.channel ?? "app"
      if (!servicePattern.test(channel)) return Promise.reject(new Error("Invalid peer service channel"))
      const link = links.get(peerId)
      if (!link) return Promise.reject(new Error("Peer is not connected"))
      return write(link, data, channel, sendOptions.physicalChannel)
    },
    onData(listener) { dataListeners.add(listener)
      return () => { dataListeners.delete(listener) } },
    subscribe(listener) { listeners.add(listener)
      return () => { listeners.delete(listener) } },
    async disconnect(peerId) { const link = links.get(peerId)
      if (link) await closeLink(link) },
    closeBootstrap,
    async close() {
      if (closed) return
      closed = true
      closeBootstrap()
      await Promise.allSettled([...links.values()].map(link => closeLink(link)))
      dataListeners.clear()
      listeners.clear()
    },
  }
}

export {createRoutedPeerNetwork} from "./routed"
