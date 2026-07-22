import { describe, test, expect } from "bun:test"
import {
  generateMetaFile,
  generateMetaforTypesFile,
  generateTodoFile,
  generatePackageJsonFile,
  npmPackageName,
  generateGitignoreFile,
  generateIndexHtmlFile,
  generateTsconfigFile,
} from "../src/generators.ts"

describe("generateMetaFile", () => {
  test("должен генерировать meta.ts с правильными подстановками", () => {
    const result = generateMetaFile("auth", "Авторизация", "Ошибка")
    
    expect(result).toContain('MetaFor("auth"')
    expect(result).toContain('desc: "Авторизация"')
    expect(result).toContain('label: "Ошибка"')
  })

  test("должен генерировать meta.ts с английским языком", () => {
    const result = generateMetaFile("auth", "Authentication", "Error")
    
    expect(result).toContain('desc: "Authentication"')
    expect(result).toContain('label: "Error"')
  })

  test("должен генерировать универсальный каркас без специализированных процессов", () => {
    const result = generateMetaFile("auth", "Authentication", "Error")

    expect(result).toContain(".superposition({})")
    expect(result).toContain(".mass({})")
    expect(result).toContain(".energy()")
    expect(result).toContain(".processes(() => [])")
    expect(result).toContain(".reactions(() => [])")
    expect(result).not.toContain("fullscreen")
    expect(result).not.toContain("./actions/")
  })

  test("должен безопасно подставлять строки TypeScript", () => {
    const result = generateMetaFile("quote", "Meta \"quoted\"", "Error \"label\"")

    expect(result).toContain('desc: "Meta \\"quoted\\""')
    expect(result).toContain('label: "Error \\"label\\""')
  })
})

describe("generateMetaforTypesFile", () => {
  test("должен генерировать локальные декларации MetaFor без внешних импортов", () => {
    const result = generateMetaforTypesFile()

    expect(result).toContain("var MetaFor: MetaForFn")
    expect(result).toContain("type MetaForFieldBuilder")
    expect(result).toContain("type MetaForValues")
    expect(result).toContain("type MetaForSuperpositionInputCheck")
    expect(result).toContain("type MetaForProcessValue")
    expect(result).toContain("energy<Energy extends Record<string, unknown> = {}>")
    expect(result).toContain("MetaForEnergyDeclaration<Energy>")
    expect(result).toContain("MetaForEnergyInputCheck<Energy>")
    expect(result).toContain("energy: Energy")
    expect(result).toContain("destroy: <State extends MetaForStateKeys<Superposition>>")
    expect(result).not.toMatch(/^\s*import\b/m)
    expect(result).not.toMatch(/\bfrom\s+["']/)
  })
})

describe("generateTodoFile", () => {
  test("должен генерировать TODO.md в корне пакета", () => {
    const result = generateTodoFile("auth", "Авторизация")

    expect(result).toContain("1. Тематический раздел")
    expect(result).toContain("    - [ ] задача")
    expect(result).toContain("2. ...")
    expect(result).not.toContain("# TODO")
    expect(result).not.toContain("## auth")
    expect(result).not.toContain("Авторизация")
  })
})

describe("generatePackageJsonFile", () => {
  test("должен генерировать корневой package.json с npm scope владельца", () => {
    const result = generatePackageJsonFile(
      {owner: "zavx0z", repository: "capsule"},
      "Капсула",
      "zavx0z",
    )
    const parsed = JSON.parse(result)

    expect(parsed.name).toBe("@zavx0z/capsule")
    expect(parsed.description).toBe("Капсула")
    expect(parsed.author).toBe("zavx0z")
    expect(parsed.workspaces).toEqual(["*"])
    expect(parsed.version).toBe("0.1.0")
    expect(parsed.type).toBe("module")
    expect(parsed.private).toBe(true)
    expect(parsed.exports["."]).toBe("./meta.ts")
  })

  test("должен разворачивать внутренний src в плоское валидное npm-имя", () => {
    const identity = {owner: "zavx0z", repository: "capsule", metaPackage: "profile"}
    const parsed = JSON.parse(generatePackageJsonFile(identity, "Профиль", "zavx0z"))

    expect(npmPackageName(identity)).toBe("@zavx0z/capsule-profile")
    expect(parsed.name).toBe("@zavx0z/capsule-profile")
    expect(parsed.workspaces).toBeUndefined()
  })

  test("не должен генерировать зависимость на непубликованный runtime", () => {
    const result = generatePackageJsonFile({owner: "zavx0z", repository: "capsule"}, "Auth", "zavx0z")
    const parsed = JSON.parse(result)

    expect(parsed.dependencies).toBeUndefined()
  })

  test("должен генерировать package.json с правильным scripts", () => {
    const result = generatePackageJsonFile({owner: "zavx0z", repository: "capsule"}, "Auth", "zavx0z")
    const parsed = JSON.parse(result)

    expect(parsed.scripts.build).toBe("bun build meta.ts --outdir dist --target browser --format=esm")
    expect(parsed.devDependencies["@types/bun"]).toBe("^1.3.14")
    expect(parsed.devDependencies["@types/node"]).toBe("^25.5.0")
  })

  test("должен безопасно генерировать JSON-строки", () => {
    const result = generatePackageJsonFile(
      {owner: "zavx0z", repository: "capsule", metaPackage: "auth"},
      "Auth \"quoted\"",
      "Test \"User\"",
    )
    const parsed = JSON.parse(result)

    expect(parsed.description).toBe("Auth \"quoted\"")
    expect(parsed.author).toBe("Test \"User\"")
  })
})

describe("generateGitignoreFile", () => {
  test("должен генерировать .gitignore с правильным содержимым", () => {
    const result = generateGitignoreFile()
    
    expect(result).toContain("node_modules/")
    expect(result).toContain("dist/")
    expect(result).toContain("*.json")
    expect(result).toContain("!package.json")
    expect(result).toContain("!tsconfig.json")
  })
})

describe("generateTsconfigFile", () => {
  test("должен генерировать tsconfig.json для TypeScript-каркаса", () => {
    const result = generateTsconfigFile()
    const parsed = JSON.parse(result)

    expect(parsed.compilerOptions.strict).toBe(true)
    expect(parsed.compilerOptions.exactOptionalPropertyTypes).toBe(true)
    expect(parsed.compilerOptions.noUncheckedIndexedAccess).toBe(true)
    expect(parsed.compilerOptions.allowImportingTsExtensions).toBe(true)
    expect(parsed.compilerOptions.types).toEqual(["bun", "node"])
    expect(parsed.include).toBeUndefined()
  })
})

describe("generateIndexHtmlFile", () => {
  test("должен генерировать index.html с правильными подстановками", () => {
    const result = generateIndexHtmlFile("auth", "Авторизация", "ru", "zavx0z/capsule/auth")
    
    expect(result).toContain('lang="ru"')
    expect(result).toContain("<title>Авторизация</title>")
    expect(result).toContain('src="zavx0z/capsule/auth"')
  })

  test("должен генерировать index.html с английским языком", () => {
    const result = generateIndexHtmlFile("auth", "Authentication", "en", "zavx0z/capsule/auth")
    
    expect(result).toContain('lang="en"')
    expect(result).toContain("<title>Authentication</title>")
  })

  test("должен экранировать HTML в description", () => {
    const result = generateIndexHtmlFile("test", "<script>alert('xss')</script>", "en", "zavx0z/capsule/test")
    
    expect(result).toContain("&lt;script&gt;")
    expect(result).toContain("&lt;/script&gt;")
  })
})
