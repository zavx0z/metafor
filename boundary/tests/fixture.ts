import puppeteer from "puppeteer"
import type * as puppeteerTypes from "puppeteer"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { serve } from "bun"
import { homedir } from "node:os"

// ==================== КОНФИГУРАЦИЯ ====================

// Таймауты
const TEARDOWN_TIMEOUT_MS = 20000 // Таймаут для завершения работы фикстуры после всех тестов
const PUPPETEER_TIMEOUT_MS = 45000 // Таймаут для операций Puppeteer (навигация, ожидание элементов)
const WEBGPU_WAIT_MS = 444 // Время ожидания завершения асинхронных операций WebGPU

// Пути к браузерам (macOS)
const BROWSER_PATHS_MACOS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
]

// Пути к браузерам, установленным через Puppeteer
const PUPPETEER_CACHE_PATHS = [
  join(homedir(), ".cache", "puppeteer"),
  join(homedir(), "Library", "Caches", "puppeteer"),
]

// Директории
const OUT_DIR_NAME = "dist-test" // Директория для сборки библиотеки для тестирования

// Параметры запуска Puppeteer
const LAUNCH_OPTIONS: any = {
  headless: true, // Запуск в headless-режиме (без графического интерфейса)
  args: [
    "--no-sandbox", // Отключение песочницы для Docker/CI
    "--enable-unsafe-webgpu", // Включение WebGPU (экспериментальная функция)
    "--disable-vulkan-fallback-to-gl", // Отключение Vulkan fallback на GL
    "--disable-vulkan-surface", // Отключение Vulkan поверхности
  ],
}

// Параметры сервера Bun
const SERVER_OPTIONS = {
  port: 0, // Автоматический выбор свободного порта
  development: { hmr: false, console: true }, // Отключение HMR, включение консоли
}

// ==================== КОНЕЦ КОНФИГУРАЦИИ ====================

/**
 * Ищет исполняемый файл браузера в кэше Puppeteer.
 */
function findPuppeteerBrowser(): string | undefined {
  const { readdirSync, statSync } = require("node:fs")

  for (const cachePath of PUPPETEER_CACHE_PATHS) {
    if (!existsSync(cachePath)) continue

    try {
      // Ищем в директории chrome
      const chromeDir = join(cachePath, "chrome")
      if (existsSync(chromeDir)) {
        const versions = readdirSync(chromeDir)
        for (const version of versions) {
          const versionDir = join(chromeDir, version)
          if (!statSync(versionDir).isDirectory()) continue

          // Структура Puppeteer 24.x:
          // <cache>/chrome/mac-<version>/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
          // или mac_arm для Apple Silicon
          const possiblePaths = [
            // Puppeteer 24.x структура
            join(versionDir, "chrome-mac-x64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
            join(versionDir, "chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
            // Альтернативная структура
            join(versionDir, "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
            join(versionDir, "Chromium.app", "Contents", "MacOS", "Chromium"),
          ]
          for (const p of possiblePaths) {
            if (existsSync(p)) return p
          }
        }
      }
    } catch {
      // Игнорируем ошибки чтения директорий
    }
  }
  return undefined
}

/**
 * Вспомогательная функция для получения пути к исполняемому файлу браузера.
 */
function getExecutablePath(): string | undefined {
  // Сначала проверяем системные браузеры
  if (process.platform === "darwin") {
    for (const p of BROWSER_PATHS_MACOS) {
      if (existsSync(p)) return p
    }
  }

  // Затем ищем в кэше Puppeteer
  return findPuppeteerBrowser()
}

/**
 * Фикстура для запуска эволюции полей на границе (Boundary) в браузере с реальным GPU-устройством.
 */
export class BoundaryTestFixture {
  private static browser: puppeteerTypes.Browser | null = null
  private static server: any = null
  private static baseUrl = ""
  private debug: boolean = false

  /**
   * Создает экземпляр фикстуры для тестирования.
   * @param options Опции фикстуры
   * @param options.debug Включить отладочные логи
   */
  constructor(options?: { debug?: boolean }) {
    this.debug = options?.debug ?? false
  }

  /**
   * Инициализирует общий браузер и сервер для всех тестов.
   * Вызывается один раз перед запуском всех тестов.
   */
  static async setup() {
    if (this.browser) return

    const packageRoot = join(import.meta.dir, "..")
    const outDir = join(packageRoot, OUT_DIR_NAME)

    // Собираем библиотеку для тестирования
    await Bun.build({
      entrypoints: [join(packageRoot, "src", "index.ts")],
      outdir: outDir,
      target: "browser",
    })

    const launchOptions: any = { ...LAUNCH_OPTIONS }

    const execPath = getExecutablePath()
    if (execPath) {
      launchOptions.executablePath = execPath
    } else {
      // Если браузер не найден, Puppeteer попытается найти его автоматически
      // Но в Puppeteer 24.x bundled browser отсутствует, поэтому добавляем информативную ошибку
      console.warn(
        "[FIXTURE] Browser not found in system paths or Puppeteer cache.\n" +
          "Please run: bun run setup:browsers\n" +
          "Or install Chrome manually.",
      )
    }

    try {
      this.browser = await puppeteer.launch(launchOptions)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(
        `Failed to launch browser: ${errorMessage}\n\n` +
          "To fix this issue, run one of the following commands:\n" +
          "  cd field && bun run setup:browsers\n" +
          "  npx puppeteer browsers install chrome\n\n" +
          "Or install Google Chrome manually on your system.",
      )
    }

    // Создаем сервер для тестов
    this.server = serve({
      ...SERVER_OPTIONS,
      routes: {
        "/test": async (req) => {
          const url = new URL(req.url)
          const params = url.searchParams.get("data")
          if (!params) return new Response("Missing test parameters", { status: 400 })
          try {
            const testData = JSON.parse(params)
            return new Response(
              html`
                <!DOCTYPE html>
                <html>
                  <head>
                    <meta charset="UTF-8" />
                    <title>Boundary Test</title>
                  </head>
                  <body>
                    <div id="result"></div>
                    <script type="module">
                      import { Boundary } from "/dist-test/index.js"

                      async function run() {
                        try {
                          console.log("[TEST] Starting boundary simulation...")

                          if (!navigator.gpu) {
                            throw new Error("WebGPU not supported in this browser")
                          }

                          console.log("[TEST] Requesting GPU adapter...")
                          const adapter = await navigator.gpu.requestAdapter()
                          if (!adapter) throw new Error("Failed to request GPU adapter")

                          console.log("[TEST] Requesting GPU device...")
                          const device = await adapter.requestDevice()

                          console.log("[TEST] Creating Boundary...")
                          const boundary = new Boundary(device)

                          console.log("[TEST] Initializing with config:", ${JSON.stringify(testData.branes)})
                          await boundary.init({
                            branes: ${JSON.stringify(testData.branes)},
                            fields: ${JSON.stringify(testData.fields)},
                          })

                          ${testData.updates
                            ? testData.updates
                                .map(
                                  (u: any) =>
                                    `console.log('[TEST] Updating brane: field=${u.fieldIndex}, component=${u.componentName}, value=${JSON.stringify(u.value)}');
        boundary.updateBraneField(${u.fieldIndex}, "${u.componentName}", ${JSON.stringify(u.value)});`,
                                )
                                .join("\n      ")
                            : ""}

                          const stepCount = ${testData.steps !== undefined ? testData.steps : 1}
                          console.log("[TEST] Running " + stepCount + " step(s)...")
                          for (let i = 0; i < stepCount; i++) {
                            boundary.step()
                          }

                          console.log("[TEST] Getting final states...")
                          const states = await boundary.getStates()

                          console.log("[TEST] Success! States:", states)
                          document.getElementById("result").textContent = JSON.stringify({ success: true, states })
                        } catch (e) {
                          console.error("[TEST] Error:", e)
                          document.getElementById("result").textContent = JSON.stringify({
                            success: false,
                            error: e.message,
                            stack: e.stack,
                          })
                        }
                      }
                      // Запускаем после полной загрузки DOM
                      document.addEventListener("DOMContentLoaded", run)
                    </script>
                  </body>
                </html>
              `,
              { headers: { "Content-Type": "text/html" } },
            )
          } catch (e) {
            return new Response(`Error: ${e}`, { status: 500 })
          }
        },
      },
      async fetch(req) {
        const url = new URL(req.url)
        if (url.pathname.startsWith("/dist-test/")) {
          return new Response(Bun.file(join(packageRoot, url.pathname)))
        }
        return new Response("Not Found", { status: 404 })
      },
    })
    this.baseUrl = `http://localhost:${this.server.port}`
  }

  /**
   * Закрывает браузер и сервер после всех тестов.
   * Вызывается один раз после завершения всех тестов.
   */
  static async teardown() {
    // Закрываем браузер с обработкой ошибок
    if (this.browser) {
      try {
        const pages = await this.browser.pages()
        // Закрываем все открытые страницы
        await Promise.all(pages.map((page) => page.close().catch(() => {})))
        await this.browser.close()
      } catch (error) {
        console.warn("[FIXTURE] Error closing browser:", error)
      } finally {
        this.browser = null
      }
    }

    // Останавливаем сервер
    if (this.server) {
      try {
        this.server.stop()
      } catch (error) {
        console.warn("[FIXTURE] Error stopping server:", error)
      } finally {
        this.server = null
      }
    }

    // Асинхронно удаляем тестовую директорию
    try {
      const packageRoot = join(import.meta.dir, "..")
      const outDir = join(packageRoot, OUT_DIR_NAME)
      if (existsSync(outDir)) {
        // Используем асинхронное удаление с помощью Bun
        await Bun.$`rm -rf ${outDir}`.quiet()
      }
    } catch (error) {
      console.warn("[FIXTURE] Error cleaning up dist-test:", error)
    }
  }

  /**
   * Запускает симуляцию с заданными параметрами в новой вкладке.
   *
   * @param params.branes - Схема типов данных браны
   * @param params.fields - Массив полей с бранами, состояниями и суперпозициями
   * @param params.updates - Обновления компонент бран перед шагом
   * @param params.steps - Количество шагов симуляции
   */
  async runSimulation(params: {
    branes: Record<string, any>
    fields: Array<{ id: string; state: string; brane: any; superposition: any }>
    updates?: Array<{ fieldIndex: number; componentName: string; value: number | boolean }>
    steps?: number
  }): Promise<{ success: boolean; states?: string[]; error?: string; stack?: string }> {
    if (!BoundaryTestFixture.browser || !BoundaryTestFixture.baseUrl) {
      throw new Error("Fixture not initialized. Call BoundaryTestFixture.setup() first")
    }

    const page = await BoundaryTestFixture.browser.newPage()
    page.setDefaultNavigationTimeout(PUPPETEER_TIMEOUT_MS)
    page.setDefaultTimeout(PUPPETEER_TIMEOUT_MS)

    // Собираем логи консоли браузера (должно быть ДО навигации)
    const browserLogs: string[] = []
    page.on('console', msg => {
      const text = msg.text()
      browserLogs.push(text)
      if (this.debug) {
        console.log("[BROWSER]", text)
      }
    })

    try {
      const testData = {
        branes: params.branes,
        fields: params.fields,
        updates: params.updates || [],
        steps: params.steps !== undefined ? params.steps : 1,
      }

      const testUrl = `${BoundaryTestFixture.baseUrl}/test?data=${encodeURIComponent(JSON.stringify(testData))}`
      await page.goto(testUrl, { waitUntil: "networkidle2", timeout: PUPPETEER_TIMEOUT_MS })

      // Ждем появления результата с отладочным логированием
      if (this.debug) {
        console.log("[FIXTURE] Waiting for #result element...")
      }

      const resultElement = await page.waitForSelector("#result", {
        timeout: PUPPETEER_TIMEOUT_MS,
        visible: true,
      })

      // Даем достаточно времени для завершения асинхронных операций WebGPU
      await new Promise((resolve) => setTimeout(resolve, WEBGPU_WAIT_MS))

      // Получаем и логируем содержимое страницы для отладки
      const pageContent = await page.content()
      if (this.debug) {
        console.log("[FIXTURE] Page content (first 1000 chars):", pageContent.substring(0, 1000))
      }

      const resultText = await resultElement!.evaluate((el: any) => el.textContent?.trim() || "")
      if (this.debug) {
        console.log("[FIXTURE] Result text:", resultText)
      }

      if (!resultText || resultText === "") {
        // Получаем ошибки консоли браузера для отладки
        const consoleLogs = await page.evaluate(() => {
          // @ts-ignore
          return window.__testLogs || []
        })
        console.error("[FIXTURE] Empty result. Browser console logs:", consoleLogs)
        throw new Error("Empty result from test page")
      }

      try {
        return JSON.parse(resultText)
      } catch (parseError) {
        console.error("[FIXTURE] Failed to parse result:", resultText)
        throw new Error(`Invalid JSON in result: ${resultText}`)
      }
    } catch (error) {
      console.error("[FIXTURE] Test simulation error:", error)

      // Получаем ошибки консоли браузера для отладки
      try {
        const browserLogs = await page.evaluate(() => {
          // @ts-ignore
          const logs = window.__testLogs || []
          // @ts-ignore
          const errors = window.__testErrors || []
          return { logs, errors }
        })
        console.error("[FIXTURE] Browser logs:", browserLogs)
      } catch (e) {
        console.error("[FIXTURE] Could not get browser logs:", e)
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
      }
    } finally {
      // Закрываем только вкладку, не браузер
      try {
        await page.close()
      } catch (closeError) {
        console.warn("[FIXTURE] Error closing page:", closeError)
      }
    }
  }
}

// Обратная совместимость
export { BoundaryTestFixture as QuantumFieldTestFixture }

/**
 * Создает фикстуру для использования в тестах.
 * @param options Опции фикстуры
 * @param options.debug Включить отладочные логи
 */
export function createBoundaryFixture(options?: { debug?: boolean }) {
  return new BoundaryTestFixture(options)
}

// Обратная совместимость
export { createBoundaryFixture as createQuantumFieldFixture }

const html = String.raw
