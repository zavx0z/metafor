export type DiagnosticLevel = "debug" | "error"

export interface DiagnosticCheckpoint {
  level: DiagnosticLevel
  scope: string
  event: string
  details: string[]
}

export interface DiagnosticStory {
  id: string
  checkpoints: DiagnosticCheckpoint[]
  proofs: Array<{file: string, test: string}>
}

const checkpoint = (
  level: DiagnosticLevel,
  scope: string,
  event: string,
  details: string[],
): DiagnosticCheckpoint => ({level, scope, event, details})

export const diagnosticStories: DiagnosticStory[] = [
  {
    id: "server-startup-release-process",
    checkpoints: [
      checkpoint("debug", "[@cosmos/startup:server]", "release process активирован", [
        "env", "name", "pid", "version",
      ]),
      checkpoint("error", "[@cosmos/startup:server]", "release process не запущен", ["error"]),
      checkpoint("error", "[@cosmos/startup:server]", "release process завершился с ошибкой", [
        "error", "pid", "version",
      ]),
    ],
    proofs: [
      {file: "server-startup.spec.ts", test: "server startup activates one exact release process and destroys it explicitly"},
      {file: "server-startup.spec.ts", test: "server startup reports an unavailable exact release without fallback"},
      {file: "server-startup.spec.ts", test: "server startup observes one failed release process without restart"},
    ],
  },
  {
    id: "startup-release-runtime",
    checkpoints: [
      checkpoint("debug", "[@cosmos/startup:service]", "bootstrap release начат", ["request"]),
      checkpoint("debug", "[@cosmos/startup:service]", "release artifact выбран", [
        "env", "name", "request", "source", "version",
      ]),
      checkpoint("debug", "[@cosmos/startup:service]", "release runtime подготовлен", [
        "env", "name", "request", "version",
      ]),
      checkpoint("debug", "[@cosmos/release:service]", "release service запущен", ["rpc"]),
      checkpoint("debug", "[@cosmos/startup:service]", "release runtime активирован", ["replaced"]),
      checkpoint("debug", "[@cosmos/release:service]", "release service очищен", ["resources"]),
      checkpoint("error", "[@cosmos/startup:service]", "bootstrap release завершился с ошибкой", [
        "error", "request",
      ]),
    ],
    proofs: [
      {file: "runtime.spec.ts", test: "startup cold boot is immediate, shared, and retriable"},
      {file: "runtime.spec.ts", test: "runtime swap sends new events to candidate and destroys old after in-flight work"},
      {file: "transaction.spec.ts", test: "UPD-003 startup uses Cache order and fails closed on a damaged first release"},
    ],
  },
  {
    id: "server-build-publication",
    checkpoints: [
      checkpoint("debug", "[@cosmos/release:server:update]", "запрос публикации отклонён", [
        "endpoint", "status",
      ]),
      checkpoint("debug", "[@cosmos/release:server:update]", "публикация release запрошена", ["packages"]),
      checkpoint("debug", "[@cosmos/release:server:update]", "root intent публикации сохранён", ["packages"]),
      checkpoint("debug", "[@cosmos/release:server:build]", "package typecheck начат", ["package", "root"]),
      checkpoint("debug", "[@cosmos/release:server:build]", "package typecheck завершён", [
        "exitCode", "package", "stderr",
      ]),
      checkpoint("debug", "[@cosmos/release:server:build]", "сборка artifact начата", [
        "artifact", "command", "env", "package", "profile", "root",
      ]),
      checkpoint("debug", "[@cosmos/release:server:build]", "сборка artifact завершена", [
        "artifact", "env", "exitCode", "package",
      ]),
      checkpoint("debug", "[@cosmos/release:server:build]", "сборка artifact завершилась с ошибкой", [
        "env", "error", "exitCode", "package",
      ]),
      checkpoint("debug", "[@cosmos/release:server:update]", "публикация отменена с восстановлением root", [
        "packages", "reason",
      ]),
      checkpoint("debug", "[@cosmos/release:server:update]", "публикация release завершена", [
        "packages", "results",
      ]),
      checkpoint("debug", "[@cosmos/release:server:update]", "сигнал об обновлении отправлен", [
        "sendStatus", "subscribers", "topic",
      ]),
      checkpoint("error", "[@cosmos/release:server:update]", "публикация release завершилась с ошибкой", [
        "packages", "results",
      ]),
      checkpoint("error", "[@cosmos/release:server:update]", "публикация завершилась с ошибкой", [
        "error", "packages",
      ]),
    ],
    proofs: [
      {file: "publication.spec.ts", test: "production publication diagnostics preserve success and rollback order"},
      {file: "build-profiles.spec.ts", test: "parallel env builds run one package typecheck"},
      {file: "build-profiles.spec.ts", test: "failed package typecheck prevents every env build"},
    ],
  },
  {
    id: "server-publication-recovery",
    checkpoints: [
      checkpoint("debug", "[@cosmos/release:server:update]", "восстановление публикации начато", ["packages"]),
      checkpoint("debug", "[@cosmos/release:server:update]", "восстановление публикации завершено", [
        "artifacts", "recovered",
      ]),
      checkpoint("error", "[@cosmos/release:server:update]", "восстановление публикации завершилось с ошибкой", [
        "error", "packages",
      ]),
    ],
    proofs: [
      {file: "publication.spec.ts", test: "cold recovery reproduces and reuses every converged exact artifact"},
    ],
  },
  {
    id: "browser-artifact-delivery",
    checkpoints: [
      checkpoint("debug", "[@cosmos/release:server:delivery]", "browser artifact доставлен", [
        "env", "package", "status", "version",
      ]),
      checkpoint("debug", "[@cosmos/release:server:delivery]", "browser artifact не найден", [
        "env", "package", "status", "version",
      ]),
    ],
    proofs: [
      {file: "publication.spec.ts", test: "production delivery diagnostics distinguish delivered and missing artifacts"},
    ],
  },
  {
    id: "release-rpc-lifecycle",
    checkpoints: [
      checkpoint("debug", "[@cosmos/release:server:rpc]", "подписка release service создана", [
        "source", "topic",
      ]),
      checkpoint("debug", "[@cosmos/release:service:rpc]", "соединение с сервером обновлений установлено", [
        "recovered", "to",
      ]),
      checkpoint("debug", "[@cosmos/release:service:rpc]", "соединение с сервером обновлений закрыто", [
        "code", "intentional", "reason", "retryInMs", "wasClean",
      ]),
      checkpoint("debug", "[@cosmos/release:server:rpc]", "подписка release service удалена", [
        "code", "reason", "source", "topic",
      ]),
      checkpoint("error", "[@cosmos/release:service:rpc]", "соединение с сервером обновлений завершилось с ошибкой", [
        "error", "retryInMs", "to",
      ]),
    ],
    proofs: [
      {file: "rpc-runtime.spec.ts", test: "release RPC diagnostics expose no-op and suppress reconnect spam"},
      {file: "rpc-runtime.spec.ts", test: "release RPC diagnostics report one connection failure until recovery"},
      {file: "load-001.browser.spec.ts", test: "UPD-002 reconnects after a clean server-side WebSocket close"},
    ],
  },
  {
    id: "browser-state-synchronization",
    checkpoints: [
      checkpoint("debug", "[@cosmos/release:service:rpc:update]", "получен сигнал об обновлении", ["from"]),
      checkpoint("debug", "[@cosmos/release:service:rpc:update]", "фактическое состояние cache отправлено", [
        "current", "to",
      ]),
      checkpoint("debug", "[@cosmos/release:server:rpc:update]", "состояние browser cache сверено", [
        "current", "remove", "update",
      ]),
      checkpoint("debug", "[@cosmos/release:service:rpc:update]", "server delta получена", [
        "remove", "update",
      ]),
      checkpoint("debug", "[@cosmos/release:service:rpc:update]", "browser cache уже актуален", [
        "remove", "update",
      ]),
      checkpoint("error", "[@cosmos/release:service:rpc:update]", "синхронизация завершилась с ошибкой", [
        "error", "to",
      ]),
      checkpoint("error", "[@cosmos/release:server:rpc:update]", "сверка browser cache завершилась с ошибкой", [
        "error", "source",
      ]),
    ],
    proofs: [
      {file: "rpc-runtime.spec.ts", test: "release RPC diagnostics expose no-op and suppress reconnect spam"},
      {file: "rpc-runtime.spec.ts", test: "release RPC diagnostics preserve the exact synchronization failure"},
      {file: "release.spec.ts", test: "release RPC carries only a payload-free signal, full current, and update/remove delta"},
      {file: "transaction.spec.ts", test: "UPD-003 treats a stale update for an installed exact entry as a no-op"},
    ],
  },
  {
    id: "browser-cache-transaction",
    checkpoints: [
      checkpoint("debug", "[@cosmos/release:service:prepare]", "transaction начата", [
        "mode", "remove", "update",
      ]),
      checkpoint("debug", "[@cosmos/release:service:prepare]", "восстановление transaction начато", ["packages"]),
      checkpoint("debug", "[@cosmos/release:service:prepare]", "exact artifact подготовлен", [
        "env", "name", "source", "version",
      ]),
      checkpoint("debug", "[@cosmos/release:service:activate]", "полный candidate composition проверен", ["packages"]),
      checkpoint("debug", "[@cosmos/release:service:activate]", "release runtime candidate подготовлен", [
        "env", "name", "version",
      ]),
      checkpoint("debug", "[@cosmos/release:service:activate]", "canonical cleanup завершён", ["removed"]),
      checkpoint("debug", "[@cosmos/release:service:activate]", "transaction завершена", [
        "changed", "mode",
      ]),
    ],
    proofs: [
      {file: "transaction.spec.ts", test: "UPD-003 keeps a complete old or new composition after every durable mutation"},
      {file: "transaction.spec.ts", test: "UPD-003 prepares release runtime before cleanup and activates it only after durable commit"},
      {file: "load-001.browser.spec.ts", test: "UPD-003 keeps canonical caches unchanged and resumes one fixed transaction"},
    ],
  },
  {
    id: "window-runtime-lifecycle",
    checkpoints: [
      checkpoint("debug", "[@cosmos/release:service:restart]", "перезагрузка Window начата", [
        "registration", "windows",
      ]),
      checkpoint("debug", "[@cosmos/release:service:restart]", "перезагрузка Window завершена", [
        "navigated", "requested",
      ]),
      checkpoint("debug", "[@internal/visual:main]", "основное visual-окружение создано", [
        "display", "hud", "space", "surfaceDisplay",
      ]),
      checkpoint("debug", "[@cosmos/release:main]", "Visual runtime подключён", ["runtime"]),
      checkpoint("debug", "[@cosmos/startup:main]", "страница готова к работе", [
        "controller", "registration",
      ]),
    ],
    proofs: [
      {file: "ham-005.boundary.spec.ts", test: "HAM-005 creates one standard Window environment through internal visual"},
      {file: "load-001.browser.spec.ts", test: "UPD-002 updates one module group and restarts every Window once"},
    ],
  },
]

export function checkpointKey(checkpoint: Pick<DiagnosticCheckpoint, "level" | "scope" | "event">) {
  return `${checkpoint.level}\u0000${checkpoint.scope}\u0000${checkpoint.event}`
}
