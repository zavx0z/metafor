import puppeteer, {Browser, ElementHandle, Page} from "puppeteer"
import {MetaFor} from "../metafor.js"
import type {Subprocess} from "bun"
import {join} from "node:path"

const cssEscape = (value: string) => value.replace(/\//g, "\\$&")

/**
 * Расширение глобального объекта Window
 * @interface Window
 * @property MetaFor - Конструктор атома
 * @property dataStore - Хранилище данных для тестов
 */
declare global {
  interface Window {
    MetaFor: typeof MetaFor
    dataStore: Map<string, any>
  }
}

/**
 * Конфигурация фикстуры графа
 * @interface GraphFixtureConfig
 * @property width - Ширина окна браузера
 * @property height - Высота окна браузера
 * @property port - Порт сервера
 */
export interface GraphFixtureConfig {
  width?: number
  height?: number
  port?: number
  devtools?: boolean
  headless?: boolean
}

/**
 * Расширенные методы страницы Puppeteer
 * @interface QPage
 * @extends Page
 * @property waitForSelector - Расширенный метод ожидания селектора
 * @property hover - Расширенный метод наведения
 * @property click - Расширенный метод клика
 */
interface QPage extends Omit<Page, "waitForSelector" | "hover" | "click"> {
  waitForSelector<Selector extends string>(
    selector: Selector,
    options?: Parameters<Page["waitForSelector"]>[1]
  ): Promise<ElementHandle | null>

  hover(selector: string): Promise<void>

  click(selector: string, options?: Parameters<Page["click"]>[1]): Promise<void>
}

/**
 * Расширение фикстуры для графа
 * @interface QGraphFixture
 * @property browser - Экземпляр браузера
 * @property page - Страница браузера с расширенными методами
 * @property server - Тестовый сервер
 * @property setup - Метод для инициализации фикстуры
 * @property teardown - Метод для очистки фикстуры
 */
export interface QGraphFixture {
  browser: Browser
  page: QPage
  setup(): Promise<void>
  teardown(): Promise<void>
}

/**
 * Создает фикстуру для тестирования графа
 * @param config - Конфигурация фикстуры
 */
export function createGraphFixture(config: GraphFixtureConfig = {}): QGraphFixture {
  const width = config.width ?? 1024 * 2
  const height = config.height ?? 768 * 2
  const port = config.port ?? 4422

  let headless, devtools
  typeof config.headless === "boolean" ? (headless = config.headless) : (headless = true)
  typeof config.devtools === "boolean" ? (devtools = config.devtools) : (devtools = false)
  if (
    Bun.env.npm_lifecycle_script?.includes("--debug") ||
    (process.env.npm_lifecycle_event === undefined && process.env.STUDIO_VM_OPTIONS)
  ) {
    headless = false
    devtools = true
  }

  let browser: Browser
  let page: QPage
  let processServer: Subprocess<"ignore", "inherit", "inherit">

  return {
    get browser() {
      return browser
    },
    get page() {
      return page
    },

    async setup() {
      // Создаем тестовый сервер
      processServer = Bun.spawn({
        cmd: ["bun", "run", "--port", `${port}`, join(import.meta.dir, "server.ts")],
        stdout: "inherit",
        stderr: "inherit"
      })
      console.log("Сервер запущен. PID:", process.pid)

      await Bun.sleep(444)
      // Инициализируем браузер с новыми настройками
      browser = await puppeteer.launch({
        headless,
        devtools,
        defaultViewport: {width, height},
        args: [
          `--window-size=${width},${height}`,
          "--disable-dev-shm-usage",
          "--no-sandbox",
          "--disable-setuid-sandbox"
        ]
      })

      // Создаем страницу с расширенными методами
      page = (await browser.newPage()) as QPage

      // Предоставляем разрешения для буфера обмена
      const context = browser.defaultBrowserContext()
      await context.overridePermissions(`http://localhost:${port}`, ["clipboard-read", "clipboard-write"])

      // Устанавливаем обработчик буфера обмена
      await page.evaluateOnNewDocument(() => {
        let clipboardData = ""

        // Переопределяем clipboard API
        Object.defineProperty(navigator, "clipboard", {
          value: {
            writeText: (text: string) => {
              clipboardData = text
              return Promise.resolve()
            },
            readText: () => Promise.resolve(clipboardData)
          },
          configurable: true
        })
      })

      // Расширяем существующие методы страницы
      const originalWaitForSelector = page.waitForSelector.bind(page)
      page.waitForSelector = (selector: string, options?: any) => {
        return originalWaitForSelector(cssEscape(selector), options)
      }

      const originalHover = page.hover.bind(page)
      page.hover = (selector: string) => {
        return originalHover(cssEscape(selector))
      }

      const originalClick = page.click.bind(page)
      page.click = (selector: string, options?: any) => {
        return originalClick(cssEscape(selector), options)
      }

      page.on("console", msg => console.log("PAGE LOG:", msg.text()))
      page.on("pageerror", err => console.log("PAGE ERROR:", err.toString()))

      // Открываем тестовую страницу
      await page.goto(`http://localhost:${port}`, {
        waitUntil: "networkidle0",
        timeout: 10000
      })
    },

    async teardown() {
      processServer.kill()
      await browser.close()
    }
  }
}
