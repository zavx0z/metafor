/** Один staged host запускает первый выпуск, передаёт работу следующему и сохраняет действующий до принятия кандидата. */
import {describe, expect, test} from "bun:test"
import {existsSync} from "node:fs"
import {startServerRelease, type ServerReleaseHost} from "../index.ts"
import {createAuthoringWorkspace} from "./fixture/authoring"

describe.each<{
  name: string
  props: {initial: string; target: string | null; failure: string}
  expected: {version: string; phase: string | null; rejected: boolean; replaced: boolean; commits: string[]; history: string[]}
}>([
  {
    name: "Первый готовый выпуск",
    props: {initial: "1.0.0", target: null, failure: ""},
    expected: {
      version: "1.0.0", phase: null, rejected: false, replaced: false,
      commits: ["1.0.0"],
      history: ["1.0.0:launch:prepared", "1.0.0:bind", "1.0.0:admit"],
    },
  },
  {
    name: "Передача следующему готовому выпуску",
    props: {initial: "1.0.0", target: "1.1.0", failure: ""},
    expected: {
      version: "1.1.0", phase: "complete", rejected: false, replaced: true,
      commits: ["1.0.0", "1.1.0"],
      history: [
        "1.0.0:launch:prepared", "1.0.0:bind", "1.0.0:admit",
        "1.1.0:launch:prepared", "1.0.0:quiesce", "1.0.0:unbind",
        "1.1.0:bind", "1.1.0:admit", "1.0.0:destroy",
      ],
    },
  },
  {
    name: "Неподготовленный кандидат сохраняет действующий выпуск",
    props: {initial: "1.0.0", target: "1.1.0", failure: "prepare"},
    expected: {
      version: "1.0.0", phase: "failed", rejected: true, replaced: false,
      commits: ["1.0.0"],
      history: ["1.0.0:launch:prepared", "1.0.0:bind", "1.0.0:admit", "1.1.0:launch:prepared"],
    },
  },
])("$name", async ({props, expected}) => {
  const workspace = await createAuthoringWorkspace()
  const commits: string[] = []
  let host: ServerReleaseHost | undefined
  let result!: {
    version: string
    phase: string | null
    rejected: boolean
    replaced: boolean
    running: boolean
    history: string[]
    commits: string[]
  }
  try {
    host = await startServerRelease({
      cosmosRoot: workspace.directory,
      staged: true,
      initialTarget: props.initial,
      resolveCandidate: target => workspace.candidate(target, target === props.initial ? {} : {STAGED_FIXTURE_FAILURE: props.failure}),
      commitCandidate: async candidate => {commits.push(candidate.artifact.identity.version)},
    })
    const previous = host.active
    let rejected = false
    if (props.target !== null) {
      try {await host.handover!(props.target)} catch {rejected = true}
    }
    result = {
      version: host.active.runtime.identity.version,
      phase: host.transition?.phase ?? null,
      rejected,
      replaced: previous.runtime.process.pid !== host.active.runtime.process.pid,
      running: host.active.runtime.process.exitCode === null,
      history: (await workspace.events()).map(entry => `${entry.version}:${entry.event}`),
      commits: [...commits],
    }
  } finally {
    try {await host?.destroy()} finally {await workspace.close()}
  }
  const released = host!.active.runtime.process.exitCode === 0
  const directoryRemoved = !existsSync(workspace.directory)

  describe("Действующий выпуск", () => {
    test("Результат перехода", () => {
      expect(result.rejected, "Неподготовленный кандидат отклоняется до передачи работы; пригодный выпуск начинает работу").toBe(expected.rejected)
      expect(result.version, "Current обозначает версию действующего исполнения, а не только сохранённые файлы кандидата").toBe(expected.version)
      expect(result.phase, "Наблюдаемый этап объясняет исход выполненного перехода").toBe(expected.phase)
    })
    test("Одно пригодное исполнение", () => {
      expect(result.running, "Перед завершением примера текущий процесс работает").toBe(true)
      expect(result.replaced, "PID изменяется только после принятия следующего кандидата").toBe(expected.replaced)
      expect(result.commits, "Startup фиксирует первый выпуск и затем только принятого преемника").toEqual(expected.commits)
    })
  })
  describe("Жизненный цикл", () => {
    test("Порядок наблюдённых действий", () => {
      expect(result.history, "Реальные дочерние процессы подтверждают prepare, bind, admission, передачу и завершение в причинном порядке").toEqual(expected.history)
    })
    test("Завершение принадлежащих примеру ресурсов", () => {
      expect(released, "Пример завершает собственный host и его текущее исполнение до проверки сохранённых наблюдений").toBe(true)
      expect(directoryRemoved, "Принадлежащий примеру временный каталог удалён после остановки процессов").toBe(true)
    })
  })
})
