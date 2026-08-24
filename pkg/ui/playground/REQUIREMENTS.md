# Требования @ui/playground

`@ui/playground` владеет переиспользуемой dev-инфраструктурой catalog playground
и единым dev-каталогом семейства UI. Он не владеет production semantics UI
Components либо consumer.

## Законы

1. Pathname является иерархией каталогов. Mount пакета открывается как
   `/package/`, каждый непустой префикс story route является самостоятельным
   overview (`/package/component/`, затем `/package/component/section/`), а
   только полный путь открывает detail story. Overview показывает всех
   непосредственных детей текущего уровня; выбор ребёнка углубляет тот же
   pathname на один уровень. Общая typed declaration строит root, все префиксы
   и leaves из одних package-owned descriptors; consumer не выбирает hash/path
   mode или параллельную схему адресов.
2. Общий shell состоит из catalog, sections, preview, dock и info. Он является
   desktop-only рабочей средой, сохраняет historical five-panel geometry и
   занимает весь доступный canvas с небольшим внешним отступом; искусственный
   `maxWidth`/`maxHeight` не оставляет вокруг панелей пустую рамку.
3. Shell layout вычисляется FlexBox. CSS-style `%`/`fr`/`grow` является способом
   описания той же системы, а не отдельным layout.
4. Generic surfaces получают readonly descriptors и callbacks. Они не содержат
   Node/Field/Socket либо product switch.
5. Consumer preview является отдельной Surface; package не копирует и не
   адаптирует её renderer.
6. Server helper отключает HMR, собирает browser entry по запросу и не владеет
   persistent runtime process. HTML title равен exact package name; отдельного
   title override у consumer нет.
7. Playground package не входит production bundle consumer без его прямого
   import.
8. Navigation, dock и info владеют одним retained root и устойчивыми exact
   engine parents, keyed generic descriptor-ами. Изменение размера либо списка
   повторяет локальный FlexBox plan и reconciliate-ит parents; active, disabled,
   title, line и status state материализуют только изменённый owner. Transform
   выше чистого retained root сохраняет plan/materialization counters, child и
   geometry identity.
9. Retained materialization одного playground owner атомарна, а remove и
   dispose рекурсивно очищают его subtree. Диагностика dev-пакета хранит только
   текущие bounded owner keys и накопительные counters, не создаёт второй graph
   и не становится production dependency.
10. Статический backdrop остаётся осознанно flat: у него нет изменяемого
    descriptor state, независимого transform либо пользы от partial
    materialization. Consumer preview остаётся отдельной consumer-owned Surface
    и может иметь один retained parent без переноса consumer vocabulary в shell.
11. Navigation и dock хранят один детерминированный focus среди enabled item:
    pointer, Arrow Up/Down/Left/Right и Home/End меняют одно keyed состояние,
    Enter/Space вызывают текущий route callback. Видимое перемещение focus
    материализует только прежний и новый item owner; disabled item пропускается.
12. Масштабируемый catalog строится из package-owned typed story descriptors.
    Один descriptor связывает component identity, section, variant, args,
    production render, source generator, controls и optional interaction; route,
    поиск, preview, dock, копируемый код и render test не получают отдельных
    расходящихся описаний.
13. Catalog и sections поддерживают большой индекс через поиск, сворачиваемые
    группы и виртуализированное отображение. Initial bundle содержит metadata
    index; story implementation загружается lazy factory только после выбора.
    Точный production import contract принадлежит package owner, а не
    playground.
14. Preview всегда использует production UI на текущем Engine/UiRuntime. Dock
    показывает variants выбранной story. Правая панель постоянно показывает
    сгенерированный TypeScript и действие копирования; ниже неё располагаются
    controls и события, не скрывая код.
15. Все обращённые к человеку строки Workbench пишутся по-русски: навигация и
    поиск, описания preview, демонстрационные подписи, controls, events,
    состояния и статусы. Public API identifiers, import specifiers, route IDs и
    TypeScript-код сохраняют точное исходное написание; имена Blender и API
    остаются точными только там, где являются именем reference либо
    контракта, а не обычной подписью. Внешний Blender catalog используется
    только как reference при выборе собственных Elements, Components и Node UI;
    его ноды, assets и примеры не импортируются в playground.
16. Workbench сам следует глобальной Blender composition/form law: компактные
    editor headers, row navigation, thin separators и low-radius panels вместо
    oversized pill stacks и больших rounded islands. Five-panel semantic regions
    сохраняются, но их visible chrome не является исключением из UI shape law.
    Palette/material states следуют Blender 4.5.5 mapping; project font остаётся
    MetaFor.
17. Preview выбирает available size, позволяющий equal-scale сравнение control с
    local Blender reference. Он не растягивает input на большую часть desktop
    только ради заполнения центральной панели; свободное место остаётся рабочей
    областью editor, а не причиной менять форму control.
18. Workbench различает outer editor region border и focus outline, а panel
    header/body получают отдельные raw ThemeSpace roles даже при совпадающих
    default bytes. Keyboard focus не заменяет route selection или disclosure;
    accordion header/body не схлопываются в один локальный fill alias.
19. Source box использует общий scrollable `Pane`, а не обрезает массив строк.
    При переполнении по соответствующей оси появляются независимые vertical и
    horizontal scrollbar; wheel axis-lock, track click и thumb drag принадлежат
    общему `div` scroll primitive. Source update сохраняет допустимую позицию и
    клампит её к новым bounds, а title, copy, tabs и detail owners не
   материализуются из-за прокрутки кода.
20. Канонический адрес package overview и любого prefix overview оканчивается
    `/`, а exact detail leaf — нет. Входной адрес в противоположной форме может
    быть только совместимым redirect на канонический адрес. Неизвестный suffix
    не выбирает случайный fallback story: server и browser tooling отклоняют
    его fail-closed.
21. Семейство UI запускается одним Bun process на одном origin
    `http://127.0.0.1:4017`. Главная `/` перечисляет `@ui/elements`,
    `@ui/components`, `@ui/playground` и `@ui/hud`, объясняет ответственность
    пакета и содержание его dev-страницы. Package mounts — соответственно
    `/elements/`, `/components/`, `/playground/` и `/hud/`; отдельные
    package-серверы и порты не являются вторым способом запуска.
22. Один browser target этого origin переходит между package mounts. Каждая
    страница остаётся отдельным browser bundle и загружает только свой
    production graph; DOM page не получает WebGPU runtime, а WebGPU page создаёт
    ровно один `UiRuntime`. `$ui-dev` владеет одним selector `ui`, одним process
    и одним target, а package выбирается exact route.
