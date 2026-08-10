# ENGINE-002 — доказательства GPU upload

## Происхождение

Артефакты сняты 10 августа 2026 года с живого standalone Hamiltonian
`http://127.0.0.1:4400/` в каноническом checkout MetaFor. Реализация Engine
соответствует коммиту `976295edd96cfac7b39547f2782f0f9dd47d6b04`; более
поздние коммиты до момента снимка меняли только проектную документацию.

WebGPU Inspector `1.5.0` был подключён внешне и не входил в исходники или bundle
MetaFor. GPU capture выполнен с `profilePasses: true` и `payloads: "none"` во
время ограниченного CDP camera drag.

## Файлы

### `instrumented-hamiltonian.png`

* Источник: composited CDP screenshot точной вкладки Hamiltonian, target
  `6B9ABE69BA42A93A8481B5D5F1676D7A`.
* Ожидалось: непустая полная схема с узлами, связями, текстом и Inspector HUD.
* Получено: схема отрисована полностью; пустого canvas, пропавшего текста или
  WebGPU error overlay нет.
* Размер: `144015` байт, `1458 × 2176`.
* SHA-256: `5ce4f5e0672c9e69d01da9c7874e0efd822e7a233318db12d5ff4007be2d5cdb`.
* Чувствительные данные: секретов нет; присутствуют локальные runtime identity,
  PID и loopback-адрес диагностического контура.

Жёлтый счётчик `dropped` накоплен за долгую instrumented/background-сессию и не
является числом пропущенных кадров во время контрольного окна.

### `camera-drag-capture-summary.json`

* Источник: WebGPU Inspector capture `cap-7`, frame `13428`.
* Ожидалось: camera drag порождает полноценный кадр с render-pass и draw calls,
  обычные объекты передают по `256` байт вместо совмещённого блока `8448` байт.
* Получено: `516` draw calls, `2` render-pass, `3` `writeBuffer`, `132112` байт
  суммарно; объектная запись `132096 = 516 × 256`; validation errors отсутствуют.
* GPU timestamps: недоступны (`gpuTimeMs: null`), точное GPU-время не
  утверждается.
* Чувствительные данные: отсутствуют.

Исходный бинарный capture не добавлен в Git автоматически из-за размера. Его
путь на машине профилирования:
`/Users/zavx0z/.codex/state/webgpu-inspector/captures/cap-7.wgpuc`.
Размер: `26382856` байт. SHA-256:
`50d0142df82f3f87a65d0b85c3cc84ef12bbfde8cc0be152475b651d8d4975ff`.

## Граница доказательства

Capture и PNG доказывают наблюдаемый instrumented render path и объём GPU
upload после ENGINE-002. Они не доказывают clean cold-start: Inspector был уже
подключён к текущей CDP-сессии. Задача не делает утверждения об ускорении
first-paint или точном GPU-времени.
