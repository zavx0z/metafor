/** Ответ содержит точные update/remove, а не повтор полного целевого состояния. */
import {describe, expect, test} from "bun:test"
import {releaseDeltaMessage} from "../server/index.ts"
import {previousRemoval, theme, visual, visualRemoval} from "./fixture"

describe.each<{
  name: string
  props: Parameters<typeof releaseDeltaMessage>[0]
  expected: ReturnType<typeof releaseDeltaMessage>
}>([
  {
    name: "Изменений нет",
    props: {update: [], remove: []},
    expected: {type: "release-delta", update: [], remove: []},
  },
  {
    name: "Только получение",
    props: {update: [visual, theme], remove: []},
    expected: {type: "release-delta", update: [visual, theme], remove: []},
  },
  {
    name: "Только удаление",
    props: {update: [], remove: [visualRemoval]},
    expected: {type: "release-delta", update: [], remove: [visualRemoval]},
  },
  {
    name: "Замена версии",
    props: {update: [visual], remove: [previousRemoval]},
    expected: {type: "release-delta", update: [visual], remove: [previousRemoval]},
  },
])("$name", ({props, expected}) => {
  const input = structuredClone(props)
  const result = releaseDeltaMessage(input)

  test("Точный ответ", () => {
    expect(result, "Wire-ответ содержит тип сообщения и обе операции без полного desired state").toEqual(expected)
  })

  test("Исходные операции", () => {
    expect(input, "Формирование envelope не изменяет операции обновления").toEqual(props)
  })
})
