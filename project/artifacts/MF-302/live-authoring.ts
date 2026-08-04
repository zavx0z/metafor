import {
  META_AUTHORING_CONTRACT_VERSION,
  META_CAPABILITIES_READ_METHOD,
  META_CREATE_CAPABILITY,
  META_CREATE_METHOD,
  META_MATTER_APPLY_METHOD,
  META_MATTER_WRITE_CAPABILITY,
  META_SOURCE_READ_CAPABILITY,
  META_SOURCE_REVISION_READ_METHOD,
  type MetaMatterRequest,
  type MetaSourceRevisionReadReceipt,
} from "@metafor/types/metafor/authoring"
import {parseMetaAddress, type MetaAddress, type RuntimeNode} from "@metafor/types/metafor/graph"
import {BOUNDARY_INITIAL_STATE_METHOD, type BoundaryInitialState} from "../../../types/boundary/initial.ts"
import {MonadRpcPeer, MonadTransport} from "../../../shared/transport/monad/server.ts"

const SOURCE = "owner/codex"
const LADA = parseMetaAddress("zavx0z/lada")!
const CHAT = parseMetaAddress("zavx0z/lada-chat")!
const TEST = parseMetaAddress("zavx0z/lada-test")!

const mode = Bun.argv[2] ?? "capabilities"
const transport = new MonadTransport(SOURCE, "http://127.0.0.1:4000/")
await transport.open()
const peer = new MonadRpcPeer(transport.channel)

const call = async <T>(method: string, params: unknown): Promise<T> =>
  await peer.call<T>("dark", method, params, {waitMs: 5_000})

const sourceRevisions = async (addresses: MetaAddress[]): Promise<MetaSourceRevisionReadReceipt> =>
  await call(META_SOURCE_REVISION_READ_METHOD, {
    contractVersion: META_AUTHORING_CONTRACT_VERSION,
    capability: META_SOURCE_READ_CAPABILITY,
    addresses,
  })

const runtimePaths = (nodes: RuntimeNode[], prefix: string[] = []): string[][] => nodes.flatMap((node) => {
  const path = node.kind === "atom" ? [...prefix, node.meta] : prefix
  return [
    ...(node.kind === "atom" ? [path] : []),
    ...runtimePaths(node.children ?? [], path),
  ]
})

const observe = async () => {
  const [state, graph, sources] = await Promise.all([
    peer.call<BoundaryInitialState>("boundary", BOUNDARY_INITIAL_STATE_METHOD, {}, {waitMs: 5_000}),
    call<{runtime: {roots: RuntimeNode[]}; template: Record<string, unknown>}>("readGraph", {}),
    sourceRevisions([LADA, CHAT, TEST]),
  ])
  return {
    testAtoms: state.atoms.filter(({wimp}) => wimp === TEST).map(({id, state}) => ({id, state})),
    testPaths: runtimePaths(graph.runtime.roots).filter((path) => path.includes(TEST)),
    testTemplate: Object.hasOwn(graph.template, TEST),
    sources: sources.sources,
  }
}

try {
  let result: unknown
  if (mode === "capabilities") {
    result = await call(META_CAPABILITIES_READ_METHOD, {
      contractVersion: META_AUTHORING_CONTRACT_VERSION,
    })
  } else if (mode === "create") {
    const request = {
      contractVersion: META_AUTHORING_CONTRACT_VERSION,
      operationId: "mf302-create-lada-test",
      capability: META_CREATE_CAPABILITY,
      address: TEST,
      name: "Lada Test",
      description: "Инертный Meta-пакет для проверки live authoring.",
      profile: "empty",
      target: "absent",
    }
    result = {
      first: await call(META_CREATE_METHOD, request),
      repeated: await call(META_CREATE_METHOD, request),
    }
  } else if (
    mode === "add" || mode === "add2" || mode === "move" || mode === "move-repeat" ||
    mode === "remove" || mode === "repair-remove"
  ) {
    const affected = mode === "add" || mode === "add2" || mode === "repair-remove"
      ? [LADA]
      : mode === "move" || mode === "move-repeat"
        ? [LADA, CHAT]
        : [CHAT]
    const revisions = mode === "move-repeat"
      ? [
          {
            address: LADA,
            revision: "sha256:085ebca5009248d47e8e8e79f6cb8d59b1fa40628291001bd92d46beca21da3e" as const,
          },
          {
            address: CHAT,
            revision: "sha256:e212020680fc6c69b214ee05703c88af9e76c345c3dfc3de993f91204c986455" as const,
          },
        ]
      : (await sourceRevisions(affected)).sources
    const request: MetaMatterRequest = mode === "add" || mode === "add2"
      ? {
          contractVersion: 1,
          operationId: mode === "add" ? "mf302-add-lada-test" : "mf302-add-lada-test-v2",
          capability: META_MATTER_WRITE_CAPABILITY,
          operation: "add",
          child: TEST,
          toParent: LADA,
          revisions,
        }
      : mode === "repair-remove"
        ? {
            contractVersion: 1,
            operationId: "mf302-repair-remove-lada-test",
            capability: META_MATTER_WRITE_CAPABILITY,
            operation: "remove",
            child: TEST,
            fromParent: LADA,
            revisions,
          }
      : mode === "move" || mode === "move-repeat"
        ? {
            contractVersion: 1,
            operationId: "mf302-move-lada-test",
            capability: META_MATTER_WRITE_CAPABILITY,
            operation: "move",
            child: TEST,
            fromParent: LADA,
            toParent: CHAT,
            revisions,
          }
        : {
            contractVersion: 1,
            operationId: "mf302-remove-lada-test",
            capability: META_MATTER_WRITE_CAPABILITY,
            operation: "remove",
            child: TEST,
            fromParent: CHAT,
            revisions,
          }
    const first = await call(META_MATTER_APPLY_METHOD, request)
    const repeated = mode === "move-repeat"
      ? null
      : await call(META_MATTER_APPLY_METHOD, request)
    result = {first, repeated, observation: await observe()}
  } else if (mode === "observe") {
    result = await observe()
  } else {
    throw new Error(`Unknown live authoring mode: ${mode}`)
  }
  console.log(JSON.stringify(result, null, 2))
} finally {
  peer.close()
  await transport.close()
}
