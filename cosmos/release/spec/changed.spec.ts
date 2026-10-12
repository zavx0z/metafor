/** Читатель принимает только извещение о публикации без дополнительных полей. */
import {describe, expect, test} from "bun:test"
import {parseReleaseChangedMessage} from "../server/index.ts"

describe.each<{
  name: string
  props: unknown
  expected: ReturnType<typeof parseReleaseChangedMessage>
}>([
  {
    name: "Сигнал без состояния",
    props: {type: "release-changed"},
    expected: {type: "release-changed"},
  },
  {name: "Отсутствующее сообщение", props: null, expected: null},
  {name: "Массив вместо сообщения", props: [], expected: null},
  {name: "Неизвестный тип", props: {type: "changed"}, expected: null},
  {name: "Состав внутри сигнала", props: {type: "release-changed", packages: []}, expected: null},
  {name: "Transport metadata внутри сигнала", props: {type: "release-changed", id: "request"}, expected: null},
])("$name", ({props, expected}) => {
  const result = parseReleaseChangedMessage(props)

  test("Результат чтения", () => {
    expect(result, "Принимается только payload-free сигнал; неподдерживаемая форма возвращает null").toEqual(expected)
  })
})
