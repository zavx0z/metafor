/**
Читатель ответа проверяет update/remove и конфликты точных адресов.
Полнота artifact graph и применение транзакции проверяются у своих владельцев.
*/
import {describe, expect, test} from "bun:test"
import {parseReleaseDeltaMessage} from "../server/index.ts"
import {lazy, previousRemoval, previousVisual, theme, visual, visualRemoval} from "./fixture"

describe.each<{
  name: string
  props: unknown
  expected: ReturnType<typeof parseReleaseDeltaMessage>
}>([
  {
    name: "Пустая delta",
    props: {type: "release-delta", update: [], remove: []},
    expected: {type: "release-delta", update: [], remove: []},
  },
  {
    name: "Замена версии с публичным ресурсом",
    props: {type: "release-delta", update: [visual, theme], remove: [previousRemoval]},
    expected: {type: "release-delta", update: [visual, theme], remove: [previousRemoval]},
  },
  {
    name: "Удаление нескольких сохранённых версий",
    props: {type: "release-delta", update: [], remove: [previousRemoval, visualRemoval]},
    expected: {type: "release-delta", update: [], remove: [previousRemoval, visualRemoval]},
  },
  {
    name: "Синтаксически корректный generated artifact",
    props: {type: "release-delta", update: [lazy], remove: []},
    expected: {type: "release-delta", update: [lazy], remove: []},
  },
  {name: "Неверный тип", props: {type: "delta", update: [], remove: []}, expected: null},
  {name: "Нет списка удалений", props: {type: "release-delta", update: []}, expected: null},
  {name: "Полный desired внутри ответа", props: {type: "release-delta", update: [], remove: [], desired: [visual]}, expected: null},
  {name: "Повтор update", props: {type: "release-delta", update: [visual, visual], remove: []}, expected: null},
  {name: "Две целевые версии одного slot", props: {type: "release-delta", update: [previousVisual, visual], remove: []}, expected: null},
  {name: "Повтор точного удаления", props: {type: "release-delta", update: [], remove: [visualRemoval, {...visualRemoval}]}, expected: null},
  {name: "Получение и удаление одного адреса", props: {type: "release-delta", update: [visual], remove: [visualRemoval]}, expected: null},
  {name: "Лишние bytes metadata в удалении", props: {type: "release-delta", update: [], remove: [{...visualRemoval, size: 42}]}, expected: null},
  {name: "Небраузерная среда удаления", props: {type: "release-delta", update: [], remove: [{...visualRemoval, env: "server-worker"}]}, expected: null},
  {name: "Cache внутри identity", props: {type: "release-delta", update: [{...visual, cache: "internal"}], remove: []}, expected: null},
])("$name", ({props, expected}) => {
  const input = structuredClone(props)
  const result = parseReleaseDeltaMessage(input)

  test("Результат чтения", () => {
    expect(result, "Ответ содержит единственную целевую версию каждого slot и непересекающиеся точные update/remove адреса").toEqual(expected)
  })

  test("Исходное сообщение", () => {
    expect(input, "Чтение ответа не меняет полученные операции").toEqual(props)
  })
})
