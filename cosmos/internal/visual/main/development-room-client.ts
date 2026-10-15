import {DEVELOPMENT_PATH, type DevelopmentCatalog, type DevelopmentContent} from "../../../release/shared/development"
import type {DevelopmentRoomChatHost, DevelopmentRoomPorts} from "./development-room-ports"

type AgentResponse = Readonly<{executorId: string; executorLabel: string}>

/** Команды посещённой комнаты используют тот же короткоживущий reader grant, что Source. */
async function request(path: string, body: object): Promise<unknown> {
  const reader = await fetch(`${DEVELOPMENT_PATH}/reader`, {
    method: "POST", headers: {"content-type": "application/json"}, body: "{}",
  })
  if (!reader.ok) throw new Error("Не удалось назначить запрос Cosmos")
  const grant = await reader.json()
  if (typeof grant.readerToken !== "string") throw new Error("Некорректный reader grant Cosmos")
  const response = await fetch(`${DEVELOPMENT_PATH}/${path}`, {
    method: "POST", headers: {"content-type": "application/json", "x-storybook-session": grant.readerToken}, body: JSON.stringify(body),
  })
  const value = await response.json().catch(() => null)
  if (!response.ok) {
    const error = typeof value?.error === "string" ? value.error : value?.error?.message
    throw new Error(typeof error === "string" ? error : "Команда Cosmos не подтверждена")
  }
  return value
}

function agent(value: unknown): {executorId: string; label: string} {
  if (!value || typeof value !== "object" || typeof (value as AgentResponse).executorId !== "string" ||
    typeof (value as AgentResponse).executorLabel !== "string") throw new Error("Некорректная identity агента Cosmos")
  return {executorId: (value as AgentResponse).executorId, label: (value as AgentResponse).executorLabel}
}

/** Host разрешает packageName только через назначенный каталог, а не из произвольного пути модели. */
export function createDevelopmentRoomClient(catalog: () => DevelopmentCatalog | null,
  chat: DevelopmentRoomPorts["chat"]): DevelopmentRoomPorts {
  const address = (packageName: string) => {
    const pkg = catalog()?.packages.find(item => item.name === packageName)
    if (!pkg) throw new Error("Package отсутствует в каталоге Cosmos")
    return pkg.address
  }
  return {
    async content(packageName, nodeId): Promise<DevelopmentContent> {
      address(packageName)
      const value = await request("content", {packageName, ...(nodeId ? {nodeId} : {})})
      if (!value || typeof value !== "object" || (value as DevelopmentContent).packageName !== packageName ||
        typeof (value as DevelopmentContent).revision !== "string") throw new Error("Некорректное содержание Package")
      return value as DevelopmentContent
    },
    agents: {
      async list(packageName) {
        const value = await request("chat/list", {address: address(packageName)})
        if (!Array.isArray(value)) throw new Error("Некорректный список агентов Cosmos")
        return value.map(agent)
      },
      async create(packageName, label) {
        return agent(await request("chat/create", {address: address(packageName), label}))
      },
    },
    chat,
  }
}

/** Публичный pinned host поставляет существующий Chat view; transport остаётся у Cosmos. */
export type DevelopmentChatFactory = (input: Readonly<{address: string; label: string; executorId: string}>) => DevelopmentRoomChatHost
