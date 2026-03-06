import { describe, test, expect } from "bun:test"
import {
  generateMetaFile,
  generatePackageJsonFile,
  generateGitignoreFile,
  generateIndexHtmlFile,
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
      "@metafor/meta": "link:@metafor/meta",
      "@metafor/build": "link:@metafor/build",
    })
  })

  test("должен генерировать package.json с правильным scripts", () => {
    const result = generatePackageJsonFile("auth", "Auth", "Test User")
    const parsed = JSON.parse(result)
    
    expect(parsed.scripts.build).toBe("metafor-build src/meta.ts --out auth.json")
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
