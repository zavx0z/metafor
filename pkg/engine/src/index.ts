/**
 * # Пользовательский WebGPU-движок
 *
 * Исследование **унифицированного API для 3D-взаимодействий** на базе WebGPU.
 * В отличие от `three.js`, мы стремимся к созданию единой точки входа для управления сценой от первого лица.
 * Ключевая идея — класс {@link ViewPoint}, объединяющий камеру и управление.
 *
 * ## Архитектурное решение: Система координат (Z-up)
 * Используется **правосторонняя** система координат (RH), как в инженерном ПО и Blender:
 * * **+X** — вправо
 * * **+Y** — вглубь
 * * **+Z** — вверх
 * * **Clip Space** — глубина [0, 1] (WebGPU стандарт)
 *
 * ## Ключевые отличия от `three.js`
 *
 * | Функция | Наш движок | Three.js |
 * | :--- | :--- | :--- |
 * | **Архитектура Камеры** | Единый класс {@link ViewPoint} (камера + управление). | Раздельные `Camera` и `OrbitControls`. |
 * | **Рендеринг** | Только **WebGPU**. | WebGL 1/2 + WebGPU (beta). |
 * | **Координаты** | **RH_ZO (Z-up)**. | LH_YO (Y-up, OpenGL style). |
 * | **Материалы** | Базовые (Basic, Lambert). | PBR, Standard, Physical. |
 * | **Загрузчик** | `glTF` с авто-конвертацией осей. | Всевозможные форматы. |
 *
 * ## Быстрый старт
 * ```bash
 * # Установка
 * bun install
 *
 * # Запуск dev-сервера
 * bun run dev
 * ```
 *
 * @packageDocumentation
 */

export * from "./core/Object3D"
export * from "./core/BufferGeometry"
export * from "./geometries/PlaneGeometry"
export * from "./geometries/SphereGeometry"
export * from "./geometries/TorusGeometry"
export * from "./geometries/BoxGeometry"
export * from "./core/ViewPoint"
export * from "./core/Mesh"
export * from "./core/InstancedMesh"
export * from "./core/WireframeInstancedMesh"
export * from "./core/SkinnedMesh"
export * from "./renderer"
export * from "./scenes/Scene"
export * from "./loaders/GLTFLoader"
export * from "./materials"
export * from "./math/Color"
export * from "./helpers/GridHelper"
export * from "./lights/Light"
export * from "./text/TrueTypeFont"
export * from "./objects/Line"
export * from "./objects/LineSegments"
export * from "./objects/Text"
export * from "./materials/TextMaterial"
export * from "./animation"
export * from "./core/Raycaster"
export * from "./math/Ray"
export * from "./ui/UIDisplay"
