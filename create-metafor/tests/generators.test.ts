import { describe, test, expect } from "bun:test"
import {
  generateMetaFile,
  generatePackageJsonFile,
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

describe("generatePackageJsonFile", () => {
  test("должен генерировать package.json с правильными подстановками", () => {
    const result = generatePackageJsonFile("auth", "Авторизация", "John Doe")
    const parsed = JSON.parse(result)
    
    expect(parsed.name).toBe("@zavx0z/auth")
    expect(parsed.description).toBe("Авторизация")
    expect(parsed.author).toBe("John Doe")
    expect(parsed.version).toBe("0.1.0")
    expect(parsed.type).toBe("module")
    expect(parsed.private).toBe(true)
  })

  test("должен генерировать package.json с правильными dependencies", () => {
    const result = generatePackageJsonFile("auth", "Auth", "Test User")
    const parsed = JSON.parse(result)
    
    expect(parsed.dependencies).toEqual({
      "metafor": "^0.4.0",
    })
  })

  test("должен генерировать package.json с правильным scripts", () => {
    const result = generatePackageJsonFile("auth", "Auth", "Test User")
    const parsed = JSON.parse(result)
    
    expect(parsed.scripts.build).toBe("metafor-build src/meta.ts --out auth.json")
  })

  test("должен безопасно генерировать JSON-строки", () => {
    const result = generatePackageJsonFile("auth", "Auth \"quoted\"", "Test \"User\"")
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
  })
})

describe("generateTsconfigFile", () => {
  test("должен генерировать tsconfig.json для TypeScript-каркаса", () => {
    const result = generateTsconfigFile()
    const parsed = JSON.parse(result)

    expect(parsed.compilerOptions.strict).toBe(true)
    expect(parsed.include).toEqual(["src/**/*.ts"])
  })
})

describe("generateIndexHtmlFile", () => {
  test("должен генерировать index.html с правильными подстановками", () => {
    const result = generateIndexHtmlFile("auth", "Авторизация", "ru")
    
    expect(result).toContain('lang="ru"')
    expect(result).toContain("<title>Авторизация</title>")
    expect(result).toContain('src="auth"')
  })

  test("должен генерировать index.html с английским языком", () => {
    const result = generateIndexHtmlFile("auth", "Authentication", "en")
    
    expect(result).toContain('lang="en"')
    expect(result).toContain("<title>Authentication</title>")
  })

  test("должен экранировать HTML в description", () => {
    const result = generateIndexHtmlFile("test", "<script>alert('xss')</script>", "en")
    
    expect(result).toContain("&lt;script&gt;")
    expect(result).toContain("&lt;/script&gt;")
  })
})
