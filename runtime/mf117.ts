import {readFileSync} from "node:fs"
import {join} from "node:path"
import {
  MF117_COMMAND_SCHEMA,
  MF117_STATE_DIRECTORY,
} from "../shared/mf117.ts"

const action = process.argv[2]
if (action !== "preflight" && action !== "activate") {
  throw new Error(
    "Usage: bun runtime/mf117.ts preflight | activate <preflight-receipt-id>",
  )
}
const receiptId = process.argv[3]
if (action === "activate" && !/^[0-9a-f]{64}$/.test(receiptId ?? "")) {
  throw new Error("MF-117 activate requires the exact preflight receipt ID")
}
const token = readFileSync(
  join(MF117_STATE_DIRECTORY, "owner-capability"),
  "utf8",
).trim()
const response = await fetch(
  "http://127.0.0.1:4000/internal/mf117/inference-to-lada",
  {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(
      action === "preflight"
        ? {schema: MF117_COMMAND_SCHEMA, action}
        : {
            schema: MF117_COMMAND_SCHEMA,
            action,
            preflightReceiptId: receiptId,
          },
    ),
    signal: AbortSignal.timeout(120_000),
  },
)
const body = await response.text()
if (!response.ok) {
  throw new Error(`MF-117 command failed (${response.status}): ${body}`)
}
process.stdout.write(`${body}\n`)
