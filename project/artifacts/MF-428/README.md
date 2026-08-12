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

## `service-worker-card-before-mf-428-3-5.png`

* Источник: переданный владельцем crop живой ноды Service Worker в Hamiltonian;
  оригинальное имя `Снимок экрана 2026-08-12 в 17.39.57.png`.
* Дата: 12 августа 2026 года.
* Версия проекта: `a6c462a2ecf62b48aedfcae680c462f1a42eff03` плюс параллельные
  незакоммиченные изменения `NODES-008`, не относящиеся к карточке Worker.
* Ожидание владельца при передаче: compact logical Worker identity находится
  справа в шапке и не повторяется параметром; под шапкой нет описательного
  текста; видна отдельная SemVer исполняемого Worker code.
* Фактическое наблюдение: справа в шапке identifier отсутствует, строка
  `Identity` находится среди параметров, между шапкой и параметрами показано
  обрезанное описание, отдельной версии кода нет.
* Чувствительные сведения: секретов нет; видна сокращённая временная logical
  Worker identity.
* Размер: `1212 × 320`, `34669` байт.
* Контрольная сумма SHA-256:
  `344922b7a5264f40ba5cddab7472d786c39d77c13b2ab8a2cac6b6a2cc644970`.

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

## Исправленный live-сценарий MF-428.2

### Restart execution

Настоящий restart выполнен 12 августа 2026 года кнопкой `Stop` exact
регистрации на `chrome://serviceworker-internals/` в каждом browser-local scope:

* normal profile `b04b5959-28a2-4ac0-ba5c-6bdba29e0091`: logical Worker
  `45d8fde1-9ecb-4c83-b52a-095c974cb4a1`, execution
  `ed0e4a42-… → 40b71c0f-…`;
* incognito profile `b1726b3a-2267-4e7a-b11f-f642b1030a8a`: logical Worker
  `5df2f151-55ff-4e73-9f84-3b4798deb7e6`, execution
  `3a1ab9c8-… → 11e38947-…`.

Chrome автоматически поднял новое execution каждого зарегистрированного
Worker. Logical identity, registration и exact browser owner сохранились.

### `multi-profile-after-worker-restarts.png`

* Источник: exact normal Hamiltonian target после обоих restart, WebGPU canvas
  через `toDataURL("image/png")`.
* Ожидание и результат: две Chrome compound-ноды с разными profile ID; в каждой
  по две page realm и один logical Service Worker; root и дубликаты отсутствуют.
* Размер: `1470 × 2176` PNG.
* SHA-256:
  `3829a2886ffcb6c3207ef41dac2260e4029dd6dd5d102076061bf24f1484cc05`.

### Закрытие профиля и локализация

Первый live close подтвердил, что прежний host после уничтожения incognito
window удалял страницы, но оставлял browser root и Worker. После host-side
reachability fix retained snapshot стал чистым, однако видимая normal scene всё
ещё показывала пустой remote Chrome: page projection безусловно сохраняла
`browser-runtime` при snapshot replacement.

#### `stale-browser-root-after-host-close.png`

* Источник: exact normal target host version `mf-428-final`, CDP screenshot
  после события `browser-profile-unreachable` и чистого host snapshot.
* Наблюдение: Worker и страницы закрытого scope удалены, но сверху осталась
  пустая Chrome-нода. Это evidence второго, page-side projection defect, а не
  готового результата.
* Размер: `1470 × 2176` PNG.
* SHA-256:
  `1c7eb741cd27116de46ffdf703a1380df28d35f0cfe19f69bdb61a6b094f425c`.

### Финальная exact-target проверка закрытия

Hamiltonian host version `mf-428-projection-final` запущен из канонического
checkout поверх `c490c3d652390954e234cbf8aeda2c666b27cab2` и текущих изменений:

* normal profile `b04b5959-28a2-4ac0-ba5c-6bdba29e0091`, Worker
  `45d8fde1-9ecb-4c83-b52a-095c974cb4a1`, targets
  `6BC8156021218A05194924549E76BA0D` и
  `89DF5E715892B097D32A57018E70D9B2`;
* fresh incognito profile `90a10c48-7144-4372-a2dc-141da64fa765`, Worker
  `68c51f48-1f51-4c94-af0e-cf3590333b79`, targets
  `485F5C7E3635A724D29D9E0A81434CE0` и
  `73FAC4D99B7508297057100D084CE23B`.

Обе пары сошлись к двум окнам одного profile и одному Worker. После закрытия
exact incognito window `1285757389` host записал
`browser-profile-unreachable` для `browser:90a10c48-…`. Retained snapshot
revision `389` содержит только normal browser owner, один Worker, две page realm
и два Service Worker API transport; закрытый profile отсутствует целиком.
Normal target завершил обновление сцены с `hamiltonianLifecyclePending = 0` и
без causal gap; `1500` мс console observation вернула `0` записей.

#### `surviving-profile-after-close.png`

* Источник: `@meta/chrome` exact CDP screenshot target
  `89DF5E715892B097D32A57018E70D9B2` после завершённого layout.
* Ожидание и результат: ровно одна Chrome compound-нода `b04b5959-…`; внутри
  неё две page realm и один Service Worker. Пустого remote Chrome, root Worker,
  cross-profile нод и рёбер нет.
* Размер: `1470 × 2176` PNG.
* SHA-256:
  `6c69b65c384de4ebf163b4708a49fd74346a6ec810ffd0ac081c88f183c149fa`.
