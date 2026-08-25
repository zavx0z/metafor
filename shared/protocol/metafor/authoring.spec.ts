import {describe, expect, test} from "bun:test"
import {parseMetaAddress, type MetaAddress} from "@metafor/types/metafor/graph"
import {
  META_AUTHORING_CONTRACT_VERSION,
  META_CREATE_CAPABILITY,
  META_CREATE_METHOD,
  META_DECLARATION_APPLY_METHOD,
  META_DECLARATION_WRITE_CAPABILITY,
  META_MATTER_APPLY_METHOD,
  META_MATTER_WRITE_CAPABILITY,
  META_SOURCE_READ_CAPABILITY,
  META_SOURCE_REVISION_READ_METHOD,
  validateMetaCapabilitiesReadRequest,
  validateMetaCreateRequest,
  validateMetaDeclarationRequest,
  validateMetaMatterRequest,
  validateMetaSourceRevisionReadRequest,
  type MetaAuthoringCapability,
  type MetaCreateRequest,
  type MetaDeclarationRequest,
  type MetaFieldDeclarationAddRequest,
  type MetaMatterRequest,
  type MetaSourceRevision,
} from "./authoring.ts"

const LADA = parseMetaAddress("zavx0z/lada")!
const CHAT = parseMetaAddress("zavx0z/lada-chat")!
const TEST = parseMetaAddress("zavx0z/lada-test")!
const OTHER = parseMetaAddress("zavx0z/other")!
const LADA_REVISION = `sha256:${"1".repeat(64)}` as MetaSourceRevision
const CHAT_REVISION = `sha256:${"2".repeat(64)}` as MetaSourceRevision
const TEST_REVISION = `sha256:${"3".repeat(64)}` as MetaSourceRevision

const createGrant = (scopes: readonly MetaAddress[] = [TEST]): MetaAuthoringCapability => ({
  capability: META_CREATE_CAPABILITY,
  method: META_CREATE_METHOD,
  scopes,
  operationClass: "create",
  liveState: false,
  gitCommit: false,
})

const matterGrant = (scopes: readonly MetaAddress[] = [LADA, CHAT, TEST]): MetaAuthoringCapability => ({
  capability: META_MATTER_WRITE_CAPABILITY,
  method: META_MATTER_APPLY_METHOD,
  scopes,
  operationClass: "matter",
  liveState: true,
  gitCommit: false,
})

const declarationGrant = (scopes: readonly MetaAddress[] = [LADA, CHAT, TEST]): MetaAuthoringCapability => ({
  capability: META_DECLARATION_WRITE_CAPABILITY,
  method: META_DECLARATION_APPLY_METHOD,
  scopes,
  operationClass: "declaration",
  liveState: true,
  gitCommit: false,
})

const sourceGrant = (scopes: readonly MetaAddress[] = [LADA, CHAT, TEST]): MetaAuthoringCapability => ({
  capability: META_SOURCE_READ_CAPABILITY,
  method: META_SOURCE_REVISION_READ_METHOD,
  scopes,
  operationClass: "source_read",
  liveState: false,
  gitCommit: false,
})

const currentRevision = (address: MetaAddress): MetaSourceRevision | null => {
  if (address === LADA) return LADA_REVISION
  if (address === CHAT) return CHAT_REVISION
  if (address === TEST) return TEST_REVISION
  return null
}

const createRequest = (): MetaCreateRequest => ({
  contractVersion: META_AUTHORING_CONTRACT_VERSION,
  operationId: "create-lada-test",
  capability: META_CREATE_CAPABILITY,
  address: TEST,
  name: "Lada Test",
  description: "Inert authoring package",
  profile: "empty",
  target: "absent",
})

describe("meta authoring discovery and source revision validation", () => {
  test("accepts only the closed versioned capability request", () => {
    expect(validateMetaCapabilitiesReadRequest({contractVersion: 1})).toEqual({
      ok: true,
      value: {contractVersion: 1},
    })
    expect(validateMetaCapabilitiesReadRequest({contractVersion: 1, scope: LADA}))
      .toMatchObject({ok: false, issues: [{code: "unknown_property"}]})
  })

  test("normalizes exact source addresses inside the granted scope", () => {
    const result = validateMetaSourceRevisionReadRequest({
      contractVersion: 1,
      capability: META_SOURCE_READ_CAPABILITY,
      addresses: [LADA, CHAT],
    }, {capabilities: [sourceGrant()]})

    expect(result).toEqual({
      ok: true,
      value: {
        contractVersion: 1,
        capability: META_SOURCE_READ_CAPABILITY,
        addresses: [LADA, CHAT],
      },
    })
  })

  test("rejects duplicate, empty, denied and out-of-scope source reads", () => {
    const base = {
      contractVersion: 1,
      capability: META_SOURCE_READ_CAPABILITY,
    }
    expect(validateMetaSourceRevisionReadRequest({...base, addresses: []}, {capabilities: [sourceGrant()]}))
      .toMatchObject({ok: false, issues: [{code: "invalid_scope"}]})
    expect(validateMetaSourceRevisionReadRequest({...base, addresses: [LADA, LADA]}, {capabilities: [sourceGrant()]}))
      .toMatchObject({ok: false, issues: [{code: "duplicate_address"}]})
    expect(validateMetaSourceRevisionReadRequest({...base, addresses: [LADA]}, {capabilities: []}))
      .toMatchObject({ok: false, issues: [{code: "capability_denied"}]})
    expect(validateMetaSourceRevisionReadRequest({...base, addresses: [OTHER]}, {capabilities: [sourceGrant()]}))
      .toMatchObject({ok: false, issues: [{code: "scope_denied"}]})
  })
})

describe("meta.create proposal validation", () => {
  test("accepts and detaches the closed empty-profile request", () => {
    const input = createRequest()
    const result = validateMetaCreateRequest(input, {capabilities: [createGrant()]})

    expect(result).toEqual({ok: true, value: input})
    if (!result.ok) return
    expect(result.value).not.toBe(input)
  })

  test.each([
    ["unknown field", {...createRequest(), comment: "not contract"}, "unknown_property"],
    ["wrong version", {...createRequest(), contractVersion: 2}, "invalid_literal"],
    ["unsafe operation id", {...createRequest(), operationId: "create test"}, "invalid_operation_id"],
    ["nested address", {...createRequest(), address: "zavx0z/lada/test"}, "invalid_meta_address"],
    ["unapproved profile", {...createRequest(), profile: "default"}, "invalid_literal"],
    ["wrong target precondition", {...createRequest(), target: "replace"}, "invalid_literal"],
  ])("rejects %s", (_label, input, code) => {
    const result = validateMetaCreateRequest(input, {capabilities: [createGrant()]})
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.map((issue) => issue.code)).toContain(code)
  })

  test("rejects missing capability and graph scope before any provider action", () => {
    const noCapability = validateMetaCreateRequest(createRequest(), {capabilities: []})
    const wrongScope = validateMetaCreateRequest(createRequest(), {capabilities: [createGrant([OTHER])]})

    expect(noCapability).toMatchObject({ok: false, issues: [{code: "capability_denied"}]})
    expect(wrongScope).toMatchObject({ok: false, issues: [{code: "scope_denied"}]})
  })

  test("rejects accessors without invoking them", () => {
    let invoked = false
    const input = createRequest() as unknown as Record<string, unknown>
    Object.defineProperty(input, "name", {
      enumerable: true,
      get() {
        invoked = true
        return "Lada Test"
      },
    })

    const result = validateMetaCreateRequest(input, {capabilities: [createGrant()]})
    expect(result.ok).toBe(false)
    expect(invoked).toBe(false)
  })
})

describe("meta.matter.apply proposal validation", () => {
  const particle = {kind: "wimp" as const, src: TEST}
  const root = (address: MetaAddress, position = 0) => ({
    address,
    path: [{edgeSlot: "root" as const, position}] as [{edgeSlot: "root"; position: number}],
  })
  const rootPlacement = (address: MetaAddress, position = 0) => ({
    address,
    parent: null,
    edgeSlot: "root" as const,
    position,
  })
  const validCases: Array<[string, MetaMatterRequest]> = [
    [
      "add",
      {
        contractVersion: 1,
        operationId: "matter-add",
        capability: META_MATTER_WRITE_CAPABILITY,
        operation: "add",
        particle,
        to: rootPlacement(LADA),
        revisions: [{address: LADA, revision: LADA_REVISION}],
      },
    ],
    [
      "move",
      {
        contractVersion: 1,
        operationId: "matter-move",
        capability: META_MATTER_WRITE_CAPABILITY,
        operation: "move",
        particle,
        from: root(LADA),
        to: rootPlacement(CHAT),
        revisions: [
          {address: CHAT, revision: CHAT_REVISION},
          {address: LADA, revision: LADA_REVISION},
        ],
      },
    ],
    [
      "remove",
      {
        contractVersion: 1,
        operationId: "matter-remove",
        capability: META_MATTER_WRITE_CAPABILITY,
        operation: "remove",
        particle,
        target: root(CHAT),
        revisions: [{address: CHAT, revision: CHAT_REVISION}],
      },
    ],
  ]

  test.each(validCases)("accepts the closed %s operation", (_label, input) => {
    const result = validateMetaMatterRequest(input, {
      capabilities: [matterGrant()],
      currentRevision,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual({
      ...input,
      revisions: [...input.revisions].sort((left, right) => left.address.localeCompare(right.address)),
    } as MetaMatterRequest)
    expect(result.value).not.toBe(input)
    expect(result.value.revisions).not.toBe(input.revisions)
  })

  test("accepts one closed Matter hierarchy with every particle kind", () => {
    const result = validateMetaMatterRequest({
      contractVersion: 1,
      operationId: "matter-add-hierarchy",
      capability: META_MATTER_WRITE_CAPABILITY,
      operation: "add",
      particle: {
        kind: "macho",
        collectionBinding: {data: "items"},
        children: [
          {
            edgeSlot: "child",
            particle: {
              kind: "axion",
              predicateBinding: {data: "/state"},
              children: [{edgeSlot: "then", particle: {kind: "wimp", src: CHAT}}],
            },
          },
          {
            edgeSlot: "child",
            particle: {
              kind: "fuzzy",
              fuzzyKind: "dynamic-meta",
              predicateBinding: {data: "mode", expr: "zavx0z/${_[0]}"},
              children: [
                {edgeSlot: "branch", particle: {kind: "wimp", src: TEST}},
                {edgeSlot: "branch", particle: {kind: "wimp", src: CHAT}},
              ],
            },
          },
        ],
      },
      to: rootPlacement(LADA),
      revisions: [{address: LADA, revision: LADA_REVISION}],
    }, {
      capabilities: [matterGrant()],
      currentRevision,
    })

    expect(result.ok).toBe(true)
  })

  test("normalizes revision order without mutating the request", () => {
    const revisions = [
      {address: LADA, revision: LADA_REVISION},
      {address: CHAT, revision: CHAT_REVISION},
    ]
    const input = {
      contractVersion: 1,
      operationId: "matter-move",
      capability: META_MATTER_WRITE_CAPABILITY,
      operation: "move",
      particle,
      from: root(LADA),
      to: rootPlacement(CHAT),
      revisions,
    }
    const result = validateMetaMatterRequest(input, {
      capabilities: [matterGrant()],
      currentRevision,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.revisions.map(({address}) => address)).toEqual([LADA, CHAT])
    expect(revisions.map(({address}) => address)).toEqual([LADA, CHAT])
  })

  test.each([
    [
      "unknown field",
      {
        contractVersion: 1,
        operationId: "matter-add",
        capability: META_MATTER_WRITE_CAPABILITY,
        operation: "add",
        particle,
        to: rootPlacement(LADA),
        revisions: [{address: LADA, revision: LADA_REVISION}],
        fieldsBinding: {},
      },
      "unknown_property",
    ],
    [
      "unsupported operation",
      {
        contractVersion: 1,
        operationId: "matter-replace",
        capability: META_MATTER_WRITE_CAPABILITY,
        operation: "replace",
        particle,
        revisions: [],
      },
      "forbidden_operation",
    ],
    [
      "same-placement move",
      {
        contractVersion: 1,
        operationId: "matter-move",
        capability: META_MATTER_WRITE_CAPABILITY,
        operation: "move",
        particle,
        from: root(LADA),
        to: rootPlacement(LADA),
        revisions: [{address: LADA, revision: LADA_REVISION}],
      },
      "forbidden_operation",
    ],
    [
      "missing revision",
      {
        contractVersion: 1,
        operationId: "matter-add",
        capability: META_MATTER_WRITE_CAPABILITY,
        operation: "add",
        particle,
        to: rootPlacement(LADA),
        revisions: [],
      },
      "missing_revision",
    ],
    [
      "stale revision",
      {
        contractVersion: 1,
        operationId: "matter-add",
        capability: META_MATTER_WRITE_CAPABILITY,
        operation: "add",
        particle,
        to: rootPlacement(LADA),
        revisions: [{address: LADA, revision: CHAT_REVISION}],
      },
      "revision_mismatch",
    ],
    [
      "extra revision",
      {
        contractVersion: 1,
        operationId: "matter-add",
        capability: META_MATTER_WRITE_CAPABILITY,
        operation: "add",
        particle,
        to: rootPlacement(LADA),
        revisions: [
          {address: LADA, revision: LADA_REVISION},
          {address: CHAT, revision: CHAT_REVISION},
        ],
      },
      "extra_revision",
    ],
  ])("rejects %s", (_label, input, code) => {
    const result = validateMetaMatterRequest(input, {
      capabilities: [matterGrant()],
      currentRevision,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.map((issue) => issue.code)).toContain(code)
  })

  test("rejects a missing live grant and every out-of-scope Meta", () => {
    const input = {
      contractVersion: 1,
      operationId: "matter-add",
      capability: META_MATTER_WRITE_CAPABILITY,
      operation: "add",
      particle,
      to: rootPlacement(LADA),
      revisions: [{address: LADA, revision: LADA_REVISION}],
    }
    const noGrant = validateMetaMatterRequest(input, {capabilities: [], currentRevision})
    const wrongScope = validateMetaMatterRequest(input, {
      capabilities: [matterGrant([LADA])],
      currentRevision,
    })

    expect(noGrant.ok).toBe(false)
    if (!noGrant.ok) expect(noGrant.issues.map(({code}) => code)).toContain("capability_denied")
    expect(wrongScope.ok).toBe(false)
    if (!wrongScope.ok) expect(wrongScope.issues.map(({code}) => code)).toContain("scope_denied")
  })

  test("rejects sparse revision arrays before reading their entries", () => {
    const input = {
      contractVersion: 1,
      operationId: "matter-add",
      capability: META_MATTER_WRITE_CAPABILITY,
      operation: "add",
      particle,
      to: rootPlacement(LADA),
      revisions: new Array(1),
    }
    const result = validateMetaMatterRequest(input, {
      capabilities: [matterGrant()],
      currentRevision,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.map(({code}) => code)).toContain("non_json_value")
  })
})

describe("meta.declaration.apply Field validation", () => {
  const add = (): MetaFieldDeclarationAddRequest => ({
    contractVersion: META_AUTHORING_CONTRACT_VERSION,
    operationId: "field-add",
    capability: META_DECLARATION_WRITE_CAPABILITY,
    entity: "field",
    operation: "add",
    address: TEST,
    field: {
      key: "mode",
      type: "enum",
      required: false,
      values: ["idle", "ready"],
      default: "idle",
      label: "Mode",
    },
    revisions: [{address: TEST, revision: TEST_REVISION}],
  })

  test("accepts and detaches closed optional Field operations", () => {
    const requests: MetaDeclarationRequest[] = [
      add(),
      {
        contractVersion: 1,
        operationId: "field-replace",
        capability: META_DECLARATION_WRITE_CAPABILITY,
        entity: "field",
        operation: "replace",
        address: TEST,
        key: "mode",
        field: {key: "note", type: "string", required: false, default: ""},
        revisions: [{address: TEST, revision: TEST_REVISION}],
      },
      {
        contractVersion: 1,
        operationId: "field-remove",
        capability: META_DECLARATION_WRITE_CAPABILITY,
        entity: "field",
        operation: "remove",
        address: TEST,
        key: "mode",
        revisions: [{address: TEST, revision: TEST_REVISION}],
      },
      {
        contractVersion: 1,
        operationId: "field-move",
        capability: META_DECLARATION_WRITE_CAPABILITY,
        entity: "field",
        operation: "move",
        fromAddress: LADA,
        toAddress: CHAT,
        key: "mode",
        revisions: [
          {address: LADA, revision: LADA_REVISION},
          {address: CHAT, revision: CHAT_REVISION},
        ],
      },
    ]

    for (const input of requests) {
      const result = validateMetaDeclarationRequest(input, {
        capabilities: [declarationGrant()],
        currentRevision,
      })
      expect(result.ok).toBe(true)
      if (!result.ok) continue
      expect(result.value).toEqual(input)
      expect(result.value).not.toBe(input)
      expect(result.value.revisions).not.toBe(input.revisions)
    }
  })

  test.each([
    ["unknown property", {...add(), comment: "no"}, "unknown_property"],
    ["required Field", {...add(), field: {...add().field, required: true}}, "invalid_literal"],
    ["empty enum", {...add(), field: {...add().field, values: []}}, "invalid_enum_values"],
    ["duplicate enum", {...add(), field: {...add().field, values: ["idle", "idle"]}}, "duplicate_enum_value"],
    ["foreign enum default", {...add(), field: {...add().field, default: "missing"}}, "invalid_field_default"],
    ["stale revision", {...add(), revisions: [{address: TEST, revision: LADA_REVISION}]}, "revision_mismatch"],
    ["missing capability", add(), "capability_denied"],
  ])("rejects %s", (_label, input, code) => {
    const result = validateMetaDeclarationRequest(input, {
      capabilities: code === "capability_denied" ? [] : [declarationGrant()],
      currentRevision,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.map((issue) => issue.code)).toContain(code)
  })

  test("rejects same-Meta move and denied destination scope", () => {
    const base = {
      contractVersion: 1,
      operationId: "field-move",
      capability: META_DECLARATION_WRITE_CAPABILITY,
      entity: "field",
      operation: "move",
      fromAddress: LADA,
      toAddress: CHAT,
      key: "mode",
      revisions: [
        {address: CHAT, revision: CHAT_REVISION},
        {address: LADA, revision: LADA_REVISION},
      ],
    }
    expect(validateMetaDeclarationRequest({...base, toAddress: LADA, revisions: [base.revisions[1]]}, {
      capabilities: [declarationGrant()],
      currentRevision,
    })).toMatchObject({ok: false, issues: [{code: "forbidden_operation"}]})
    const denied = validateMetaDeclarationRequest(base, {
      capabilities: [declarationGrant([LADA])],
      currentRevision,
    })
    expect(denied.ok).toBe(false)
    if (!denied.ok) expect(denied.issues.map((issue) => issue.code)).toContain("scope_denied")
  })
})

describe("meta.declaration.apply Meta entity validation", () => {
  test("accepts the closed metadata, State, Mass, Reaction, Process and Bulk declarations", () => {
    const common = {
      contractVersion: META_AUTHORING_CONTRACT_VERSION,
      capability: META_DECLARATION_WRITE_CAPABILITY,
      address: TEST,
      revisions: [{address: TEST, revision: TEST_REVISION}],
    }
    const requests: MetaDeclarationRequest[] = [
      {
        ...common, operationId: "metadata-replace", entity: "metadata", operation: "replace",
        metadata: {name: "Lada Test", description: "Edited"},
      },
      {
        ...common, operationId: "state-add", entity: "state", operation: "add",
        state: {name: "ready", transitions: {ready: {status: {eq: "ok"}}}},
      },
      {
        ...common, operationId: "mass-add", entity: "mass", operation: "add",
        mass: {key: "memory", format: "json", label: "Memory"},
      },
      {
        ...common, operationId: "reaction-add", entity: "reaction", operation: "add",
        reaction: {
          key: "remember", label: "Remember", states: ["ready"],
          filterSource: "({ value }) => value.status === 'ok'",
          updateSource: "({ self }) => self", read: ["status"], write: [],
        },
      },
      {
        ...common, operationId: "process-add", entity: "process", operation: "add",
        process: {
          key: "ready", type: "action", label: "Run", env: ["server"],
          artifact: {
            path: "actions/run.ts", revision: "absent", exportName: "default",
            source: "export default async () => ({ ok: true })\n",
          },
          successSource: "({ update }) => update({ status: 'done' })",
        },
      },
      {
        ...common, operationId: "bulk-add", entity: "bulk", operation: "add",
        bulk: {view: ".ready { color: green; }"},
      },
    ]
    for (const input of requests) {
      const result = validateMetaDeclarationRequest(input, {
        capabilities: [declarationGrant()], currentRevision,
      })
      expect(result).toEqual({ok: true, value: input})
      if (result.ok) expect(result.value).not.toBe(input)
    }
  })

  test("accepts Process replace without rewriting its artifact", () => {
    const input: MetaDeclarationRequest = {
      contractVersion: META_AUTHORING_CONTRACT_VERSION,
      operationId: "process-replace",
      capability: META_DECLARATION_WRITE_CAPABILITY,
      entity: "process",
      operation: "replace",
      address: TEST,
      key: "ready",
      process: {key: "ready", type: "action", label: "Updated"},
      revisions: [{address: TEST, revision: TEST_REVISION}],
    }
    expect(validateMetaDeclarationRequest(input, {
      capabilities: [declarationGrant()], currentRevision,
    })).toEqual({ok: true, value: input})
  })

  test.each([
    ["unsafe artifact", {
      key: "ready", type: "action", artifact: {
        path: "../run.ts", revision: "absent", exportName: "default",
        source: "export default () => null",
      },
    }, "invalid_process_artifact_path"],
    ["existing add artifact", {
      key: "ready", type: "action", artifact: {
        path: "actions/run.ts", revision: TEST_REVISION, exportName: "default",
        source: "export default () => null",
      },
    }, "invalid_source_revision"],
    ["unknown environment", {
      key: "ready", type: "finally", env: ["edge"], artifact: {
        path: "actions/cleanup.ts", revision: "absent", exportName: "run",
        source: "export const run = () => null",
      },
    }, "invalid_process_environment"],
  ])("rejects Process %s", (_label, process, code) => {
    const result = validateMetaDeclarationRequest({
      contractVersion: META_AUTHORING_CONTRACT_VERSION,
      operationId: "process-invalid",
      capability: META_DECLARATION_WRITE_CAPABILITY,
      entity: "process",
      operation: "add",
      address: TEST,
      process,
      revisions: [{address: TEST, revision: TEST_REVISION}],
    }, {capabilities: [declarationGrant()], currentRevision})
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.map((issue) => issue.code)).toContain(code)
  })

  test("rejects executable-looking Bulk fields and empty Reaction source", () => {
    const common = {
      contractVersion: META_AUTHORING_CONTRACT_VERSION,
      capability: META_DECLARATION_WRITE_CAPABILITY,
      operation: "add",
      address: TEST,
      revisions: [{address: TEST, revision: TEST_REVISION}],
    }
    for (const input of [
      {...common, operationId: "bulk-invalid", entity: "bulk", bulk: {view: "x", process: "no"}},
      {
        ...common, operationId: "reaction-invalid", entity: "reaction",
        reaction: {
          key: "bad", label: "Bad", states: [], filterSource: "",
          updateSource: "({ self }) => self", read: [], write: [],
        },
      },
    ]) {
      expect(validateMetaDeclarationRequest(input, {
        capabilities: [declarationGrant()], currentRevision,
      }).ok).toBe(false)
    }
  })
})
