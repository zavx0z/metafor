/** Сигнал публикации предлагает заново согласовать состояние, не передавая состав. */
import {describe, expect, test} from "bun:test"
import {releaseChangedMessage} from "../server/index.ts"

describe.each([
  {name: "Сигнал о публикации", expected: {type: "release-changed"}},
])("$name", ({expected}) => {
  const result = releaseChangedMessage()

  test("Сигнал без состояния", () => {
    expect(result, "Извещение содержит только тип события и не переносит устаревающий состав").toEqual(expected)
  })
})
