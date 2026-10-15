import type {ClientViewInspection} from "@metafor/types/cosmos/client"
import type {DevelopmentRoomAgentsSnapshot} from "./development-room-agents"
import type {DevelopmentRoomSnapshot} from "./development-room-scene"

/** Ограниченная Cosmos-проекция одного фактически выбранного Source Package. */
export function inspectDevelopmentRoom(base: ClientViewInspection, scene: DevelopmentRoomSnapshot,
  agents: DevelopmentRoomAgentsSnapshot, catalogError: string | null): ClientViewInspection {
  const selected = scene.selectedPackage
  const currentAgents = agents.packageName === selected?.name && selected?.resolution === "source"
  const participants = currentAgents ? agents.agents : []
  const error = catalogError ?? scene.error ?? (currentAgents ? agents.error : null)
  const loading = !scene.catalog || currentAgents && agents.loading
  const bounded = participants.filter(agent => agent.executorId.length > 0 && agent.executorId.length <= 256).slice(0, 64)
  return {
    mode: "cosmos",
    status: error ? "error" : loading ? "loading" : "ready",
    error: error?.slice(0, 4096) ?? null,
    selected: null,
    offices: [],
    text: selected ? `${selected.label} · ${selected.name}`.slice(0, 16_384) : "Обзор исходных Package",
    controls: base.controls,
    sourceRoom: {
      packageName: selected?.name ?? null,
      resolution: selected?.resolution ?? null,
      view: scene.view,
      participants: bounded.map(agent => ({executorId: agent.executorId, label: agent.label.slice(0, 512)})),
      participantsTruncated: participants.length > bounded.length,
    },
  }
}
