import {parsePeerNetworkObservation, peerObservationRequest, PEER_OBSERVATION_TTL_MS, type PeerNetworkObservation} from "../shared/peer-observation"
import type {InfrastructureProjection} from "@internal/visual"
import {
  NETWORK_OBSERVATION_CHANNEL,
  NETWORK_OBSERVATION_SCHEMA,
  parseNetworkSnapshot,
  type NetworkSnapshot,
} from "../shared/observation"

interface ReceivedSnapshot {
  snapshot: NetworkSnapshot
  receivedAt: number
}

/**
Производная Window-проекция наблюдений release. Время относится к получению
сообщения в этом Window: молчание источника не доказывает закрытие связи.
Старые snapshots не заменяют более новые; одинаковый seq подтверждает
доступность источника после адресного повторного запроса.
*/
export function createNetworkProjection(windowId: string) {
  const received = new Map<string, ReceivedSnapshot>()
  const peerReports = new Map<string,{snapshot:PeerNetworkObservation;receivedAt:number}>()
  let controllerProducer: string | null = null
  const limit = 12
  return {
    accept(input: unknown, now: number, fromController = false): boolean {
      const peer=parsePeerNetworkObservation(input)
      if(peer){const previous=peerReports.get(peer.producerId);if(previous&&previous.snapshot.seq>peer.seq)return false;peerReports.set(peer.producerId,{snapshot:peer,receivedAt:now});if(peerReports.size>8)peerReports.delete(peerReports.keys().next().value!);return true}
      const snapshot = parseNetworkSnapshot(input)
      if (snapshot === null) return false
      const previous = received.get(snapshot.producerId)
      if (previous && previous.snapshot.seq > snapshot.seq) return false
      if (fromController) controllerProducer = snapshot.producerId
      received.set(snapshot.producerId, {snapshot, receivedAt: now})
      if (received.size > limit) {
        const oldest = [...received.entries()].sort((a, b) => a[1].receivedAt - b[1].receivedAt)[0]
        if (oldest) received.delete(oldest[0])
      }
      return true
    },
    controllerChanged() { controllerProducer = null },
    view(now: number, controller: string | null): InfrastructureProjection {
      const frames = [{id: "browser", label: "Браузер"}, {id: "server", label: "Сетевые адреса"}]
      const nodes: InfrastructureProjection["nodes"][number][] = [{
        id: windowId,
        frameId: "browser",
        label: "Window · MetaFor",
        details: controller === null ? "Service Worker не контролирует страницу" : "Страница под управлением Service Worker",
      }]
      const connections: InfrastructureProjection["connections"][number][] = []
      if (controller !== null) {
        nodes.push({id: "service-worker", frameId: "browser", label: "Service Worker", details: controller})
        connections.push({id: "controller", from: windowId, to: "service-worker", label: "Управление страницей", state: "open"})
      }
      for (const {snapshot, receivedAt} of received.values()) {
        const fresh = now - receivedAt < 10_000
        const ended = snapshot.state === "destroyed"
        const runtimeId = `runtime:${snapshot.producerId}`
        const age = fresh ? "сведения актуальны" : "сведения устарели; состояние не подтверждено"
        const transfers = snapshot.transfers.filter(transfer => transfer.kind === "cache" || transfer.kind === "network").slice(-3)
          .map(transfer => `${transfer.kind === "cache" ? "Cache" : "Fetch"} · ${new URL(transfer.endpoint).pathname} · ${transfer.phase}${transfer.status === undefined ? "" : ` ${transfer.status}`}`)
        nodes.push({
          id: runtimeId,
          frameId: "browser",
          label: `Release ${snapshot.releaseVersion ?? "версия неизвестна"} · ${snapshot.producerId.slice(0, 6)}`,
          details: `${snapshot.state} · ${age}\nCache: ${snapshot.counts.cacheHits} · Запросы сети: ${snapshot.counts.networkRequests}\nНаблюдение с запуска этого release${transfers.length === 0 ? "" : `\n${transfers.join("\n")}`}`,
        })
        if (controller !== null && !ended && controllerProducer === snapshot.producerId) connections.push({
          id: `runtime-observation:${snapshot.producerId}`,
          from: "service-worker",
          to: runtimeId,
          label: "Ответивший release",
          state: fresh ? "open" : "unknown",
        })
        for (const connection of snapshot.connections) {
          const endpointId = `endpoint:${snapshot.producerId}:${connection.id}`
          nodes.push({
            id: endpointId,
            frameId: "server",
            label: `WebSocket · ${connection.id.slice(0, 6)}`,
            details: `${connection.endpoint}\n${fresh ? connection.state : "состояние не подтверждено"}\nСообщения UTF-8: ↑${connection.sentBytes} Б · ↓${connection.receivedBytes} Б`,
          })
          if (connection.state !== "closed") connections.push({
            id: connection.id,
            from: runtimeId,
            to: endpointId,
            label: `WebSocket ↔ · ${fresh ? connection.state : "неизвестно"}`,
            state: fresh ? connection.state : "unknown",
          })
        }
      }
      for(const {snapshot,receivedAt} of peerReports.values()) {
        const current=now-receivedAt<PEER_OBSERVATION_TTL_MS
        const prefix=`peer-observer:${snapshot.producerId}`
        const peerNode=(peerId:string|null)=>`${prefix}:peer:${peerId??"local"}`
        for(const peer of snapshot.peers) {
          const frame=`${prefix}:device:${peer.peerId??"local"}`
          const fresh=current&&peer.status==="fresh"
          frames.push({id:frame,label:peer.peerId??"Локальный release"})
          nodes.push({id:peerNode(peer.peerId),frameId:frame,label:peer.peerId??"Локальный release",details:`Источник: ${peer.source} · ${current?peer.status:"expired"}\nProducer: ${snapshot.producerId} · seq ${snapshot.seq}\nTransport: ${peer.transport??"нет подтверждения"}`})
          if(peer.source==="peer"&&peer.generation&&peer.connectionState!=="disconnected")connections.push({id:`${prefix}:external:${peer.peerId}`,from:peerNode(snapshot.localPeerId),to:peerNode(peer.peerId),label:"Peer",state:current?peer.connectionState:"unknown"})
          if(!fresh||!peer.report)continue
          for(const domain of peer.report.domains)nodes.push({id:`${peerNode(peer.peerId)}:domain:${domain.name}`,frameId:frame,label:domain.name,details:`${domain.state} · ${peer.source} report\nTransport: ${peer.report.links.find(link=>link.to===domain.name)?.transport??"нет внешней связи"}\nIncarnation: ${peer.report.producerId} · seq ${peer.report.seq}`})
          for(const link of peer.report.links)for(const lane of ["oracle","force"] as const) {
            const ready=lane==="oracle"?link.oracleReady:link.forceReady
            connections.push({id:`${peerNode(peer.peerId)}:${link.to}:${lane}`,from:`${peerNode(peer.peerId)}:domain:dark`,to:`${peerNode(peer.peerId)}:domain:${link.to}`,label:lane==="oracle"?"Oracle":"Force",state:link[lane]==="closed"?"closed":ready===true&&link[lane]==="open"?"open":link[lane]==="connecting"?"connecting":"unknown"})
          }
        }
      }
      return {frames, nodes, connections}
    },
  }
}

/**
Читает снимки через существующий message path Service Worker и одну локальную
BroadcastChannel. Адресный запрос будит worker и восстанавливает состояние
поздно открытой вкладки. Канал не меняет доставку кода или release RPC.
Наблюдение начинается после загрузки release main, а не с первого HTML.
*/
export function observeBrowserNetwork(present: (value: InfrastructureProjection) => void): () => void {
  const projection = createNetworkProjection(crypto.randomUUID())
  let channel: BroadcastChannel | null = null
  let disposed = false
  const ports = new Set<MessagePort>()
  const timeouts = new Set<ReturnType<typeof setTimeout>>()
  const workers = navigator.serviceWorker
  const request = {schema: NETWORK_OBSERVATION_SCHEMA, kind: "snapshot-request"}
  const render = () => {
    if (disposed) return
    const script = workers?.controller?.scriptURL
    const controller = script ? new URL(script).pathname : null
    present(projection.view(performance.now(), controller))
  }
  const receive = (event: MessageEvent) => {
    if (disposed) return
    if (projection.accept(event.data, performance.now())) render()
  }
  const refresh = () => {
    if (disposed) return
    try { channel?.postMessage(request);channel?.postMessage(peerObservationRequest()) } catch {}
    const controller = workers?.controller
    if (controller) {
      const pair = new MessageChannel()
      ports.add(pair.port1)
      const close = () => { pair.port1.close(); ports.delete(pair.port1) }
      pair.port1.onmessage = event => {
        if (!disposed && projection.accept(event.data, performance.now(), workers.controller === controller)) render()
        close()
      }
      const timeout = setTimeout(() => { close(); timeouts.delete(timeout) }, 2_000)
      timeouts.add(timeout)
      try { controller.postMessage(request, [pair.port2]);
        const peers=new MessageChannel();ports.add(peers.port1);peers.port1.onmessage=event=>{if(!disposed&&projection.accept(event.data,performance.now()))render()};
        const expiry=setTimeout(()=>{peers.port1.close();ports.delete(peers.port1);timeouts.delete(expiry)},2000);timeouts.add(expiry);controller.postMessage(peerObservationRequest(),[peers.port2])
      } catch { close(); pair.port2.close() }
    }
    render()
  }
  try {
    channel = new BroadcastChannel(NETWORK_OBSERVATION_CHANNEL)
    channel.onmessage = receive
  } catch {}
  const controllerChanged = () => { projection.controllerChanged(); refresh() }
  workers?.addEventListener("controllerchange", controllerChanged)
  const timer = setInterval(refresh, 3_000)
  refresh()
  return () => {
    disposed = true
    clearInterval(timer)
    for (const timeout of timeouts) clearTimeout(timeout)
    for (const port of ports) port.close()
    workers?.removeEventListener("controllerchange", controllerChanged)
    channel?.close()
  }
}
