/** Отрицательные примеры. Fixture задаёт изменения изолированной копии пакета или повреждённый отчёт compiler; это не API сборщика. */
import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import {join, resolve} from "node:path"

import {validatePackageBuildOutputs, type PackageBuildReport, type PackageBuildResult} from "@metafor/tech-build"
import {buildOutcome, executionFixture, fixtureBuilder, reportDirectories, type ExecutionFixture} from "./execution-fixture"

const diagnostics: Record<string, RegExp> = {
  "Корень без окружения": /root subpath/i,
  "Нет корневого export": /root subpath/i,
  "Маска вместо корневого входа": /must target/i,
  "Неизвестное окружение": /unsupported package environment/i,
  "Неверный scope condition": /unsupported root export condition/i,
  "Подпуть в необъявленном окружении": /environment|condition/i,
  "Выход source за границу пакета": /path|package root/i,
  "Source через символическую ссылку": /symbolic|symlink/i,
  "Один source под двумя public keys": /source.*multiple|duplicate/i,
  "Пересекающиеся маски exports": /duplicate|multiple|collision/i,
  "Служебный public key": /invalid package export subpath/i,
  "Отсутствующий source": /ENOENT|missing|exist/i,
  "Необъявленная зависимость source": /direct.*dependency/i,
  "Закрытый source зависимости": /public export/i,
  "Нет единого typecheck": /typecheck.*missing/i,
  "Запрещённый prebuild": /prebuild/i,
  "Неоднозначная команда сборки": /exactly one outfile or outdir/i,
  "Раздельные typecheck окружений": /one package-wide typecheck/i,
  "Неверный target окружения": /target/i,
  "Общий outfile разных окружений": /share build outfile/i,
  "Build output вне пакета": /output|outfile|package root/i,
  "Несовместимые staging options": /artifact.*outdir/i,
  "Неполная пара staging и версии": /outdir.*version.*together/i,
  "Multi-entry без splitting": /splitting|conditions|outdir/i,
  "Чужая таблица build config": /unsupported key/i,
  "Plugin для отсутствующего окружения": /unsupported environment/i,
  "Пустой список plugins": /non-empty string array/i,
  "Повтор plugin": /unique/i,
  "Два пути к одному plugin": /duplicate modules/i,
  "Превышен предел plugins": /exceed limit/i,
  "Неверный loader": /loader extension|loader.*unsupported/i,
  "Plugin вне владельца": /plugin.*missing|escapes package root/i,
  "Plugin из непрямой зависимости": /direct dependency/i,
  "Неверный default plugin": /default export.*Bun plugin/i,
  "Plugin изменяет параметры": /cannot modify.*validated build plan/i,
  "Plugin изменяет outputs": /cannot modify.*compiler output graph/i,
  "Ошибка типов": /TS2322/i,
  "Ошибка компиляции": /missing.ts/i,
  "Нет корневого output": /root.*one output/i,
  "Output за пределами staging": /escapes staging boundary/i,
  "Коллизия физических outputs": /duplicates path/i,
  "Разорванный import graph": /import is missing/i,
  "Необъявленный внешний import": /undeclared external import/i,
  "Отсутствующая development map": /inline source map is missing/i,
  "Некорректная source map": /JSON|json/i,
  "Source map без исходников": /sources, sourcesContent and mappings/i,
}

describe.each([
  {
    name: "Корень без окружения",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      manifest: {
        exports: {
          ".": "./main/index.ts"
        }
      }
    },
    reason: "Root export обязан объявлять точные environments",
    expected: {
      stage: "configuration",
      compilations: 0,
      success: false
    }
  },
  {
    name: "Нет корневого export",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      manifest: {
        exports: {
          "./part": "./main/index.ts"
        }
      }
    },
    reason: "Пакет обязан иметь корневой вход",
    expected: {
      stage: "configuration",
      compilations: 0,
      success: false
    }
  },
  {
    name: "Маска вместо корневого входа",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      manifest: {
        exports: {
          ".": {
            "internal:main": "./main/*.ts"
          }
        }
      }
    },
    reason: "Корень указывает на один точный файл",
    expected: {
      stage: "configuration",
      compilations: 0,
      success: false
    }
  },
  {
    name: "Неизвестное окружение",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      manifest: {
        exports: {
          ".": {
            "internal:unknown": "./main/index.ts"
          }
        }
      }
    },
    reason: "Разрешены только main, worker, service, server и server-worker",
    expected: {
      stage: "configuration",
      compilations: 0,
      success: false
    }
  },
  {
    name: "Неверный scope condition",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      manifest: {
        exports: {
          ".": {
            "cosmos:main": "./main/index.ts"
          }
        }
      }
    },
    reason: "Condition принадлежит namespace собираемого пакета",
    expected: {
      stage: "configuration",
      compilations: 0,
      success: false
    }
  },
  {
    name: "Подпуть в необъявленном окружении",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      manifest: {
        exports: {
          ".": {
            "internal:main": "./main/index.ts"
          },
          "./part": {
            "internal:server": "./main/index.ts"
          }
        }
      }
    },
    reason: "Некорневой export не добавляет environment, отсутствующий у корня",
    expected: {
      stage: "configuration",
      compilations: 0,
      success: false
    }
  },
  {
    name: "Выход source за границу пакета",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      manifest: {
        exports: {
          ".": {
            "internal:main": "./main/index.ts"
          },
          "./style.css": "./../outside.css"
        }
      }
    },
    reason: "Package-relative source остаётся внутри владельца",
    expected: {
      stage: "configuration",
      compilations: 0,
      success: false
    }
  },
  {
    name: "Source через символическую ссылку",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      manifest: {
        exports: {
          ".": {
            "internal:main": "./main/index.ts"
          },
          "./linked": "./linked.ts"
        }
      },
      symbolicLinks: {
        "linked.ts": "../outside.ts"
      }
    },
    reason: "Export не проходит по символической ссылке",
    expected: {
      stage: "configuration",
      compilations: 0,
      success: false
    }
  },
  {
    name: "Один source под двумя public keys",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      manifest: {
        exports: {
          ".": {
            "internal:main": "./main/index.ts"
          },
          "./alias": {
            "internal:main": "./main/index.ts"
          }
        }
      }
    },
    reason: "Один physical source не получает конфликтующие identities в одном окружении",
    expected: {
      stage: "configuration",
      compilations: 0,
      success: false
    }
  },
  {
    name: "Пересекающиеся маски exports",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      manifest: {
        exports: {
          ".": {
            "internal:main": "./main/index.ts"
          },
          "./icons/*": "./icons/*",
          "./icons/*.svg": "./icons/*.svg"
        }
      },
      files: {
        "icons/add.svg": "<svg/>"
      }
    },
    reason: "Разные шаблоны не создают один public key",
    expected: {
      stage: "configuration",
      compilations: 0,
      success: false
    }
  },
  {
    name: "Служебный public key",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      manifest: {
        exports: {
          ".": {
            "internal:main": "./main/index.ts"
          },
          "./.cosmos/private": "./main/index.ts"
        }
      }
    },
    reason: "Авторские exports не занимают namespace generated chunks",
    expected: {
      stage: "configuration",
      compilations: 0,
      success: false
    }
  },
  {
    name: "Отсутствующий source",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      manifest: {
        exports: {
          ".": {
            "internal:main": "./main/index.ts"
          }
        }
      }
    },
    reason: "Каждый заявленный source существует",
    expected: {
      stage: "configuration",
      compilations: 0,
      success: false
    }
  },
  {
    name: "Необъявленная зависимость source",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      manifest: {
        exports: {
          ".": {
            "internal:main": "./main/index.ts"
          },
          "./foreign": "@fixture/undeclared"
        }
      }
    },
    reason: "Некорневой bare source принадлежит прямой runtime dependency",
    expected: {
      stage: "configuration",
      compilations: 0,
      success: false
    }
  },
  {
    name: "Закрытый source зависимости",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      manifest: {
        dependencies: {
          "@fixture/library": "1.0.0"
        },
        exports: {
          ".": {
            "internal:main": "./main/index.ts"
          },
          "./foreign": "@fixture/library/private.ts"
        }
      },
      dependencies: {
        "@fixture/library": resolve(import.meta.dir, "fixture/library")
      }
    },
    reason: "Доступен только точный public export dependency",
    expected: {
      stage: "configuration",
      compilations: 0,
      success: false
    }
  },
  {
    name: "Нет единого typecheck",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      manifest: {
        scripts: {
          "build:main": "bun build ./main/index.ts --conditions=internal:main --target=browser --production --minify --outfile=dist/main.js"
        }
      }
    },
    reason: "У package объявлена одна проверка типов",
    expected: {
      stage: "configuration",
      compilations: 0,
      success: false
    }
  },
  {
    name: "Запрещённый prebuild",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      manifest: {
        scripts: {
          typecheck: "tsc --noEmit",
          prebuild: "bun hook.ts",
          "build:main": "bun build ./main/index.ts --conditions=internal:main --target=browser --production --minify --outfile=dist/main.js"
        }
      }
    },
    reason: "Скрытый lifecycle не подменяет явный typecheck и env build",
    expected: {
      stage: "configuration",
      compilations: 0,
      success: false
    }
  },
  {
    name: "Неоднозначная команда сборки",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      manifest: {
        scripts: {
          typecheck: "tsc --noEmit",
          "build:main": "bun build ./main/index.ts other.ts --conditions=internal:main --target=browser --outfile=a.js --outdir=dist"
        }
      }
    },
    reason: "Build является прямой командой Bun с одним canonical root и однозначным output",
    expected: {
      stage: "configuration",
      compilations: 0,
      success: false
    }
  },
  {
    name: "Раздельные typecheck окружений",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      manifest: {
        scripts: {
          typecheck: "tsc --noEmit",
          "typecheck:main": "tsc --noEmit",
          "build:main": "bun build ./main/index.ts --conditions=internal:main --target=browser --production --minify --outfile=dist/main.js"
        }
      }
    },
    reason: "У пакета один typecheck, а не независимые проверки каждого env",
    expected: {
      stage: "configuration",
      compilations: 0,
      success: false
    }
  },
  {
    name: "Неверный target окружения",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      manifest: {
        scripts: {
          typecheck: "tsc --noEmit",
          "build:main": "bun build ./main/index.ts --conditions=internal:main --target=bun --production --minify --outfile=dist/main.js"
        }
      }
    },
    reason: "Target соответствует объявленному environment",
    expected: {
      stage: "configuration",
      compilations: 0,
      success: false
    }
  },
  {
    name: "Общий outfile разных окружений",
    props: {
      path: resolve(import.meta.dir, "fixture/environments"),
      profile: "production"
    },
    fixture: {
      manifest: {
        scripts: {
          typecheck: "tsc --noEmit",
          "build:main": "bun build ./main/index.ts --conditions=internal:main --target=browser --production --minify --outfile=dist/shared.js",
          "build:server": "bun build ./server/index.ts --conditions=internal:server --target=bun --production --minify --outfile=dist/shared.js"
        }
      }
    },
    reason: "Разные окружения не пишут в один physical output",
    expected: {
      stage: "configuration",
      compilations: 0,
      success: false
    }
  },
  {
    name: "Build output вне пакета",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      manifest: {
        scripts: {
          typecheck: "tsc --noEmit",
          "build:main": "bun build ./main/index.ts --conditions=internal:main --target=browser --production --minify --outfile=../escape.js"
        }
      }
    },
    reason: "Package-owned outfile не выходит из root",
    expected: {
      stage: "configuration",
      compilations: 0,
      success: false
    }
  },
  {
    name: "Несовместимые staging options",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production",
      options: {
        artifact: "stage.js",
        outdir: "staging",
        version: "1.0.1"
      }
    },
    fixture: {

    },
    reason: "Artifact override нельзя смешивать с outdir или version",
    expected: {
      stage: "configuration",
      compilations: 0,
      success: false
    }
  },
  {
    name: "Неполная пара staging и версии",
    props: {
      path: resolve(import.meta.dir, "fixture/graph"),
      profile: "production",
      options: {
        outdir: "staging"
      }
    },
    fixture: {

    },
    reason: "Полный multi-output graph получает outdir и version вместе",
    expected: {
      stage: "configuration",
      compilations: 0,
      success: false
    }
  },
  {
    name: "Multi-entry без splitting",
    props: {
      path: resolve(import.meta.dir, "fixture/graph"),
      profile: "production"
    },
    fixture: {
      manifest: {
        scripts: {
          typecheck: "tsc --noEmit",
          "build:main": "bun build ./main/index.ts --conditions=internal:main --target=browser --production --minify --outfile=dist/main.js"
        }
      }
    },
    reason: "Несколько code entrypoints требуют outdir и splitting",
    expected: {
      stage: "configuration",
      compilations: 0,
      success: false
    }
  },
  {
    name: "Чужая таблица build config",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      files: {
        "bunfig.toml": "[cosmos.package-build]\nprotocol = \"other\"\n"
      }
    },
    reason: "Конфигурация отвергает неизвестные поля",
    expected: {
      stage: "configuration",
      compilations: 0,
      success: false
    }
  },
  {
    name: "Plugin для отсутствующего окружения",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      files: {
        "bunfig.toml": "[cosmos.package-build.environments.worker]\nplugins = [\"./plugin.ts\"]\n"
      }
    },
    reason: "Plugin не создаёт environment, которого нет в exports",
    expected: {
      stage: "configuration",
      compilations: 0,
      success: false
    }
  },
  {
    name: "Пустой список plugins",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      files: {
        "bunfig.toml": "[cosmos.package-build.environments.main]\nplugins = []\n"
      }
    },
    reason: "Opt-in таблица содержит непустой список plugins",
    expected: {
      stage: "configuration",
      compilations: 0,
      success: false
    }
  },
  {
    name: "Повтор plugin",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      files: {
        "bunfig.toml": "[cosmos.package-build.environments.main]\nplugins = [\"./plugin.ts\", \"./plugin.ts\"]\n"
      }
    },
    reason: "Каждый plugin объявлен один раз",
    expected: {
      stage: "configuration",
      compilations: 0,
      success: false
    }
  },
  {
    name: "Два пути к одному plugin",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      files: {
        "bunfig.toml": "[cosmos.package-build.environments.main]\nplugins = [\"./plugin.ts\", \"./build/../plugin.ts\"]\n",
        "plugin.ts": "export default {name:\"fixture\",setup(){}}\n",
        "build/.keep": ""
      }
    },
    reason: "После canonical resolution plugins остаются уникальны",
    expected: {
      stage: "configuration",
      compilations: 0,
      success: false
    }
  },
  {
    name: "Превышен предел plugins",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      files: {
        "bunfig.toml": "[cosmos.package-build.environments.main]\nplugins = [\"./p0.ts\", \"./p1.ts\", \"./p2.ts\", \"./p3.ts\", \"./p4.ts\", \"./p5.ts\", \"./p6.ts\", \"./p7.ts\", \"./p8.ts\", \"./p9.ts\", \"./p10.ts\", \"./p11.ts\", \"./p12.ts\", \"./p13.ts\", \"./p14.ts\", \"./p15.ts\", \"./p16.ts\"]\n"
      }
    },
    reason: "Конфигурация не превышает поддержанный предел 16 plugins",
    expected: {
      stage: "configuration",
      compilations: 0,
      success: false
    }
  },
  {
    name: "Неверный loader",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      files: {
        "bunfig.toml": "[loader]\n\"fixture\" = \"unknown-loader\"\n"
      }
    },
    reason: "Loader extension и loader name принадлежат поддержанной форме",
    expected: {
      stage: "configuration",
      compilations: 0,
      success: false
    }
  },
  {
    name: "Plugin вне владельца",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      files: {
        "bunfig.toml": "[cosmos.package-build.environments.main]\nplugins = [\"./../outside.ts\"]\n"
      }
    },
    reason: "Relative plugin не выходит за real package root и не входит в node_modules",
    expected: {
      stage: "configuration",
      compilations: 0,
      success: false
    }
  },
  {
    name: "Plugin из непрямой зависимости",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      files: {
        "bunfig.toml": "[cosmos.package-build.environments.main]\nplugins = [\"@fixture/undeclared/compiler\"]\n"
      }
    },
    reason: "Bare plugin объявлен в прямых dependencies или devDependencies",
    expected: {
      stage: "configuration",
      compilations: 0,
      success: false
    }
  },
  {
    name: "Неверный default plugin",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      files: {
        "bunfig.toml": "[cosmos.package-build.environments.main]\nplugins = [\"./plugin.ts\"]\n",
        "plugin.ts": "export default 42\n"
      }
    },
    reason: "Plugin module экспортирует объект BunPlugin с setup",
    expected: {
      stage: "compiler",
      compilations: 1,
      success: false
    }
  },
  {
    name: "Plugin изменяет параметры",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      files: {
        "bunfig.toml": "[cosmos.package-build.environments.main]\nplugins = [\"./plugin.ts\"]\n",
        "plugin.ts": "export default {name:\"mutating\",setup(build){build.config.entrypoints=[\"./other.ts\"]}}\n"
      }
    },
    reason: "Plugin не заменяет validated entrypoints, target или outdir",
    expected: {
      stage: "compiler",
      compilations: 1,
      success: false
    }
  },
  {
    name: "Plugin изменяет outputs",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      files: {
        "bunfig.toml": "[cosmos.package-build.environments.main]\nplugins = [\"./plugin.ts\"]\n",
        "plugin.ts": "export default {\n  name: \"mutating\",\n  setup(build) {\n    build.onEnd(async (result) => {\n      console.log(\"compiler-stdout\")\n      console.error(\"compiler-stderr\")\n      await result.outputs[0].text()\n      result.outputs.length = 0\n    })\n  },\n}\n"
      }
    },
    reason: "Plugin не подменяет output graph после компиляции",
    expected: {
      stage: "outputs",
      compilations: 1,
      success: false
    }
  },
  {
    name: "Ошибка типов",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      files: {
        "main/index.ts": "export const value: number = \"wrong\"\n"
      }
    },
    reason: "Неуспешный typecheck запрещает запуск всех env builds",
    expected: {
      stage: "typecheck",
      compilations: 0,
      success: false
    }
  },
  {
    name: "Ошибка компиляции",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      files: {
        "main/index.ts": "// @ts-expect-error Отсутствующий импорт пропущен typecheck только в отрицательной fixture\nimport value from \"./missing.ts\"\nexport {value}\n"
      }
    },
    reason: "Ошибка компилятора сохраняет stdout, stderr и exitCode и не возвращает готовые outputs",
    expected: {
      stage: "compiler",
      compilations: 1,
      success: false
    }
  },
  {
    name: "Нет корневого output",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      compilerReport: {
        outputs: []
      }
    },
    reason: "У результата есть ровно один требуемый root",
    expected: {
      stage: "outputs",
      compilations: 1,
      success: false
    }
  },
  {
    name: "Output за пределами staging",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      compilerReport: {
        outputs: [
          {
            path: "../escape.js",
            kind: "entry-point"
          }
        ]
      }
    },
    reason: "Все outputs — обычные файлы внутри staging",
    expected: {
      stage: "outputs",
      compilations: 1,
      success: false
    }
  },
  {
    name: "Коллизия физических outputs",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      compilerReport: {
        outputs: [
          {
            artifact: "./part",
            path: "same.js"
          },
          {
            artifact: "./part.js",
            path: "same.js"
          }
        ]
      }
    },
    reason: "Разные identities не нормализуются в один file path",
    expected: {
      stage: "outputs",
      compilations: 1,
      success: false
    }
  },
  {
    name: "Разорванный import graph",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      compilerReport: {
        outputs: [
          {
            path: "main.js",
            imports: [
              {
                path: "missing.js",
                external: false
              }
            ]
          }
        ]
      }
    },
    reason: "Все internal imports ведут к существующим outputs",
    expected: {
      stage: "outputs",
      compilations: 1,
      success: false
    }
  },
  {
    name: "Необъявленный внешний import",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    fixture: {
      compilerReport: {
        outputs: [
          {
            path: "main.js",
            imports: [
              {
                path: "@unknown/runtime",
                external: true
              }
            ]
          }
        ]
      }
    },
    reason: "External imports допустимы только по контракту пакета",
    expected: {
      stage: "outputs",
      compilations: 1,
      success: false
    }
  },
  {
    name: "Отсутствующая development map",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "development"
    },
    fixture: {
      compilerReport: {
        javascript: "export const value=1\n"
      }
    },
    reason: "Каждый development JavaScript output имеет companion map",
    expected: {
      stage: "outputs",
      compilations: 1,
      success: false
    }
  },
  {
    name: "Некорректная source map",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "development"
    },
    fixture: {
      compilerReport: {
        javascript: "//# sourceMappingURL=data:application/json;base64,bm90LWpzb24=\n"
      }
    },
    reason: "Map содержит JSON версии 3, sources и sourcesContent",
    expected: {
      stage: "outputs",
      compilations: 1,
      success: false
    }
  },
  {
    name: "Source map без исходников",
    props: {path: resolve(import.meta.dir, "fixture/single"), profile: "development"},
    fixture: {compilerReport: {javascript: "//# sourceMappingURL=data:application/json;base64," + Buffer.from(JSON.stringify({version: 3, mappings: ""})).toString("base64") + "\n"}},
    reason: "JSON версии 3 обязан содержать настоящие sources и sourcesContent",
    expected: {stage: "outputs", compilations: 1, success: false},
  },
])("$name", ({name, props, fixture: changes, reason, expected}) => {
  let fixture: ExecutionFixture
  let result: PackageBuildResult
  let repeated: PackageBuildResult
  let compilations: number
  let resourcesReleased: boolean
  let originalManifest: string

  beforeAll(async () => {
    const reportPatch = "compilerReport" in changes ? changes.compilerReport : undefined
    const preparation: import("./fixture").BuildFixtureChanges & {symbolicLinks?: Record<string, string>} = {...changes}
    if (reportPatch) {
      preparation.files = {
        ...("files" in changes ? changes.files : {}),
        "bunfig.toml": '[cosmos.package-build.environments.main]\nplugins = ["./plugin.ts"]\n',
        "plugin.ts": 'export default {name:"report-fixture",setup(){}}\n',
      }
    }
    fixture = await executionFixture(props.path, preparation)
    originalManifest = await Bun.file(join(fixture.root, "package.json")).text()
    await Bun.write(join(fixture.root, "published/current.txt"), "previous immutable version")
    if (name === "Plugin вне владельца") await Bun.write(join(fixture.root, "../outside.ts"), 'export default {name:"outside",setup(){}}\n')
    if (name === "Закрытый source зависимости") await Bun.write(join(fixture.directory, "node_modules/@fixture/library/private.ts"), "export const privateValue = 1\n")
    if (name === "Отсутствующий source") await import("node:fs/promises").then(({rm}) => rm(join(fixture.root, "main/index.ts")))
    const builder = fixtureBuilder(fixture, reportPatch ? "production" : props.profile as "production" | "development")
    const options = "options" in props ? props.options : {}
    const attempt = async (): Promise<PackageBuildResult> => {
      if (!reportPatch) return await buildOutcome(builder, fixture.name, options)
      const captured = fixture.observation.processes.find(({report}) => report !== undefined)
      if (!captured?.report || !captured.request) throw new Error("Real compiler report was not captured")
      const report = {...structuredClone(captured.report)}
      const base = report.outputs[0]!
      if ("outputs" in reportPatch) {
        report.outputs = reportPatch.outputs!.map((patch, index) => ({
          ...base,
          relative: name === "Output за пределами staging" ? "escape.js" : patch.path,
          path: resolve(dirnameForOutput(captured.request!.output), patch.path),
          ...("imports" in patch ? {imports: patch.imports.map((edge) => ({kind: "import-statement", ...edge}))} : {}),
          ...(index === 0 ? {} : {entryPoint: `./part-${index}.ts`}),
        }))
        if (name === "Коллизия физических outputs") {
          report.outputs = report.outputs.map((output, index) => ({...output, relative: `collision-${index}.js`, path: index === 0 ? base.path : base.path.replace(/\/([^/]+)$/, "/unused/../$1")}))
        }
      }
      if (name === "Необъявленный внешний import") {
        report.externalImports = [{path: "@unknown/runtime", kind: "import-statement", external: true}]
      }
      if ("javascript" in reportPatch) await Bun.write(base.path, reportPatch.javascript!)
      try {
        const owner = await builder.packageOwner(fixture.name)
        const outputs = await validatePackageBuildOutputs(fixture.name, owner, captured.request, report, props.profile as "production" | "development")
        return {module: fixture.name, env: owner.env, success: true, exitCode: 0, stdout: "", stderr: "", outputs}
      } catch (error) {
        return {module: fixture.name, env: "main", success: false, stage: "outputs", exitCode: 0, stdout: "", stderr: error instanceof Error ? error.message : String(error), outputs: []}
      }
    }
    if (reportPatch) {
      const compiled = await buildOutcome(builder, fixture.name)
      if (!compiled.success) throw new Error(`Compiler fixture failed before validation: ${compiled.stderr}`)
    }
    result = await attempt()
    compilations = fixture.observation.count("compiler")
    repeated = await attempt()
    resourcesReleased = await fixture.observation.released() && (await reportDirectories(fixture)).every(Boolean)
  }, 20_000)

  afterAll(async () => {await fixture?.cleanup()})
  test("Отказ", () => {
    expect(result.success, reason).toEqual(expected.success)
  })

  test("Стадия и причина", () => {
    expect(result.stage, "Диагностика определяет реальную стадию отказа").toEqual(expected.stage)
    expect(result.stdout + result.stderr, reason).toMatch(diagnostics[name]!)
    if (expected.stage === "compiler") {
      expect(result.exitCode, "Сохранён неуспешный exit code настоящего compiler process").not.toBe(0)
      expect(result.exitCode, "Exit code дочернего compiler не потерян").not.toBeNull()
    }
  })

  test("Допуск сборочного процесса", () => {
    expect(compilations, "Контракт и typecheck останавливают compiler до запуска").toEqual(expected.compilations)
  })

  test("Отсутствие частичного успеха", async () => {
    expect(result.outputs, "Отказ не возвращает подтверждённый output graph").toEqual([])
    expect(await Bun.file(join(fixture.root, "package.json")).text(), "Исходный manifest не изменён сборщиком").toEqual(originalManifest)
    expect(await Bun.file(join(fixture.root, "published/current.txt")).text(), "Опубликованное состояние предшественника сохранено").toEqual("previous immutable version")
  })

  describe.skipIf(name !== "Plugin изменяет outputs")("Диагностика завершённого compiler", () => {
    test("Сохранение process streams", () => {
      expect(result.stdout, "Output validation сохраняет stdout compiler").toContain("compiler-stdout")
      expect(result.stderr, "Output validation сохраняет stderr compiler").toContain("compiler-stderr")
      expect(result.exitCode, "Отказ callback сохраняет compiler exit code").toBe(1)
    })
  })

  test("Освобождение ресурсов", () => {
    expect(resourcesReleased, "Дочерние процессы завершены, временные report directories удалены").toEqual(true)
    expect(repeated, "Завершённый отказ не остаётся в pending map").not.toBe(result)
    expect(repeated.success, "Повтор заново проверяет тот же ошибочный вход").toBe(false)
    if (expected.compilations > 0 && !("compilerReport" in changes)) {
      expect(fixture.observation.count("compiler"), "Повтор после ошибки запускает новую компиляцию").toBe(compilations + 1)
    }
  })
})

function dirnameForOutput(output: {mode: "single"; artifact: string} | {mode: "multi"; outdir: string}) {
  return output.mode === "multi" ? output.outdir : resolve(output.artifact, "..")
}
