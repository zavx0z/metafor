# MF-428 — Артефакты

## `multi-profile-root-service-worker.png`

* Источник: точный WebGPU canvas Hamiltonian, полученный через CDP target
  отдельного Chrome-CDP в состоянии, когда одновременно работал обычный Chrome
  и Chrome-CDP с тем же `http://127.0.0.1:4400/`.
* Дата: 12 августа 2026 года.
* Версия проекта: `b0fee1ee00d2caed6f4eab1474d80e4069d6729b` плюс незакоммиченная,
  не относящаяся к этому наблюдению работа `NODES-008.5`.
* Ожидание: каждый наблюдённый Service Worker после `connect-window` находится
  внутри exact Chrome, которому принадлежат обслуживаемые им page realm.
* Фактическое наблюдение: отдельная карточка `Service Worker` находится на
  корневом уровне сцены вне контейнера `Chrome`; изображение не устанавливает
  внутреннюю причину потери parent identity.
* Чувствительные сведения: секретов нет; видны localhost, временные runtime
  identity и PID испытательного контура.
* Контрольная сумма SHA-256:
  `e571ea4a3a6d5fc98f4b170f088aa8f70fda7eb6dc92f321a91561f98a86f7c6`.

## Исправленный live-сценарий MF-428.1

### Scope и точная адресация

Hamiltonian запущен из канонического checkout на версии
`b0fee1ee00d2caed6f4eab1474d80e4069d6729b` плюс изменения MF-428.1:

* URL: `http://127.0.0.1:4400/`;
* host version: `mf-428-ownership`;
* Chrome-CDP: `Chrome/151.0.7922.109`, process `17233`, user data dir
  `Google/Chrome-CDP`;
* normal browser-local scope: profile
  `b04b5959-28a2-4ac0-ba5c-6bdba29e0091`, Service Worker
  `45d8fde1-9ecb-4c83-b52a-095c974cb4a1`, targets
  `6BC8156021218A05194924549E76BA0D` и
  `89DF5E715892B097D32A57018E70D9B2`;
* incognito browser-local scope: profile
  `b1726b3a-2267-4e7a-b11f-f642b1030a8a`, Service Worker
  `5df2f151-55ff-4e73-9f84-3b4798deb7e6`, targets
  `31BCAB53DA714C4D50B48990D050564D` и
  `6DE7D62E5898AF673461A033D4815065`.

Все четыре exact targets вернули `document.readyState = complete`, один canvas,
одинаковые profile/Worker identity внутри каждой пары и разные identity между
парами. Reload targets `6BC8156021218A05194924549E76BA0D` и
`31BCAB53DA714C4D50B48990D050564D` прошёл с полной readiness без ожидания
`networkIdle`, которое неприменимо к постоянному control WebSocket. После
reload identity обеих пар сохранились. По `1200` мс CDP-console observation в
normal и incognito targets вернули `0` записей.

### `multi-profile-owned-workers-normal.png`

* Источник: `canvas.toDataURL("image/png")` через exact normal target
  `6BC8156021218A05194924549E76BA0D`.
* Ожидание и результат: в общей сцене две отдельные `Chrome` compound-ноды с
  разными правыми profile ID; в каждой находятся две страницы и её Service
  Worker; корневой Service Worker отсутствует. Личный canvas-transform этого
  target располагает те же поддеревья вертикально.
* Размер: `1470 × 2176` PNG.
* SHA-256:
  `13311991d4f8253841d6369d99b53f5196e504e59033b7e622d52b62c8f7a7b6`.

### `multi-profile-owned-workers-incognito.png`

* Источник: `canvas.toDataURL("image/png")` через exact incognito target
  `31BCAB53DA714C4D50B48990D050564D`.
* Ожидание и результат: обе Chrome-ноды видны рядом; справа в каждой показан
  свой сокращённый profile ID, полный ID находится в фактах, внутри каждой
  находятся две страницы и один exact Service Worker. Cross-profile ownership
  и корневого Service Worker нет.
* Размер: `1470 × 2176` PNG.
* SHA-256:
  `6229da4165dfabb649fad3e8dc0525f83291d83ea0c9aaa0952b3222adb7fa19`.

### Незасчитанная проверка

Попытка `ServiceWorker.stopAllWorkers` через `@meta/chrome` REST CDP-command
вернула `CDP -32000: ServiceWorker domain not enabled`: `enable` и `stop` попали
в разные краткоживущие CDP-сессии. Это не является evidence restart execution
и оставлено открытым в родительской MF-428.
