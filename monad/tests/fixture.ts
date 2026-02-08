import puppeteer from "puppeteer"
import type * as puppeteerTypes from "puppeteer"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { serve } from "bun"
import { afterAll, beforeAll } from "bun:test"

// Инициализируем фикстуру один раз перед всеми тестами
beforeAll(async () => {
  await MonadTestFixture.setup()
})

// Закрываем фикстуру один раз после всех тестов
afterAll(async () => {
  await MonadTestFixture.teardown()
}, 20000)

/**
 * Вспомогательная функция для получения пути к исполняемому файлу браузера.
 */
function getExecutablePath(): string | undefined {
  if (process.platform === "darwin") {
    const paths = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    ]
    for (const p of paths) {
      if (existsSync(p)) return p
    }
  }
  return undefined
}

/**
 * Фикстура для запуска симуляции монад в браузере с реальным устройством.
 */
export class MonadTestFixture {
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
    const outDir = join(packageRoot, "dist-test")

    // Собираем библиотеку для тестирования
    await Bun.build({
      entrypoints: [join(packageRoot, "src", "index.ts")],
      outdir: outDir,
      target: "browser",
    })

    const launchOptions: any = {
      headless: true,
      args: ["--no-sandbox", "--enable-unsafe-webgpu", "--disable-vulkan-fallback-to-gl", "--disable-vulkan-surface"],
    }

    const execPath = getExecutablePath()
    if (execPath) launchOptions.executablePath = execPath

    this.browser = await puppeteer.launch(launchOptions)

    // Создаем сервер для тестов
    this.server = serve({
      port: 0,
      development: { hmr: false, console: true },
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
                    <title>Monad Test</title>
                  </head>
                  <body>
                    <div id="result"></div>
                    <script type="module">
                      import { MonadSystem } from "/dist-test/index.js"

                      async function run() {
                        try {
                          console.log("[TEST] Starting simulation...")

                          if (!navigator.gpu) {
                            throw new Error("WebGPU not supported in this browser")
                          }

                          console.log("[TEST] Requesting GPU adapter...")
                          const adapter = await navigator.gpu.requestAdapter()
                          if (!adapter) throw new Error("Failed to request GPU adapter")

                          console.log("[TEST] Requesting GPU device...")
                          const device = await adapter.requestDevice()

                          console.log("[TEST] Creating MonadSystem...")
                          const system = new MonadSystem(device)

                          console.log("[TEST] Initializing with config:", ${JSON.stringify(testData.statesConfig)})
                          await system.init({
                            statesConfig: ${JSON.stringify(testData.statesConfig)},
                            contextSchema: ${JSON.stringify(testData.contextSchema)},
                            monads: ${JSON.stringify(testData.monads)},
                          })

                          ${testData.updates
                            ? testData.updates
                                .map(
                                  (u: any) =>
                                    `console.log('[TEST] Updating context: agent=${u.agentIndex}, field=${u.fieldName}, value=${JSON.stringify(u.value)}');
        system.updateContext(${u.agentIndex}, "${u.fieldName}", ${JSON.stringify(u.value)});`,
                                )
                                .join("\n      ")
                            : ""}

                          const stepCount = ${testData.steps !== undefined ? testData.steps : 1}
                          console.log("[TEST] Running " + stepCount + " step(s)...")
                          for (let i = 0; i < stepCount; i++) {
                            system.step()
                          }

                          console.log("[TEST] Getting final states...")
                          const states = await system.getStates()

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
      const outDir = join(packageRoot, "dist-test")
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
   */
  async runSimulation(params: {
    statesConfig: any
    contextSchema: Record<string, string>
    monads: Array<{ id: string; state: string; context: any }>
    updates?: Array<{ agentIndex: number; fieldName: string; value: number | boolean }>
    steps?: number
  }): Promise<{ success: boolean; states?: string[]; error?: string; stack?: string }> {
    if (!MonadTestFixture.browser || !MonadTestFixture.baseUrl) {
      throw new Error("Fixture not initialized. Call MonadTestFixture.setup() first")
    }

    const page = await MonadTestFixture.browser.newPage()
    page.setDefaultNavigationTimeout(45000)
    page.setDefaultTimeout(45000)

    try {
      const testData = {
        statesConfig: params.statesConfig,
        contextSchema: params.contextSchema,
        monads: params.monads,
        updates: params.updates || [],
        steps: params.steps !== undefined ? params.steps : 1,
      }

      const testUrl = `${MonadTestFixture.baseUrl}/test?data=${encodeURIComponent(JSON.stringify(testData))}`
      await page.goto(testUrl, { waitUntil: "networkidle2", timeout: 45000 })

      // Ждем появления результата с отладочным логированием
      if (this.debug) {
        console.log("[FIXTURE] Waiting for #result element...")
      }

      const resultElement = await page.waitForSelector("#result", {
        timeout: 45000,
        visible: true,
      })

      // Даем достаточно времени для завершения асинхронных операций WebGPU
      await new Promise((resolve) => setTimeout(resolve, 2000))

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

/**
 * Создает фикстуру для использования в тестах.
 * @param options Опции фикстуры
 * @param options.debug Включить отладочные логи
 */
export function createMonadFixture(options?: { debug?: boolean }) {
  return new MonadTestFixture(options)
}
const html = String.raw
