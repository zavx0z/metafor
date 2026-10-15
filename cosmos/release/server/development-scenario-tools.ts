import type {DevelopmentTool} from "./development-environment"
import type {createDevelopmentScenarios} from "./development-scenarios"

type Scenarios = ReturnType<typeof createDevelopmentScenarios>
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)

/** Модель выбирает только обнаруженный сценарий назначенного Package; путь машины не выдаётся аргументом. */
export function developmentScenarioTools(scenarios: Scenarios, packageName: string): DevelopmentTool[] {
  return [{name: "cosmos.scenarios.list", title: "Сценарии пакета", description: "Список обнаруженных Bun Test сценариев назначенного пакета и digest их исходников. Тесты не запускает.",
    inputSchema: {type: "object", additionalProperties: false, properties: {nodeId: {type: "string"}}}, outputSchema: {type: "object"},
    annotations: {readOnlyHint: true, destructiveHint: false}, execute(input) {
      if (!object(input) || Object.keys(input).some(key => key !== "nodeId") || input.nodeId !== undefined && typeof input.nodeId !== "string") throw new Error("Неверный узел сценария")
      return scenarios.list(packageName, input.nodeId as string | undefined)
    }}, {name: "cosmos.scenarios.run", title: "Выполнить сценарий", description: "Запускает обнаруженный Bun Test сценарий с подтверждённым digest. Возвращает проверки, ошибки и отчёт правил авторства; не означает наличия интерактивного preview.",
    inputSchema: {type: "object", additionalProperties: false, required: ["sourcePath", "expectedDigest"], properties: {
      sourcePath: {type: "string"}, expectedDigest: {type: "string", pattern: "^[a-f0-9]{64}$"}, nodeId: {type: "string"},
    }}, outputSchema: {type: "object"}, annotations: {readOnlyHint: false, destructiveHint: true}, async execute(input, context) {
      if (!object(input) || Object.keys(input).some(key => !["sourcePath", "expectedDigest", "nodeId"].includes(key))
        || typeof input.sourcePath !== "string" || typeof input.expectedDigest !== "string" || input.nodeId !== undefined && typeof input.nodeId !== "string") throw new Error("Неверное намерение запуска сценария")
      const report = await scenarios.run({packageName, sourcePath: input.sourcePath, expectedDigest: input.expectedDigest,
        ...(input.nodeId ? {nodeId: input.nodeId as string} : {})}, context?.signal ?? new AbortController().signal,
      event => {void context?.onProgress?.({...event})})
      const failed = report.tests.filter(test => test.status !== "passed" && test.status !== "skipped")
      return {sourcePath: report.sourcePath, digest: report.digest, exitCode: report.exitCode,
        total: report.tests.length, passed: report.tests.filter(test => test.status === "passed").length,
        failed: failed.slice(0, 20), failuresTruncated: failed.length > 20,
        validation: report.validation, stdout: report.stdout.slice(-2048), stderr: report.stderr.slice(-2048)}
    }}]
}
