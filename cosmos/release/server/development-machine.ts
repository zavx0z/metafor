import type {createNativeReplOracle, NativeReplAssignment} from "./repl"
import type {DevelopmentMachineGrant} from "./development-environment"

type Repl = Pick<ReturnType<typeof createNativeReplOracle>, "open" | "evaluate" | "read" | "waitForJob" | "closeSession">
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)

/** Один host-issued grant использует существующий REPL выпуска; модель не выбирает host, cwd или credential. */
export function createDevelopmentMachineGrant(options: {hostId: string, revision: string, repl: Repl, assignment: NativeReplAssignment, cwd: string}): DevelopmentMachineGrant {
  let session: Awaited<ReturnType<Repl["open"]>> | undefined
  let disposed = false, running = false, initialized = false
  return {
    hostId: options.hostId,
    revision: options.revision,
    capability: "bun.evaluate",
    tool: {
      name: "bun.evaluate",
      title: "Bun на назначенной машине",
      description: `Исполняет явный код в долгоживущем Bun на назначенной хостом машине ${options.hostId} с полным доступом к ОС. Начальная директория принадлежит назначенному Package. Host и полномочия не меняются аргументами. Неизвестный исход не повторяется автоматически.`,
      inputSchema: {type: "object", properties: {code: {type: "string", maxLength: 524288}, timeoutMs: {type: "integer", minimum: 1, maximum: 2147483647}}, required: ["code"], additionalProperties: false},
      outputSchema: {type: "object"},
      annotations: {readOnlyHint: false, destructiveHint: true, idempotentHint: false},
      async execute(input, context) {
        if (disposed || running || !context) throw new Error("Assigned machine execution is unavailable")
        if (!object(input) || Object.keys(input).some(key => !["code", "timeoutMs"].includes(key)) || typeof input.code !== "string"
          || Buffer.byteLength(input.code) > 524288 || input.timeoutMs !== undefined && (typeof input.timeoutMs !== "number" || !Number.isSafeInteger(input.timeoutMs)
            || input.timeoutMs < 1 || input.timeoutMs > 2147483647)) throw new Error("Expected code and optional timeoutMs; host selection is not a model argument")
        running = true
        try {
          context.signal.throwIfAborted()
          const requestId = crypto.randomUUID()
          session ??= await options.repl.open({token: options.assignment.token, requestId: `development:${requestId}`})
          const target = {token: options.assignment.token, sessionId: session.sessionId, incarnation: session.incarnation}
          context.signal.throwIfAborted()
          // Session сохраняет цель команды до execute; этот вызов evaluate выполняется один раз, без retry.
          const cursor = options.repl.read({...target, cursor: 0, limit: 512}).cursor
          const code = initialized ? input.code : `process.chdir(${JSON.stringify(options.cwd)});\n${input.code}`
          const admitted = options.repl.evaluate({...target, requestId, code, ...(input.timeoutMs === undefined ? {} : {timeoutMs: input.timeoutMs})})
          initialized = true
          const result = await options.repl.waitForJob({...target, cursor, limit: 512, jobId: admitted.job.id}, context.signal)
          const job = result.jobs.find(job => job.id === admitted.job.id)
          if (!job || job.codeHash !== admitted.job.codeHash || !["completed", "failed"].includes(job.state)) throw new Error("Machine execution outcome is uncertain; execution will not be resubmitted")
          const stdout = result.logs.filter(log => log.stream === "stdout").map(log => log.text).join("").slice(-32768)
          const stderr = result.logs.filter(log => log.stream === "stderr").map(log => log.text).join("").slice(-32768)
          return {operation: "bun.evaluate", hostId: options.hostId, incarnation: session.incarnation, jobId: job.id,
            state: job.state, result: job.result, error: job.error, stdout, stderr, droppedThrough: result.droppedThrough}
        } finally {running = false}
      },
    },
    dispose() {
      if (disposed) return
      disposed = true
      if (session) void options.repl.closeSession({token: options.assignment.token, sessionId: session.sessionId, incarnation: session.incarnation}).catch(() => {})
    },
  }
}
