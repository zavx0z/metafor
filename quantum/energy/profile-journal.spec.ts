import {expect, test} from "bun:test"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {parseMetaAddress} from "@metafor/types/metafor/graph"
import type {ProfileIntentRequest, ProfileIntentReceipt} from "@metafor/types/metafor/profile-intent"
import type {MetaFieldValueApplyReceipt} from "shared/protocol/metafor/observation"
import {createProfileIntentJournal} from "./profile-journal"
import {OracleRpcRemoteError, OracleRpcAdmissionRefusedError} from "shared/transport/oracle"

test("profile admission survives journal restoration and an uncertain pending ID never repeats the Field effect", async () => {
  const path = await mkdtemp(join(tmpdir(), "energy-profile-journal-"))
  const controller = new AbortController()
  const lease = {path, signal: controller.signal, async release() {controller.abort()}}
  const root = parseMetaAddress("intel-macos-chrome-studio")!
  const request: ProfileIntentRequest = {id: "save-1", operation: "profile.save", target: {worldIdentity: {peerId: "mac", root, cutId: "cut-mac"}, atomRef: "atom:1"}, expectedProfile: {name: "assigned", saveId: null}}
  const receipt: ProfileIntentReceipt<MetaFieldValueApplyReceipt> = {schema: "metafor/profile-intent/v1", version: 1, id: request.id, operation: request.operation, target: request.target,
    admission: {contractVersion: 1, resolution: "exact", atom: {root, ref: "atom:1", meta: root}, field: "input", acceptance: {cutId: "cut-mac", sequence: 1, id: "cut-mac:1"}, frontier: {cutId: "cut-mac", throughSequence: 1, retroactiveComplete: false}}}
  let effects = 0
  try {
    const journal = createProfileIntentJournal(lease)
    await expect(journal.admit(request, async () => {effects++; return receipt})).resolves.toEqual(receipt)
    const restored = createProfileIntentJournal(lease)
    await expect(restored.admit(request, async () => {throw new Error("must not repeat") })).resolves.toEqual(receipt)
    await expect(restored.admit({...request, operation: "profile.open"}, async () => receipt)).rejects.toThrow("conflicts")
    const uncertain = {...request, id: "save-uncertain"}
    await expect(restored.admit(uncertain, async () => {effects++; throw new Error("connection lost after admission") })).rejects.toThrow("connection lost")
    await expect(createProfileIntentJournal(lease).admit(uncertain, async () => {effects++; return receipt})).rejects.toThrow("uncertain")
    expect(effects).toBe(2)
    controller.abort()
    await expect(restored.admit({...request, id: "late"}, async () => receipt)).rejects.toThrow()
  } finally {await rm(path, {recursive: true, force: true})}
})

test("known pre-admission refusal is terminal across restoration, while diagnostic text alone remains uncertain", async () => {
  const path = await mkdtemp(join(tmpdir(), "energy-profile-refusal-"))
  const controller = new AbortController()
  const lease = {path, signal: controller.signal, async release() {controller.abort()}}
  const root = parseMetaAddress("intel-macos-chrome-studio")!
  const request: ProfileIntentRequest = {id: "refused-open", operation: "profile.open", target: {worldIdentity: {peerId: "mac", root, cutId: "cut"}, atomRef: "atom:1"}, expectedProfile: {name: "assigned", saveId: null}}
  let attempts = 0
  try {
    const failure = new OracleRpcRemoteError("admission_refused", "Diagnostic message is not the discriminator", {schema: "metafor/field-admission-refusal/v1", contractVersion: 1, reason: "frontier_mismatch"})
    const first = await createProfileIntentJournal(lease).admit(request, async () => {attempts++; throw failure}).catch(error => error)
    expect(first).toBeInstanceOf(OracleRpcAdmissionRefusedError)
    expect(first.data).toMatchObject({schema: "metafor/profile-intent-refusal/v1", reason: "frontier_mismatch", id: request.id})
    const restored = await createProfileIntentJournal(lease).admit(request, async () => {attempts++; throw new Error("Must not resend")}).catch(error => error)
    expect(restored).toBeInstanceOf(OracleRpcAdmissionRefusedError)
    expect(restored.data).toEqual(first.data)
    expect(attempts).toBe(1)
    const uncertain = {...request, id: "unknown-open"}
    await expect(createProfileIntentJournal(lease).admit(uncertain, async () => {attempts++; throw new OracleRpcRemoteError("method_error", "Force causal frontier differs: expected cut:1, received cut:2")})).rejects.toThrow("frontier differs")
    await expect(createProfileIntentJournal(lease).admit(uncertain, async () => {attempts++; throw new Error("Must not resend")})).rejects.toThrow("uncertain")
    expect(attempts).toBe(2)
    const preflight = {...request, id: "invalid-profile"}
    await expect(createProfileIntentJournal(lease).admit(preflight, async () => {attempts++; throw new Error("Must not run")}, async () => {throw new Error("Assigned profile changed")})).rejects.toThrow("profile changed")
    const stored = await Bun.file(join(path, "oracle-profile-intents.json")).json()
    expect(stored.requests.some((item: {request: ProfileIntentRequest}) => item.request.id === preflight.id)).toBeFalse()
  } finally {await rm(path, {recursive: true, force: true})}
})
