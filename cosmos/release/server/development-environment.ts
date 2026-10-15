import createEnvironment, {type StorybookAppEnvironment} from "@zavx0z/storybook-app-environment"
import preparePortablePackage from "@zavx0z/storybook-package-env/portable"
import type {StorybookChatSession} from "@zavx0z/storybook-chat-session"
import type {StorybookAppEnvironmentBinding} from "@zavx0z/storybook-app-environment-binding"
import type {createDevelopmentCatalog} from "./development-catalog"

type Input = Parameters<NonNullable<StorybookChatSession.Input["environment"]>>[0]
type Environment = Awaited<ReturnType<NonNullable<StorybookChatSession.Input["environment"]>>>
type Source = ReturnType<Awaited<ReturnType<typeof createDevelopmentCatalog>>["source"]>
type Tool = NonNullable<StorybookAppEnvironmentBinding.Input["extensions"]>[number]
const reads = new Set(["filesystem.stat", "filesystem.read", "filesystem.read-many", "filesystem.list", "git.status"])

/** Секрет и выбранный host остаются в доверенном замыкании инструмента. */
export type DevelopmentMachineGrant = Readonly<{
  hostId: string
  revision: string
  capability: "bun.evaluate"
  tool: Tool
  dispose?(): void
}>
export type DevelopmentEnvironmentHost = Readonly<{
  instructions(source: Source): Promise<readonly Readonly<{source: string, content: string, contentHash?: string}>[]>
  readKnowledge(source: Source, path: string | undefined, signal: AbortSignal): Promise<Response>
  /** Выдача хостом до первого prompt; отсутствие не объявляет bun.evaluate. */
  machine?(input: Input, source: Source): DevelopmentMachineGrant | undefined
}>

/** Собственное назначение Cosmos; внешний Project, bearer и model loop не используются. */
export async function createDevelopmentEnvironment(catalog: Awaited<ReturnType<typeof createDevelopmentCatalog>>, host: DevelopmentEnvironmentHost,
  input: Input): Promise<Environment> {
  const source = catalog.subject(input.address), machine = host.machine?.(input, source)
  if (machine && (machine.capability !== "bun.evaluate" || machine.tool.name !== "bun.evaluate")) throw new Error("Invalid assigned development machine capability")
  const environment = createEnvironment({
    prepare: ({subject, extensions}) => preparePortablePackage({directory: subject.directory, extensions}),
    resolve(address) {
      if (address !== source.address) throw new Error("Development assignment changed")
      return {address, label: source.label, directory: source.directory}
    },
    instructions: () => host.instructions(source),
    readKnowledge: ({address, path, signal}) => {
      if (address !== source.address) throw new Error("Development knowledge scope changed")
      return host.readKnowledge(source, path, signal)
    },
    extensions: () => machine ? [machine.tool] : [],
    async authorize(action) {
      if (!source.writable && action.command.name.startsWith("filesystem.") && !reads.has(action.command.name)) throw new Error("Source writing is not assigned")
      await input.authorize(action.id, action.command, action.signal)
    },
    onCall(event) {
      return input.onUpdate(event.phase === "running" ? {sessionUpdate: "tool_call", toolCallId: event.id, title: event.name,
        status: "in_progress", rawInput: event.arguments} : {sessionUpdate: "tool_call_update", toolCallId: event.id,
        status: event.phase === "progress" ? "in_progress" : event.phase === "success" ? "completed" : "failed",
        rawOutput: event.phase === "progress" ? event.progress : event.phase === "success" ? event.result : {error: event.error}})
    },
  })
  try {
    const assignment = await environment.assign({executorId: input.executorId, executorLabel: input.executorLabel, address: source.address})
    return {
      content: [{type: "text", text: JSON.stringify({environment: assignment.bootstrap})},
        {type: "text", text: JSON.stringify({workspace: {id: catalog.snapshot.workspaceId, revision: catalog.snapshot.revision, environmentInstance: crypto.randomUUID(), package: source.name, writable: source.writable,
          machine: machine ? {hostId: machine.hostId, revision: machine.revision, capability: machine.capability} : null}})}],
      async execute(command, signal) {
        const response = await environment.handle(new Request("http://cosmos/api/environment", {method: "POST", signal,
          headers: {authorization: `Bearer ${assignment.token}`, "content-type": "application/json"}, body: JSON.stringify(command)}))
        return [{type: "text", text: await response.text()}]
      },
      dispose() {environment.dispose(); machine?.dispose?.()},
    }
  } catch (error) {environment.dispose(); machine?.dispose?.(); throw error}
}
