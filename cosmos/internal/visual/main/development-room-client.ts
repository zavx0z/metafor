import {DEVELOPMENT_PATH, type DevelopmentCatalog, type DevelopmentContent} from "../../../release/shared/development"
import type {DevelopmentRoomChatHost, DevelopmentRoomPorts} from "./development-room-ports"
import type {DevelopmentAgentProfile} from "../../../release/shared/development-agent"

type AgentResponse = Readonly<{executorId: string; executorLabel: string; sourceProfile?: DevelopmentAgentProfile}>

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

function profile(value: unknown, packageName: string, executorId: string): DevelopmentAgentProfile {
  const input = value as DevelopmentAgentProfile | null
  if (!input || input.version !== 1 || input.scope?.packageName !== packageName || input.scope.executorId !== executorId ||
      !Number.isSafeInteger(input.revision) || input.revision < 1 || typeof input.name !== "string" || !input.name.trim() ||
      input.gender !== "male" && input.gender !== "female") throw new Error("Некорректный профиль Source агента")
  return input
}

function agent(value: unknown, packageName: string) {
  if (!value || typeof value !== "object" || typeof (value as AgentResponse).executorId !== "string" ||
    typeof (value as AgentResponse).executorLabel !== "string") throw new Error("Некорректная identity агента Cosmos")
  const input = value as AgentResponse
  return {executorId: input.executorId, label: input.executorLabel,
    ...(input.sourceProfile ? {profile: profile(input.sourceProfile, packageName, input.executorId)} : {})}
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
        return value.map(item => agent(item, packageName))
      },
      async create(packageName, label) {
        return agent(await request("chat/create", {address: address(packageName), label}), packageName)
      },
      async prepareProfile(packageName, executorId) {
        return profile(await request("chat/agent-profile-prepare", {address: address(packageName), executorId}), packageName, executorId)
      },
      async updateProfile(packageName, executorId, update) {
        return profile(await request("chat/agent-profile-update", {address: address(packageName), executorId, profile: update}), packageName, executorId)
      },
    },
    chat,
  }
}

/** Публичный pinned host поставляет существующий Chat view; transport остаётся у Cosmos. */
export type DevelopmentChatFactory = (input: Readonly<{address: string; label: string; executorId: string}>) => DevelopmentRoomChatHost

/** Exact assigned source identity alone may enter a Package room through the Window router. */
export function selectSourcePackage(catalog: DevelopmentCatalog | null, packageName: string,
  navigate: (name: string) => void): void {
  if (!catalog?.packages.some(pkg => pkg.name === packageName && pkg.resolution === "source"))
    throw new Error("Source Package is absent from the assigned Cosmos catalog")
  navigate(packageName)
}
