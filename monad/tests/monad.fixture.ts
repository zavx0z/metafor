import puppeteer from "puppeteer"
import { existsSync } from "node:fs"
import { serve } from "bun"

/**
 * Создает сервер для тестов с поддержкой WebGPU в браузере через Puppeteer.
 * Запускает реальные вычисления на настоящем устройстве.
 */
export async function createHeadlessWebGPUFixture() {
  // Создаем сервер для тестов, который будет возвращать тестовую страницу с логикой симуляции монад.
  // Сервер динамически генерирует страницу на основе переданных параметров теста.
  const server = serve({
    port: 0,
    development: {
      hmr: true,
      console: true,
    },
    routes: {
      "/test": async (req) => {
        const url = new URL(req.url)
        const params = url.searchParams.get("data")
        
        if (!params) {
          return new Response("Missing test parameters", { status: 400 })
        }
        
        try {
          const testData = JSON.parse(params)
          
        // Генерируем динамическую тестовую страницу с правильным импортом
        const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Monad Test</title>
</head>
<body>
  <div id="test-result"></div>
  <script type="module">
    // Используем относительный путь для импорта (работает с сервером Bun)
    import { MonadSystem } from '../src/index.js';

    // Глобальные переменные для передачи результатов
    window.__testResult = null;
    window.__testError = null;

    async function runTest() {
      try {
        if (!navigator.gpu) {
          throw new Error('WebGPU not supported in this browser');
        }
        
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) throw new Error('Failed to request GPU adapter');
        
        const device = await adapter.requestDevice();
        const system = new MonadSystem(device);
        
        await system.init({
          statesConfig: ${JSON.stringify(testData.statesConfig)},
          contextSchema: ${JSON.stringify(testData.contextSchema)},
          monads: ${JSON.stringify(testData.monads)},
        });
        
        ${testData.updates ? testData.updates.map((update: any) => 
          `system.updateContext(${update.agentIndex}, "${update.fieldName}", ${JSON.stringify(update.value)});`
        ).join("\n        ") : ""}
        
        for (let i = 0; i < ${testData.steps || 1}; i++) {
          system.step();
        }
        
        const states = await system.getStates();
        
        // Возвращаем результат через DOM элемент (надежнее консоли)
        document.getElementById('test-result').textContent = JSON.stringify({ success: true, states });
        window.__testResult = { success: true, states };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        
        // Возвращаем ошибку через DOM элемент
        document.getElementById('test-result').textContent = JSON.stringify({ success: false, error: errorMsg });
        window.__testError = { success: false, error: errorMsg };
      }
    }

    // Запускаем тест сразу после загрузки скрипта
    runTest();
  </script>
</body>
</html>
          `;
          
          return new Response(html, {
            headers: { "Content-Type": "text/html" },
          });
        } catch (error) {
          console.error("Error generating test page:", error);
          return new Response(`Error: ${error}`, { status: 500 });
        }
      },
    },
  });

  const HOST = `http://localhost:${server.port}`;

  // Настройка параметров запуска Puppeteer.
  const launchOptions: any = {
    headless: true,
    args: [
      "--no-sandbox",
      "--enable-unsafe-webgpu",
      "--disable-vulkan-fallback-to-gl",
      "--disable-vulkan-surface",
    ],
  };

  // Если найден локальный браузер, используем его.
  const execPath = getExecutablePath();
  if (execPath) launchOptions.executablePath = execPath;

    // Добавляем обработку ошибок при запуске браузера
    const browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    
    // Увеличиваем таймауты страницы
    page.setDefaultNavigationTimeout(30000);
    page.setDefaultTimeout(30000);

  return {
    server,
    browser,
    page,
    url: HOST,
    cleanup: async () => {
      await browser.close();
      server.stop();
    },
  };
}

/**
 * Вспомогательная функция для получения пути к исполняемому файлу браузера.
 */
function getExecutablePath(): string | undefined {
  if (process.platform === "darwin") {
    const paths = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    ];
    for (const p of paths) {
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

/**
 * Фикстура для запуска симуляции монад в браузере с реальным устройством.
 */
export class MonadTestFixture {
  private fixture: Awaited<ReturnType<typeof createHeadlessWebGPUFixture>> | null = null;

  /**
   * Запускает симуляцию с заданными параметрами и возвращает результаты состояний.
   */
  async runSimulation(params: {
    statesConfig: any;
    contextSchema: Record<string, string>;
    monads: Array<{ id: string; state: string; context: any }>;
    updates?: Array<{ agentIndex: number; fieldName: string; value: number | boolean }>;
    steps?: number;
  }): Promise<{ success: boolean; states?: string[]; error?: string }> {
    // Создаем фикстуру, если она еще не создана.
    if (!this.fixture) {
      this.fixture = await createHeadlessWebGPUFixture();
    }

    const { page, url, cleanup } = this.fixture;

    try {
      // Формируем параметры теста.
      const testData = {
        statesConfig: params.statesConfig,
        contextSchema: params.contextSchema,
        monads: params.monads,
        updates: params.updates || [],
        steps: params.steps || 1,
      };

    // Запускаем страницу с тестом.
    const testUrl = `${url}/test?data=${encodeURIComponent(JSON.stringify(testData))}`;
    
    // Увеличиваем таймаут и ждем полной загрузки
    await page.goto(testUrl, { waitUntil: "networkidle0", timeout: 30000 });

    // Ждем появления результата в DOM элементе
    const resultElement = await page.waitForSelector('#test-result', { timeout: 30000 });
    const resultText = await resultElement.evaluate(el => el.textContent);
    
    if (resultText) {
      return JSON.parse(resultText);
    } else {
      throw new Error('No test result found in DOM');
    }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("Error running simulation:", errorMsg);
      
      // Пытаемся получить логи из браузера для отладки
      try {
        const logs = await page.evaluate(() => window.__testLogs || []);
        if (logs.length > 0) {
          console.log("Browser logs:", logs);
        }
      } catch (e) {
        // Игнорируем ошибки получения логов
      }
      
      return { success: false, error: errorMsg };
    } finally {
      // Закрываем фикстуру после теста с защитой от ошибок
      try {
        await cleanup();
      } catch (cleanupError) {
        console.warn("Cleanup error:", cleanupError);
      }
      this.fixture = null;
    }
  }
}

/**
 * Создает фикстуру для использования в тестах.
 */
export function createMonadFixture() {
  return new MonadTestFixture();
}