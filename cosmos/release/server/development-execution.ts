import {mkdir, readFile, writeFile, rename} from "node:fs/promises"
import {join} from "node:path"
import type {StorybookChatSession} from "@zavx0z/storybook-chat-session"
import type {DevelopmentConfiguration} from "../shared/development"

type Resolve = NonNullable<StorybookChatSession.Input["resolveExecution"]>
type Selection = Parameters<Resolve>[0]["selection"]
/** Выбор модели хранится отдельно от grant: transport и machine policy всегда подтверждает host config. */
export function createDevelopmentExecution(config: DevelopmentConfiguration) {
  const filename = join(config.stateDirectory, "execution-selections.json")
  let state: Promise<Record<string, Selection>> | undefined
  let writing = Promise.resolve()
  const read = () => state ??= readFile(filename, "utf8").then(text => {
    const value = JSON.parse(text)
    if (value.version !== 1 || !value.executors || typeof value.executors !== "object" || Array.isArray(value.executors)) throw new Error("Invalid development execution selections")
    return value.executors as Record<string, Selection>
  }).catch(error => {if (error.code === "ENOENT") return {} as Record<string, Selection>; throw error})
  const key = (address: string, executorId: string) => JSON.stringify([address, executorId])
  const resolve: Resolve = async input => {
    const executor = input.executorSelection ?? (await read())[key(input.subject.address, input.executorId)] ?? {}
    const selection = {...executor, ...input.selection}
    const connectionId = input.pinnedConnectionId ?? selection.connectionId ?? config.execution.connectionId
    if (!config.execution.connections.some(connection => connection.id === connectionId && connection.enabled)) throw new Error("Development connection is not assigned")
    const approvalMode = config.execution.approvalMode ?? "ask"
    return {selection: input.selection, executorSelection: executor, ...(input.pinnedConnectionId === undefined ? {} : {pinnedConnectionId: input.pinnedConnectionId}),
      effective: {...selection, connectionId, approvalMode}, sources: {connectionId: input.pinnedConnectionId ? "native" : selection.connectionId ? "executor" : "general", approvalMode: "general"},
      approvalCapabilities: {modes: [approvalMode], autoReview: false, scope: "assignment"}, approvalPolicyRevision: 1, connections: config.execution.connections}
  }
  const save: NonNullable<StorybookChatSession.Input["saveExecutorSelection"]> = input => {
    const task = writing.then(async () => {
      if (input.selection.approvalMode !== undefined && input.selection.approvalMode !== (config.execution.approvalMode ?? "ask")) throw new Error("Approval policy belongs to the operator assignment")
      const current = await read(), {approvalMode: _mode, ...portable} = input.selection
      const next = {...current, [key(input.subject.address, input.executorId)]: portable}
      await mkdir(config.stateDirectory, {recursive: true, mode: 0o700})
      const temporary = filename + ".tmp"
      await writeFile(temporary, JSON.stringify({version: 1, executors: next}), {mode: 0o600})
      await rename(temporary, filename)
      state = Promise.resolve(next)
    })
    writing = task.catch(() => {})
    return task
  }
  return {resolve, save}
}
