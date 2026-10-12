import {createPeerNetwork} from "./index"
import type {PeerData, PeerNetwork, RoutedPeerNetworkOptions, PeerSnapshot} from "./contracts"
import {dataChannelNames, decoder, encoder, messageLimit, positive, validId} from "./protocol"

const CHANNEL = "peer:routed-v1"
const CHUNK = 8 * 1024
const WINDOW = 32
const PROTOCOL_VERSION = 2
const channelPattern = /^[a-zA-Z0-9_.:-]{1,128}$/
type Packet = {kind: "hello" | "ready" | "bye" | "ack" | "fragment" | "data", generation: string, version?: number,
  sequence?: number, channel?: string, physicalChannel?: string, text?: boolean, size?: number, offset?: number, bytes?: string}
function gate() {
  let resolve!: () => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<void>((yes, no) => { resolve = yes
    reject = no })
  void promise.catch(() => {})
  return {promise, resolve, reject}
}
type Logical = {
  peerId: string, generation: string, ready: ReturnType<typeof gate>, open: boolean,
  lanes: Map<string, Lane>, initialDirect?: Promise<void>, stopped: ReturnType<typeof gate>,
  timer: ReturnType<typeof setTimeout>, replacement?: Promise<void>,
}

type Lane = {
  next: number, received: number, queued: number, sending: Promise<void>,
  ack?: {sequence: number, channel: string, size: number, delivered: boolean, ready: ReturnType<typeof gate>, changed: ReturnType<typeof gate>, fragments: Map<number, boolean>, resend: boolean} | undefined,
  relayStarted: number, relayFrames: number,
  relayPacing?: Promise<void> | undefined,
  receiver?: {sequence: number, channel: string, text: boolean, bytes: Uint8Array, offset: number, timer: ReturnType<typeof setTimeout>} | undefined,
}

/**
Надёжная логическая связь предпочитает прямой RTC и использует явно разрешённый
авторизованный relay при его недоступности. Оба участника используют этот API;
bootstrap требует opt-in relay у клиента и host. Logical generation сохраняется
при смене пути; peerId обозначает конечного участника. send ждёт acknowledgement
peer transport, не исполнения приложения. Последовательность и дедупликация
действуют отдельно для каждого physicalChannel внутри поколения, без повторной
отправки после закрытия logical link. Connect and the first application send
await one shared RTC attempt for directTimeoutMs; immediate failure permits relay,
and a timed-out attempt can still upgrade later. Queues, reassembly and ACKs are
independent per configured lane. This does not reserve SCTP/network bandwidth.
Routed handshake version 2 requires fragment credits; incompatible peers fail
explicitly. Each transfer reserves at most 32 fragments of 8 KiB per lane.
Credits bind generation/sequence/lane/channel/size/offset and release only a
contiguous reserved prefix; duplicates and future credits grant nothing. Relay
frames are paced below the broker's existing rate cap. Fragment credits only
confirm copying into reassembly; final delivery ACK remains independent.
Payload по умолчанию до 16 MiB (явный maxMessageBytes допускает до 32 MiB),
bounded queue, frames до 16 KiB; partial receive и send имеют
timeout. Потеря bootstrap сохраняет открытый прямой путь, потеря обоих путей
закрывает logical stream. Законы: [связи участников](README.md).
Проверки: [relay и прямой путь](spec/routed.spec.ts), [physical lanes](spec/channels.spec.ts).
*/
export function createRoutedPeerNetwork(options: RoutedPeerNetworkOptions): PeerNetwork {
  if (!options.bootstrap.relayEnabled) throw new Error("Routed peer requires an admitted relay transport")
  const timeout = positive(options.timeoutMs ?? 30_000, "routed peer timeout")
  const names = dataChannelNames(options.dataChannels)
  const defaultLane = names[0]!
  const directTimeout = Math.min(positive(options.directTimeoutMs ?? Math.min(15_000, timeout), "direct peer timeout"), timeout)
  const maxMessage = messageLimit(options.maxMessageBytes)
  const maxQueued = positive(options.maxQueuedBytes ?? maxMessage * 2, "routed peer queue limit")
  const maxPeers = positive(options.maxPeers ?? 32, "routed peer limit")
  const direct = createPeerNetwork(options)
  const links = new Map<string, Logical>()
  const listeners = new Set<(snapshot: PeerSnapshot) => void>()
  const dataListeners = new Set<(event: PeerData) => void>()
  const retired = new Set<string>()
  let closed = false
  const isDirect = (id: string) => direct.snapshot().links.some(link => link.peerId === id && link.state === "open")
  const hasRelay = (id: string) => options.bootstrap.open && options.bootstrap.peers().includes(id)
  const snapshot = (): PeerSnapshot => ({
    id: options.id, peers: [...new Set([...direct.snapshot().peers, ...links.keys()])].sort(),
    bootstrap: options.bootstrap.open,
    links: [...links.values()].map(link => ({peerId: link.peerId, generation: link.generation,
      state: link.open ? "open" as const : "connecting" as const,
      ...(options.dataChannels ? {channels: direct.snapshot().links.find(item => item.peerId === link.peerId)?.channels ??
        names.map(name => ({name, state: "connecting" as const}))} : {}),
      transport: isDirect(link.peerId) ? "direct" as const : "relay" as const})).sort((a, b) => a.peerId.localeCompare(b.peerId)),
  })
  const emit = () => { for (const listener of listeners) { try { listener(snapshot()) } catch {} } }
  const stop = (link: Logical, reason = new Error("Routed peer link closed"), notify = true) => {
    if (links.get(link.peerId) !== link) return
    links.delete(link.peerId)
    if (hasRelay(link.peerId)) void options.bootstrap.sendRelay(link.peerId, JSON.stringify({kind: "bye", generation: link.generation}), options.dataChannels ? defaultLane : "peer:control").catch(() => {})
    clearTimeout(link.timer)
    for (const lane of link.lanes.values()) {
      clearTimeout(lane.receiver?.timer)
      lane.receiver = undefined
      lane.ack?.ready.reject(reason)
    }
    link.ready.reject(reason)
    link.stopped.reject(reason)
    retired.add(link.generation)
    if (retired.size > 256) retired.delete(retired.values().next().value!)
    if (notify) emit()
  }
  const make = (peerId: string, generation: string) => {
    if (closed) throw new Error("Peer network is closed")
    if (links.size >= maxPeers) throw new Error("Routed peer connection limit")
    const link: Logical = {peerId, generation, ready: gate(), stopped: gate(), open: false,
      lanes: new Map(names.map(name => [name, {next: 0, received: 0, queued: 0, sending: Promise.resolve(), relayStarted: 0, relayFrames: 0}])),
      timer: setTimeout(() => stop(link, new Error("Routed peer admission timed out")), timeout)}
    links.set(peerId, link)
    emit()
    return link
  }
  const packet = async (peerId: string, value: Packet, relay = false) => {
    const frame = JSON.stringify(value)
    if (!relay && isDirect(peerId)) {
      try { await direct.send(peerId, frame, {channel: CHANNEL, physicalChannel: value.physicalChannel ?? defaultLane})
        return } catch { /* RTC can disappear between route selection and send. */ }
    }
    const link = links.get(peerId)
    const lane = link?.lanes.get(value.physicalChannel ?? defaultLane)
    if (lane) {
      while (true) {
        if (links.get(peerId) !== link) throw new Error("Routed peer link closed")
        const now = Date.now()
        if (now - lane.relayStarted >= 1000) {lane.relayStarted = now; lane.relayFrames = 0}
        if (lane.relayFrames < 1024) {lane.relayFrames++; break}
        if (!lane.relayPacing) {
          let timer: ReturnType<typeof setTimeout> | undefined
          lane.relayPacing = Promise.race([new Promise<void>(resolve => {timer = setTimeout(resolve, Math.max(1, 1000 - (now - lane.relayStarted)))}), link!.stopped.promise])
            .finally(() => {clearTimeout(timer); lane.relayPacing = undefined})
        }
        await lane.relayPacing
      }
    }
    await options.bootstrap.sendRelay(peerId, frame, options.dataChannels ? value.physicalChannel ?? defaultLane : value.channel ?? "peer:control")
  }
  const preferDirect = (peerId: string) => { void direct.connect(peerId).catch(() => {}) }
  const opened = (link: Logical) => {
    if (link.open) return
    link.open = true
    clearTimeout(link.timer)
    let timer: ReturnType<typeof setTimeout> | undefined
    link.initialDirect = Promise.race([
      direct.connect(link.peerId), link.stopped.promise,
      new Promise<void>(resolve => { timer = setTimeout(resolve, directTimeout) }),
    ]).catch(() => {}).finally(() => clearTimeout(timer))
    link.ready.resolve()
    emit()
  }
  const readyLink = async (link: Logical): Promise<void> => {
    try {
      await link.ready.promise
      await link.initialDirect
      if (closed || links.get(link.peerId) !== link) throw new Error("Routed peer link closed")
    } catch (error) {
      if (link.replacement) return await link.replacement
      throw error
    }
  }
  const receive = (peerId: string, frame: string, physicalChannel?: string) => {
    let link = links.get(peerId)
    try {
      if (!validId(peerId) || peerId === options.id || encoder.encode(frame).length > 16 * 1024) throw new Error("Invalid routed frame")
      const p = JSON.parse(frame) as Packet
      if (!p || !validId(p.generation) || retired.has(p.generation)) return
      if ((p.kind === "hello" || p.kind === "ready") && p.version !== PROTOCOL_VERSION) {
        void packet(peerId, {kind: "bye", generation: p.generation}, true).catch(() => {})
        if (link?.generation === p.generation) stop(link, new Error("Unsupported routed peer protocol"))
        return
      }
      if (p.kind === "hello") {
        let replacement: ReturnType<typeof gate> | undefined
        if (link && link.generation !== p.generation) {
          if (link.open || options.id < peerId) return
          replacement = gate()
          link.replacement = replacement.promise
          // Keep observers from initiating another offer in the transient gap.
          stop(link, new Error("Simultaneous routed offer superseded"), false)
          link = undefined
        }
        try {link ??= make(peerId, p.generation)}
        catch (error) {replacement?.reject(error); throw error}
        if (replacement) void readyLink(link).then(replacement.resolve, replacement.reject)
        opened(link)
        void packet(peerId, {kind: "ready", version: PROTOCOL_VERSION, generation: link.generation}).catch(() => stop(link!))
        return
      }
      if (!link || link.generation !== p.generation) return
      if (p.kind === "ready") { opened(link)
        return }
      if (p.kind === "bye") { stop(link)
        return }
      if (!link.open) throw new Error("Routed peer is not admitted")
      const name = p.physicalChannel ?? defaultLane
      const lane = link.lanes.get(name)
      if (!lane || (physicalChannel !== undefined && physicalChannel !== name)) throw new Error("Unknown routed physical channel")
      if (!Number.isSafeInteger(p.sequence) || p.sequence! < 0) throw new Error("Invalid routed sequence")
      if (p.kind === "fragment") {
        const ack = lane.ack
        if (!ack || ack.sequence !== p.sequence || ack.channel !== p.channel || ack.size !== p.size || !Number.isSafeInteger(p.offset) || !ack.fragments.has(p.offset!) || ack.fragments.get(p.offset!) === true) return
        ack.fragments.set(p.offset!, true)
        let released = false
        for (const [offset, accepted] of ack.fragments) {
          if (!accepted) break
          ack.fragments.delete(offset); released = true
        }
        if (released) {ack.changed.resolve(); ack.changed = gate()}
        return
      }
      if (p.kind === "ack") { if (lane.ack && lane.ack.sequence === p.sequence && lane.ack.channel === p.channel) {
        lane.ack.delivered = true; lane.ack.ready.resolve()
      }
        return }
      if (p.kind !== "data" || typeof p.channel !== "string" || !channelPattern.test(p.channel) || typeof p.text !== "boolean" ||
        !Number.isSafeInteger(p.size) || p.size! < 0 || p.size! > maxMessage ||
        !Number.isSafeInteger(p.offset) || p.offset! < 0 || typeof p.bytes !== "string" || p.bytes.length > CHUNK * 2)
        throw new Error("Invalid routed data")
      const bytes = Uint8Array.from(atob(p.bytes), c => c.charCodeAt(0))
      if (bytes.length > CHUNK || p.offset! + bytes.length > p.size! || (bytes.length === 0 && p.size !== 0)) throw new Error("Invalid routed chunk")
      const credit = () => {void packet(peerId, {kind: "fragment", generation: link!.generation, sequence: p.sequence!, channel: p.channel!, size: p.size!, offset: p.offset!,
        ...(options.dataChannels ? {physicalChannel: name} : {})}).catch(() => {})}
      if (p.sequence! < lane.received) {
        credit()
        if (p.offset! + bytes.length !== p.size) return
        void packet(peerId, {kind: "ack", generation: link.generation, sequence: p.sequence!, channel: p.channel!, ...(options.dataChannels ? {physicalChannel: name} : {})}).catch(() => {})
        return
      }
      if (p.sequence !== lane.received) throw new Error("Routed message out of sequence")
      if (p.offset === 0 && !lane.receiver) {
        lane.receiver = {sequence: p.sequence, channel: p.channel, text: p.text, bytes: new Uint8Array(p.size!), offset: 0,
          timer: setTimeout(() => stop(link!, new Error("Partial routed message timed out")), timeout)}
      }
      const receiver = lane.receiver
      if (!receiver || receiver.sequence !== p.sequence || receiver.bytes.length !== p.size || receiver.channel !== p.channel || receiver.text !== p.text)
        throw new Error("Routed message changed")
      // Retransmission after transport loss resumes an already accepted prefix.
      if (p.offset! < receiver.offset) {if (p.offset! + bytes.length <= receiver.offset) credit(); return}
      if (p.offset !== receiver.offset) return
      receiver.bytes.set(bytes, receiver.offset)
      receiver.offset += bytes.length
      credit()
      if (receiver.offset === receiver.bytes.length) {
        clearTimeout(receiver.timer)
        lane.receiver = undefined
        lane.received++
        const event = {peerId, ...(options.dataChannels ? {physicalChannel: name} : {}), channel: receiver.channel, data: receiver.text ? decoder.decode(receiver.bytes) : receiver.bytes}
        void packet(peerId, {kind: "ack", generation: link.generation, sequence: p.sequence!, channel: p.channel!, ...(options.dataChannels ? {physicalChannel: name} : {})}).catch(() => {})
        for (const listener of dataListeners) { try { listener(event) } catch {} }
      }
    } catch { if (link) stop(link, new Error("Invalid routed peer frame")) }
  }
  const disposeRelayClose = options.bootstrap.subscribeRelayClose(event => {
    const link = links.get(event.peerId)
    if (!link) return
    const lane = link.lanes.get(options.dataChannels ? event.channel : defaultLane)
    if (lane?.ack) {lane.ack.resend = true; lane.ack.changed.resolve(); lane.ack.changed = gate()}
  })
  const disposeRelay = options.bootstrap.subscribeRelay(event => receive(event.from, event.frame, options.dataChannels ? event.channel ?? "" : undefined))
  const disposeData = direct.onData(event => { if (event.channel === CHANNEL && typeof event.data === "string") receive(event.peerId, event.data, event.physicalChannel) })
  const disposeDirect = direct.subscribe(() => {
    for (const link of links.values()) if (link.open && !isDirect(link.peerId) && !hasRelay(link.peerId)) stop(link, new Error("Peer routes unavailable"))
    emit()
  })
  const disposeRoster = options.bootstrap.subscribePeers(() => {
    for (const link of links.values()) if (!isDirect(link.peerId) && !hasRelay(link.peerId)) stop(link, new Error("Relay peer unavailable"))
    emit()
  })
  return {
    id: options.id, maxMessageBytes: maxMessage, snapshot,
    async connect(peerId, connectOptions = {}) {
      if (connectOptions.via) throw new Error("Routed peer introductions require relay roster")
      if (!validId(peerId) || peerId === options.id) throw new Error("Invalid target peer identity")
      const existing = links.get(peerId)
      if (existing) { if (!isDirect(peerId) && hasRelay(peerId)) preferDirect(peerId)
        return await readyLink(existing) }
      if (!hasRelay(peerId)) throw new Error("Relay peer unavailable")
      const link = make(peerId, crypto.randomUUID())
      try { await packet(peerId, {kind: "hello", version: PROTOCOL_VERSION, generation: link.generation}, true)
        await readyLink(link) } catch (error) {
        const replacement = links.get(peerId)
        if (replacement && replacement !== link) return await readyLink(replacement)
        stop(link)
        throw error
      }
    },
    send(peerId, data, sendOptions = {}) {
      const link = links.get(peerId)
      const channel = sendOptions.channel ?? "app"
      if (!link?.open) return Promise.reject(new Error("Peer is not connected"))
      const physicalChannel = sendOptions.physicalChannel ?? defaultLane
      const lane = link.lanes.get(physicalChannel)
      if (!lane) return Promise.reject(new Error("Unknown peer physical channel"))
      if (!channelPattern.test(channel)) return Promise.reject(new Error("Invalid peer service channel"))
      if (!isDirect(peerId) && hasRelay(peerId)) preferDirect(peerId)
      const bytes = typeof data === "string" ? encoder.encode(data) : Uint8Array.from(data)
      if (bytes.length > maxMessage || lane.queued + bytes.length + 1 > maxQueued) return Promise.reject(new Error("Routed peer send limit exceeded"))
      lane.queued += bytes.length + 1
      const work = lane.sending.then(async () => {
        await link.initialDirect
        if (links.get(peerId) !== link) throw new Error("Routed peer link closed")
        const sequence = lane.next++
        const ack = {sequence, channel, size: bytes.length, delivered: false, ready: gate(), changed: gate(), fragments: new Map<number, boolean>(), resend: false}
        lane.ack = ack
        const deadline = Date.now() + timeout
        let route = isDirect(peerId)
        const fragment = async (offset: number, relay = false) => {
          if (links.get(peerId) !== link) throw new Error("Routed peer link closed")
          const chunk = bytes.subarray(offset, offset + CHUNK)
          const value: Packet = {kind: "data", generation: link.generation, sequence, channel, ...(options.dataChannels ? {physicalChannel} : {}),
            text: typeof data === "string", size: bytes.length, offset, bytes: btoa(String.fromCharCode(...chunk))}
          try {await packet(peerId, value, relay)} catch (error) {
            if (links.get(peerId) !== link || !hasRelay(peerId)) throw error
            await packet(peerId, value, true)
          }
        }
        const waitCredit = async () => {
          let timer: ReturnType<typeof setTimeout> | undefined
          const progress = await Promise.race([ack.changed.promise.then(() => true), ack.ready.promise.then(() => true), link.stopped.promise,
            new Promise<false>(resolve => {timer = setTimeout(() => resolve(false), Math.min(750, timeout))})]).finally(() => clearTimeout(timer))
          if (Date.now() >= deadline && !ack.delivered) throw new Error("Routed peer acknowledgement timed out")
          const current = isDirect(peerId)
          if (ack.resend || route !== current) {
            ack.resend = false; route = current
            for (const offset of ack.fragments.keys()) await fragment(offset, !current)
          } else if (!progress && ack.fragments.size) {
            await fragment(ack.fragments.keys().next().value!, hasRelay(peerId))
          }
          return progress
        }
        try {
          let offset = 0
          let lastOffset = 0
          do {
            while (ack.fragments.size >= WINDOW && !ack.delivered) await waitCredit()
            if (ack.delivered) return
            lastOffset = offset
            ack.fragments.set(offset, false)
            await fragment(offset)
            offset += Math.min(CHUNK, bytes.length - offset)
          } while (offset < bytes.length)
          while (!ack.delivered) {
            const progress = await waitCredit()
            if (!progress && !ack.delivered && ack.fragments.size === 0) await fragment(lastOffset, hasRelay(peerId))
          }
          return
        } catch (error) { stop(link, error instanceof Error ? error : undefined)
          throw error } finally { lane.ack = undefined }
      }).finally(() => { lane.queued -= bytes.length + 1 })
      lane.sending = work.catch(() => {})
      return work
    },
    onData(listener) { dataListeners.add(listener)
      return () => { dataListeners.delete(listener) } },
    subscribe(listener) { listeners.add(listener)
      return () => { listeners.delete(listener) } },
    async disconnect(peerId) { const link = links.get(peerId)
      if (link) { try { await packet(peerId, {kind: "bye", generation: link.generation}) } catch {}
        stop(link) }
      await direct.disconnect(peerId) },
    closeBootstrap() { direct.closeBootstrap() },
    async close() {
      if (closed) return
      closed = true
      disposeRelayClose()
      disposeRelay()
      disposeData()
      disposeDirect()
      disposeRoster()
      for (const link of links.values()) stop(link)
      await direct.close()
      dataListeners.clear()
      listeners.clear()
    },
  }
}
