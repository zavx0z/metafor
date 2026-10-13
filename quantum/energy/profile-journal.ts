import {constants} from "node:fs"
import {open, rename, rm} from "node:fs/promises"
import {join} from "node:path"
import type {MassDirectoryLease} from "@metafor/types/metafor/mass"
import {isProfileIntentRefusal, type ProfileIntentRefusal, type ProfileIntentRequest, type ProfileIntentReceipt as PublicProfileIntentReceipt} from "@metafor/types/metafor/profile-intent"
import {isMetaFieldValueApplyRefusal, type MetaFieldValueApplyReceipt} from "shared/protocol/metafor/observation"
import {OracleRpcAdmissionRefusedError, OracleRpcRemoteError} from "shared/transport/oracle"
import {parseProfileIntent} from "./profile-intent"

type ProfileIntentReceipt = PublicProfileIntentReceipt<MetaFieldValueApplyReceipt>
type Entry = {request: ProfileIntentRequest, receipt: ProfileIntentReceipt | null, refusal?: ProfileIntentRefusal}
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
const limit = 1024 * 1024

/** Pending is fsynced before Field admission; a cold uncertain request is refused rather than repeated. */
export function createProfileIntentJournal(lease: MassDirectoryLease) {
  const path = join(lease.path, "oracle-profile-intents.json")
  let serial = Promise.resolve()
  const read = async (): Promise<Entry[]> => {
    let file: Awaited<ReturnType<typeof open>> | undefined
    try {
      file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
      const stat = await file.stat()
      if (!stat.isFile() || stat.size > limit || (stat.mode & 0o077) !== 0 || typeof process.getuid === "function" && stat.uid !== process.getuid()) throw new Error("Invalid profile intent journal")
      const value: unknown = JSON.parse(await file.readFile("utf8"))
      if (!object(value) || Object.keys(value).sort().join(",") !== "requests,schema,version" || value.schema !== "metafor/profile-intents/v1" || value.version !== 1 || !Array.isArray(value.requests) || value.requests.length > 256) throw new Error("Invalid profile intent journal")
      const entries: Entry[] = []
      for (const item of value.requests) {
        if (!object(item) || !["receipt,request", "receipt,refusal,request"].includes(Object.keys(item).sort().join(","))) throw new Error("Invalid profile intent journal")
        const request = parseProfileIntent(item.request)
        const receipt = item.receipt
        if (receipt !== null && (!object(receipt) || receipt.schema !== "metafor/profile-intent/v1" || receipt.version !== 1 || receipt.id !== request.id || receipt.operation !== request.operation || JSON.stringify(receipt.target) !== JSON.stringify(request.target) || !object(receipt.admission) || receipt.admission.resolution !== "exact")) throw new Error("Invalid profile intent receipt")
        if (item.refusal !== undefined && (receipt !== null || !isProfileIntentRefusal(item.refusal) || item.refusal.id !== request.id || item.refusal.operation !== request.operation || JSON.stringify(item.refusal.target) !== JSON.stringify(request.target))) throw new Error("Invalid profile intent refusal")
        entries.push({request, receipt: receipt as ProfileIntentReceipt | null, ...(item.refusal === undefined ? {} : {refusal: item.refusal as ProfileIntentRefusal})})
      }
      if (new Set(entries.map(entry => entry.request.id)).size !== entries.length) throw new Error("Duplicate profile intent identity")
      return entries
    } catch (error) {
      if (object(error) && error.code === "ENOENT") return []
      throw error
    } finally {await file?.close()}
  }
  const write = async (requests: Entry[]) => {
    lease.signal.throwIfAborted()
    const bytes = JSON.stringify({schema: "metafor/profile-intents/v1", version: 1, requests})
    if (Buffer.byteLength(bytes) > limit) throw new Error("Profile intent journal is full")
    const temporary = join(lease.path, `.oracle-profile-intents.${crypto.randomUUID()}.tmp`)
    let file: Awaited<ReturnType<typeof open>> | undefined
    try {
      file = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
      await file.writeFile(bytes)
      await file.sync()
      await file.close()
      file = undefined
      lease.signal.throwIfAborted()
      await rename(temporary, path)
      const directory = await open(lease.path, constants.O_RDONLY)
      try {await directory.sync()} finally {await directory.close()}
    } finally {await file?.close(); await rm(temporary, {force: true})}
  }
  return {admit(request: ProfileIntentRequest, apply: () => Promise<ProfileIntentReceipt>, preflight?: () => Promise<void>): Promise<ProfileIntentReceipt> {
    const work = serial.then(async () => {
      lease.signal.throwIfAborted()
      const entries = await read()
      const previous = entries.find(entry => entry.request.id === request.id)
      if (previous) {
        if (JSON.stringify(previous.request) !== JSON.stringify(request)) throw new Error("Profile intent identity conflicts with retained admission")
        if (previous.receipt) return previous.receipt
        if (previous.refusal) throw new OracleRpcAdmissionRefusedError("Profile intent was not admitted", previous.refusal)
        throw new Error("Profile intent admission is uncertain; explicit observation is required, do not resend")
      }
      if (entries.length >= 256) throw new Error("Profile intent journal is full")
      await preflight?.()
      const entry: Entry = {request, receipt: null}
      entries.push(entry)
      await write(entries)
      try {entry.receipt = await apply()}
      catch (error) {
        if (error instanceof OracleRpcRemoteError && error.code === "admission_refused" && isMetaFieldValueApplyRefusal(error.data)) {
          entry.refusal = {schema: "metafor/profile-intent-refusal/v1", version: 1, id: request.id, operation: request.operation, target: request.target, reason: error.data.reason}
          await write(entries)
          throw new OracleRpcAdmissionRefusedError("Profile intent was not admitted", entry.refusal)
        }
        throw error
      }
      await write(entries)
      return entry.receipt
    })
    serial = work.then(() => {}, () => {})
    return work
  }}
}
