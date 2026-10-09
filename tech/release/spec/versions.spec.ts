/** Выбор новой версии из последней подтверждённой версии и явного изменения. */
import {describe, expect, test} from "bun:test"
import {nextPackageVersion, type VersionChange} from "@metafor/tech-release"

describe.each([
  {
    name: "Patch",
    props: {
      version: "1.2.3",
      change: "patch"
    },
    expected: {
      version: "1.2.4"
    }
  },
  {
    name: "Minor",
    props: {
      version: "1.2.3",
      change: "minor"
    },
    expected: {
      version: "1.3.0"
    }
  },
  {
    name: "Major",
    props: {
      version: "1.2.3",
      change: "major"
    },
    expected: {
      version: "2.0.0"
    }
  }
])("$name", ({props, expected}) => {
  const result = nextPackageVersion(props.version, props.change as VersionChange)
  test("Следующая версия", () => {
    expect(
      result,
      "Явное изменение увеличивает выбранную часть SemVer и обнуляет младшие части",
    ).toEqual(expected.version)
  })
})
