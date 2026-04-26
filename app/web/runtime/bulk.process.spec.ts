import { describe, expect, test } from "bun:test"
import type { DbBackend } from "../../../pkg/db/index.ts"
import type { AppBulkProcessTarget } from "./bulk.process.ts"
import { executeAppBulkProcessTarget, resolveAppBulkActionSpecifier } from "./bulk.process.ts"

const createBackendStub = (): DbBackend =>
  ({
    requiredIndexes: [],
    close() {},
    reset() {},
    async flush() {},
    async readMetaRows() {
      return null
    },
    async listWimpIds() {
      return []
    },
    async readWimpRows() {
      return null
    },
    async readWimpField() {
      return null
    },
    async readWimpEdge() {
      return null
    },
    async readFieldValue() {
      return null
    },
    async readFieldSource() {
      return null
    },
    async readEntanglementFamily() {
      return null
    },
    writeMetaRows() {},
    writeWimpRows() {},
    writeWimpEdge() {},
    deleteEntanglementFamily() {},
    writeEntanglementFamily() {},
    setFieldValue() {},
    setWimpState() {},
  }) as DbBackend

const createTarget = (
  input: Pick<AppBulkProcessTarget, "meta" | "process" | "field" | "value" | "mass" | "wimpFieldIdByFieldKey" | "wimpId">,
): AppBulkProcessTarget => ({
  backend: createBackendStub(),
  self: {
    atom: input.wimpId,
    meta: input.meta.src,
    path: "0",
  },
  ...input,
})

describe("app/web bulk process runtime", () => {
  test("resolveAppBulkActionSpecifier резолвит action модуль относительно meta.ts", () => {
    const specifier = resolveAppBulkActionSpecifier("zavx0z/git", "./actions/detect")
    expect(specifier.endsWith("/github/zavx0z/git/actions/detect.ts")).toBe(true)
  })

  test("executeAppBulkProcessTarget выполняет success path и возвращает UUID-addressed values", async () => {
    const target = createTarget({
      meta: {
        id: "meta:git",
        src: "zavx0z/git",
      },
      process: {
        id: "process:detect",
        ownerMetaId: "meta:git",
        processKey: "определение операции",
        processOrder: 0,
        processKind: "action",
        actionWrapperSrc:
          'async ({ value }) => { const { detect } = await import("./actions/detect"); return detect({ cmd: value.command }) }',
        actionSrc: "./actions/detect",
        actionImportSpecifier: "detect",
        successSrc: '({ update, data }) => update({ args: data.args, operation: data.operation }, "s")',
      },
      field: {
        command: { type: "string", required: false },
        args: { type: "string", required: false },
        operation: {
          type: "enum",
          required: false,
          values: ["start", "work", "examine", "history", "collaborate", "worktree", "stash", "submodule", "config"],
        },
      },
      value: {
        command: "status --short",
        args: null,
        operation: null,
      },
      mass: {},
      wimpFieldIdByFieldKey: new Map([
        ["command", "field:command"],
        ["args", "field:args"],
        ["operation", "field:operation"],
      ]),
      wimpId: "wimp:git",
    })

    const result = await executeAppBulkProcessTarget(target)

    expect(result).toEqual({
      boson: "w+",
      values: {
        "field:args": "--short",
        "field:operation": "examine",
      },
    })
  })

  test("executeAppBulkProcessTarget выполняет error handler и возвращает UUID-addressed error patch", async () => {
    const target = createTarget({
      meta: {
        id: "meta:commit",
        src: "zavx0z/git-history-commit",
      },
      process: {
        id: "process:commit-parse",
        ownerMetaId: "meta:commit",
        processKey: "парсинг опций",
        processOrder: 0,
        processKind: "action",
        actionWrapperSrc:
          'async ({ value }) => { const mod = await import("./actions/commit"); return mod.parseCommitOptions(value.args) }',
        actionSrc: "./actions/commit",
        actionImportSpecifier: "parseCommitOptions",
        errorSrc: '({ update, error }) => update({ error: error.message }, "e")',
      },
      field: {
        args: { type: "string", required: false },
        error: { type: "string", required: false },
      },
      value: {
        args: null,
        error: null,
      },
      mass: {},
      wimpFieldIdByFieldKey: new Map([
        ["args", "field:args"],
        ["error", "field:error"],
      ]),
      wimpId: "wimp:commit",
    })

    const result = await executeAppBulkProcessTarget(target)

    expect(result).toEqual({
      boson: "w-",
      values: {
        "field:error": "Команда не указана",
      },
    })
  })

  test("executeAppBulkProcessTarget выполняет success handler парсинга commit-опций и сбрасывает stale values", async () => {
    const target = createTarget({
      meta: {
        id: "meta:commit",
        src: "zavx0z/git-history-commit",
      },
      process: {
        id: "process:commit-parse-success",
        ownerMetaId: "meta:commit",
        processKey: "парсинг опций",
        processOrder: 0,
        processKind: "action",
        actionWrapperSrc:
          'async ({ value }) => { const mod = await import("./actions/commit"); return mod.parseCommitOptions(value.args) }',
        actionSrc: "./actions/commit",
        actionImportSpecifier: "parseCommitOptions",
        successSrc:
          "({ update, data }) => update({ all: data.all ?? null, message: data.message ?? null, amend: data.amend ?? null, signoff: data.signoff ?? null, noVerify: data.noVerify ?? null, dryRun: data.dryRun ?? null, verbose: data.verbose ?? null, edit: data.edit ?? null, error: null, dryRunOutput: null })",
      },
      field: {
        args: { type: "string", required: false },
        all: { type: "boolean", required: false },
        message: { type: "string", required: false },
        amend: { type: "boolean", required: false },
        signoff: { type: "boolean", required: false },
        noVerify: { type: "boolean", required: false },
        dryRun: { type: "boolean", required: false },
        verbose: { type: "boolean", required: false },
        edit: { type: "boolean", required: false },
        error: { type: "string", required: false },
        dryRunOutput: { type: "string", required: false },
      },
      value: {
        args: '-m "hello"',
        all: true,
        message: null,
        amend: true,
        signoff: true,
        noVerify: true,
        dryRun: true,
        verbose: true,
        edit: true,
        error: "stale error",
        dryRunOutput: "stale output",
      },
      mass: {},
      wimpFieldIdByFieldKey: new Map([
        ["args", "field:args"],
        ["all", "field:all"],
        ["message", "field:message"],
        ["amend", "field:amend"],
        ["signoff", "field:signoff"],
        ["noVerify", "field:noVerify"],
        ["dryRun", "field:dryRun"],
        ["verbose", "field:verbose"],
        ["edit", "field:edit"],
        ["error", "field:error"],
        ["dryRunOutput", "field:dryRunOutput"],
      ]),
      wimpId: "wimp:commit-success",
    })

    const result = await executeAppBulkProcessTarget(target)

    expect(result).toEqual({
      boson: "w+",
      values: {
        "field:all": null,
        "field:message": "hello",
        "field:amend": null,
        "field:signoff": null,
        "field:noVerify": null,
        "field:dryRun": null,
        "field:verbose": null,
        "field:edit": null,
        "field:error": null,
        "field:dryRunOutput": null,
      },
    })
  })
})
