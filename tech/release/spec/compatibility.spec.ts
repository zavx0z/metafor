/** Совместимость конкретной выбранной версии с объявленным диапазоном runtime dependency. */
import {describe, expect, test} from "bun:test"
import {satisfiesWorkspaceRange} from "@metafor/tech-release"

describe.each([
  {
    name: "Совместимая стабильная версия",
    props: {
      version: "1.9.0",
      range: "workspace:^1.2.3"
    },
    expected: {
      compatible: true
    }
  },
  {
    name: "Следующая major-версия",
    props: {
      version: "2.0.0",
      range: "workspace:^1.2.3"
    },
    expected: {
      compatible: false
    }
  },
  {
    name: "Совместимая нулевая major-линия",
    props: {
      version: "0.1.9",
      range: "workspace:^0.1.3"
    },
    expected: {
      compatible: true
    }
  },
  {
    name: "Следующая minor-версия нулевой major",
    props: {
      version: "0.2.0",
      range: "workspace:^0.1.3"
    },
    expected: {
      compatible: false
    }
  },
  {
    name: "Точная версия нулевой линии",
    props: {
      version: "0.0.3",
      range: "workspace:^0.0.3"
    },
    expected: {
      compatible: true
    }
  },
  {
    name: "Следующая patch-версия нулевой линии",
    props: {
      version: "0.0.4",
      range: "workspace:^0.0.3"
    },
    expected: {
      compatible: false
    }
  }
])("$name", ({props, expected}) => {
  const result = satisfiesWorkspaceRange(props.version, props.range)
  test("Совместимость выбранной версии", () => {
    expect(
      result,
      "Диапазон workspace caret сохраняет правила совместимости стабильных и нулевых версий; несовместимость не маскируется сравнением строк",
    ).toEqual(expected.compatible)
  })
})
