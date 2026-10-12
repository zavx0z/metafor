import {constants} from "node:fs"
import {lstat, open, readdir, rm} from "node:fs/promises"
import {dirname, isAbsolute, join, parse, resolve, sep} from "node:path"
import {readReleaseNodeConfiguration, readReleaseNodeToken} from "@cosmos/release/node"
import type {MassDirectoryLease} from "@metafor/types/metafor/mass"
import type {MetaforCosmosInternalPeerProcessProvision as Provision} from "./contract"
export type {MetaforCosmosInternalPeerProcessProvision} from "./contract"

async function privateFile(path: string, limit: number): Promise<Uint8Array> {
  if (!isAbsolute(path)) throw new Error("Private preparation path must be absolute")
  const selected = resolve(path)
  let current = parse(selected).root
  for (const part of selected.slice(current.length).split(sep).filter(Boolean)) {
    current = join(current, part)
    const stat = await lstat(current)
    if (stat.isSymbolicLink() || (current === selected ? !stat.isFile() : !stat.isDirectory())) throw new Error("Unsafe private preparation path")
  }
  const file = await open(selected, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o600 || stat.size > limit)
      throw new Error("Private preparation file is not bounded owner-only data")
    const bytes = Buffer.alloc(limit + 1)
    let size = 0
    while (size < bytes.byteLength) {
      const read = await file.read(bytes, size, bytes.byteLength - size, null)
      if (!read.bytesRead) break
      size += read.bytesRead
    }
    if (size > limit) throw new Error("Private preparation file exceeds limit")
    return bytes.subarray(0, size)
  } finally {await file.close()}
}

async function createPrivateFile(path: string, bytes: Uint8Array): Promise<void> {
  const file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try {await file.chmod(0o600); await file.writeFile(bytes); await file.sync()}
  finally {await file.close()}
}

/**
Consumes COSMOS_NETWORK_PREPARATION_FILE only inside Energy. The explicit file
is a bounded private release-node config with a private credential beside it;
it is ingress, not persistent runtime storage. Complete matching bytes are
idempotent, partial/conflicting directories fail closed. No network factory is
called. Lease release precedes ordinary ACK; credentials never enter the result.
[Preparation law](README.md), [checks](spec/provision.spec.ts).
*/
export default async function provisionNetwork(input: Provision.Input): Promise<Provision.Output> {
  let lease: MassDirectoryLease | undefined
  let prepared = false
  let failure = "Network preparation failed"
  const created: string[] = []
  try {
    input.signal.throwIfAborted()
    if (!input.requestId || input.energy.resource) throw new Error("Preparation requires an unbound participant")
    const path = Bun.env.COSMOS_NETWORK_PREPARATION_FILE
    if (!path) {failure = "Network preparation input is missing"; throw new Error(failure)}
    await privateFile(path, 64 * 1024)
    const config = await readReleaseNodeConfiguration(path, {massRoot: dirname(resolve(path))})
    if (config.sources !== undefined) throw new Error("Meta preparation does not accept separate root source policy")
    await privateFile(config.tokenFile, 4096)
    const token = await readReleaseNodeToken(config)
    const peerBytes = new TextEncoder().encode(JSON.stringify({...config, tokenFile: "token"}) + "\n")
    const tokenBytes = new TextEncoder().encode(token + "\n")
    lease = await input.mass.configuration.acquire()
    input.signal.throwIfAborted()
    lease.signal.throwIfAborted()
    const entries = await readdir(lease.path)
    if (entries.length) {
      if (entries.length !== 2 || !entries.includes("peer.json") || !entries.includes("token")) {
        failure = "Network preparation is incomplete"
        throw new Error(failure)
      }
      const [existingPeer, existingToken] = await Promise.all([privateFile(join(lease.path, "peer.json"), 64 * 1024), privateFile(join(lease.path, "token"), 4096)])
      if (!Buffer.from(existingPeer).equals(peerBytes) || !Buffer.from(existingToken).equals(tokenBytes)) {
        failure = "Network preparation conflicts with retained data"
        throw new Error(failure)
      }
    } else {
      for (const [name, bytes] of [["token", tokenBytes], ["peer.json", peerBytes]] as const) {
        input.signal.throwIfAborted()
        lease.signal.throwIfAborted()
        const destination = join(lease.path, name)
        await createPrivateFile(destination, bytes)
        created.push(destination)
      }
    }
    const directory = await open(lease.path, constants.O_RDONLY)
    try {await directory.sync()} finally {await directory.close()}
    input.signal.throwIfAborted()
    lease.signal.throwIfAborted()
    prepared = true
  } catch {
    for (const path of created.reverse()) await rm(path, {force: true}).catch(() => {})
  } finally {
    try {await lease?.release()} catch {prepared = false; failure = "Network preparation lease did not release"}
  }
  input.signal.throwIfAborted()
  return {ackId: input.requestId, status: prepared ? "prepared" : "failed", error: prepared ? null : failure}
}
