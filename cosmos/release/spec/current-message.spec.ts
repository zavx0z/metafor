/** Browser сообщает фактические identities, включая временное перекрытие версий. */
import {describe, expect, test} from "bun:test"
import {releaseCurrentMessage} from "../server/index.ts"
import {lazy, previousVisual, service, theme, visual, worker} from "./fixture"

describe.each<{
  name: string
  props: {current: Parameters<typeof releaseCurrentMessage>[0]}
  expected: ReturnType<typeof releaseCurrentMessage>
}>([
  {
    name: "Пустой browser cache",
    props: {current: []},
    expected: {type: "release-current", current: []},
  },
  {
    name: "Корневые части и полученные ресурсы",
    props: {current: [visual, service, theme, lazy]},
    expected: {type: "release-current", current: [visual, service, theme, lazy]},
  },
  {
    name: "Две сохранённые версии одной части",
    props: {current: [previousVisual, visual]},
    expected: {type: "release-current", current: [previousVisual, visual]},
  },
  {
    name: "Browser Worker предметного пакета",
    props: {current: [worker]},
    expected: {type: "release-current", current: [worker]},
  },
])("$name", ({props, expected}) => {
  const input = structuredClone(props)
  const result = releaseCurrentMessage(input.current)

  test("Фактическое состояние", () => {
    expect(result, "Сообщение передаёт полный известный browser current без transport metadata").toEqual(expected)
  })

  test("Исходный состав", () => {
    expect(input, "Формирование сообщения сохраняет переданный состав и порядок identities").toEqual(props)
  })
})
