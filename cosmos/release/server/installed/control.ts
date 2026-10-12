import {
  currentServerProcessIdentity,
  currentServerProcessLaunch,
  readServerProcessCommand,
  readServerProcessHandoverResult,
  sameServerProcessIdentity,
  serverProcessFailure,
  serverProcessLifecycle,
  type ServerProcessOperation,
} from "../../../shared/package/process"

/** Принадлежащие release действия над подготовленным рабочим входом. */
export interface ServerApplicationLifecycle {
  bind(): Promise<void>
  admit(): Promise<void>
  quiesce(): Promise<void>
  resume(): Promise<void>
  unbind(): Promise<void>
  destroy(): Promise<void>
}

/**
Связывает готовый release runtime с его startup по process IPC.
Передаёт подтверждение только после фактической операции. Новый выпуск сам не
назначает active: он просит parent переключить уже установленную цель.
Возвращённый bound завершается после bind или отклоняется после сообщения о
его отказе. Ошибочная команда без фактической попытки bind не завершает этот
promise. Caller ожидает cleanup вне очереди операций перед выходом с ошибкой;
проверки — [отказ запуска](../../spec/installed-startup-failure.spec.ts).
*/
export async function attachServerProcessControl(runtime: ServerApplicationLifecycle) {
  const launch = currentServerProcessLaunch()
  if (!launch || !process.send) throw new Error("Installed server requires its startup process")
  const identity = currentServerProcessIdentity()
  let phase: "prepared" | "bound" | "active" | "quiesced" | "unbound" | "destroyed" = "prepared"
  let stopped = false
  let destroying: Promise<void> | undefined
  let queue = Promise.resolve()
  let transition = launch.transitionId
  let resolveBound!: () => void
  let rejectBound!: (error: unknown) => void
  const bound = new Promise<void>((resolve, reject) => {resolveBound = resolve; rejectBound = reject})
  void bound.catch(() => {})
  const requests = new Map<string, {resolve(): void; reject(error: unknown): void; timer: ReturnType<typeof setTimeout>}>()

  const send = (value: unknown) => process.send?.(value)
  const acknowledge = (type: Parameters<typeof serverProcessLifecycle>[0], id: string) =>
    send(serverProcessLifecycle(type, identity, id))

  const message = (value: unknown) => {
    if (stopped) return
    const result = readServerProcessHandoverResult(value)
    if (result) {
      const request = requests.get(result.requestId)
      if (!request) return
      requests.delete(result.requestId)
      clearTimeout(request.timer)
      if (result.success) request.resolve()
      else request.reject(new Error(result.error))
      return
    }
    const command = readServerProcessCommand(value)
    if (!command || !sameServerProcessIdentity(command.identity, identity)) return
    queue = queue.then(async () => {
      if (stopped) return
      let binding = false
      try {
        if (phase === "destroyed") throw new Error("Release runtime is destroyed")
        if (command.type === "quiesce" && phase === "active") transition = command.transitionId
        if (command.transitionId !== transition) throw new Error("Release transition identity differs")
        binding = command.type === "bind" && phase === "prepared"
        await apply(command.type)
        if (stopped) return
        const response = {bind: "ready", admit: "admitted", quiesce: "quiesced", resume: "resumed", unbind: "unbound"} as const
        acknowledge(response[command.type], command.transitionId)
      } catch (error) {
        if (!stopped) send(serverProcessFailure(command.type, identity, command.transitionId, errorMessage(error)))
        // Settle the entrypoint only for a real bind attempt. Invalid/stale
        // commands keep their existing retryable IPC rejection semantics.
        if (binding) rejectBound(error)
      }
    })
  }

  async function apply(operation: ServerProcessOperation) {
    switch (operation) {
      case "bind":
        if (phase !== "prepared") throw new Error("Release is not prepared for binding")
        await runtime.bind()
        phase = "bound"
        resolveBound()
        return
      case "admit":
        if (phase !== "bound") throw new Error("Release is not ready for admission")
        await runtime.admit()
        phase = "active"
        return
      case "quiesce":
        if (phase !== "active") throw new Error("Only active release may quiesce")
        await runtime.quiesce()
        phase = "quiesced"
        return
      case "resume":
        // Quiesce может закрыть admission до отказа ожидаемого drain.
        if (phase !== "quiesced" && phase !== "active") throw new Error("Release cannot resume after unbind")
        await runtime.resume()
        phase = "active"
        return
      case "unbind":
        if (phase !== "quiesced") throw new Error("Release must quiesce before unbind")
        await runtime.unbind()
        phase = "unbound"
    }
  }

  process.on("message", message)
  const stop = () => { void shutdown(true) }
  process.on("SIGTERM", stop)
  process.on("SIGINT", stop)
  const disconnect = () => { void shutdown(false) }
  process.once("disconnect", disconnect)
  acknowledge("prepared", launch.transitionId)

  async function destroy() {
    if (destroying) return await destroying
    stopped = true
    phase = "destroyed"
    process.off("message", message)
    for (const request of requests.values()) {
      clearTimeout(request.timer)
      request.reject(new Error("Server release was destroyed"))
    }
    requests.clear()
    destroying = (async () => {
      try {
        // Сначала отменяем свой I/O, затем завершаем уже начатые операции.
        const errors: unknown[] = []
        try { await runtime.destroy() } catch (error) { errors.push(error) }
        try { await queue } catch (error) { errors.push(error) }
        try { await runtime.destroy() } catch (error) { errors.push(error) }
        phase = "destroyed"
        if (errors.length > 0) throw new AggregateError(errors, "Server release cleanup failed")
      } finally {
        // A parent's teardown signal joins cleanup already started by a failed
        // bind; default signal termination must not cut owned cleanup short.
        process.off("SIGTERM", stop)
        process.off("SIGINT", stop)
        process.off("disconnect", disconnect)
      }
    })()
    await destroying
  }

  async function shutdown(disconnectParent: boolean) {
    try {
      await destroy()
      if (disconnectParent && process.connected) process.disconnect?.()
    } catch {
      // Parent наблюдает nonzero exit; cleanup failure не создаёт unhandled rejection.
      process.exit(1)
    }
  }

  return {
    bound,
    destroy,
    requestHandover(target: string, timeoutMs = 120_000): Promise<void> {
      if (stopped || phase !== "active") return Promise.reject(new Error("Only active release may request handover"))
      if (!/^[a-f0-9]{64}$/.test(target)) return Promise.reject(new Error("Invalid installed release target"))
      const requestId = crypto.randomUUID()
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          requests.delete(requestId)
          reject(new Error("Server handover result timed out"))
        }, timeoutMs)
        requests.set(requestId, {resolve, reject, timer})
        try { send({type: "handover-request", requestId, target}) }
        catch (error) { clearTimeout(timer); requests.delete(requestId); reject(error) }
      })
    },
  }
}

function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error) }
