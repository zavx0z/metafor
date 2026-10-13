import repl from "node:repl"
import {PassThrough} from "node:stream"
import {inspect} from "node:util"
import {AsyncLocalStorage} from "node:async_hooks"

const input = new PassThrough(), output = new PassThrough()
/** @type {AsyncLocalStorage<{finish: (error: unknown, value?: unknown) => void}>} */
const evaluation = new AsyncLocalStorage()
const settings = {input, output, terminal: false, prompt: "", useGlobal: false,
  // Bun node:repl передаёт runtime/TLA failures через handleError, не eval callback.
  // https://github.com/oven-sh/bun/blob/main/src/js/node/repl.js
  /** @param {unknown} error @returns {"ignore"} */
  handleError(error) {evaluation.getStore()?.finish(error instanceof Error ? error : new Error(`Thrown: ${String(error)}`)); return "ignore"},
}
const server = repl.start(settings)
const calls = new Map()
let running = false
/** @param {Record<string, unknown>} message */
const send = message => process.send?.(message)
output.on("data", chunk => process.stdout.write(chunk))
server.context.oracle = Object.freeze({call(target, method, params) {
  if (typeof target !== "string" || !target.trim() || typeof method !== "string" || !method.trim()) {
    return Promise.reject(new TypeError('oracle.call requires (target, method, params), for example oracle.call("dark", "readGraph", {})'))
  }
  const id = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    calls.set(id, {resolve, reject})
    send({kind: "oracle-call", id, target, method, params})
  })
}})
process.on("message", input => {
  if (!input || typeof input !== "object") return
  const message = /** @type {{kind: string, id: string, code: string, ok: boolean, value: unknown, error: string}} */ (input)
  if (message.kind === "oracle-result") {
    const call = calls.get(message.id)
    if (!call) return
    calls.delete(message.id)
    if (message.ok) call.resolve(message.value)
    else call.reject(new Error(message.error))
    return
  }
  if (message.kind !== "evaluate" || running) return
  running = true
  send({kind: "started", id: message.id})
  let finished = false
  /** @param {unknown} error @param {unknown} [value] */
  const finish = (error, value) => {
    if (finished) {if (error) process.stderr.write(`Background REPL error: ${String(error)}\n`); return}
    finished = true
    let result = null, failure = error ? String(error instanceof Error ? error.stack || error : error) : null
    if (!error) {
      try {result = inspect(value, {depth: 6, maxArrayLength: 100, maxStringLength: 32768, customInspect: false, getters: false})}
      catch (error) {failure = `Result inspection failed: ${String(error)}`}
    }
    running = false
    send({kind: "finished", id: message.id, result, error: failure, cwd: process.cwd()})
  }
  evaluation.run({finish}, () => server.eval(message.code, server.context, "oracle-repl", finish))
})
send({kind: "ready", cwd: process.cwd()})
