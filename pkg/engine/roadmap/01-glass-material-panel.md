# Подзадача 1: Материал GlassMaterial и компонент GlassPanel

## 📁 Затронутые файлы

- `src/materials/GlassMaterial.ts` (новый)
- `src/ui/GlassPanel.ts` (новый)
- `src/materials/Material.ts` (изменение базового класса)
- `src/renderer/index.ts` (добавление проверки типа в рендерер)

## 🎯 Цель

Создать маркерный материал для идентификации "стеклянных" объектов и компонент-обертку для удобного использования.

## 📋 Что сделать

### Шаг 1: Расширить базовый класс Material

Добавить в `Material.ts` проверочное свойство `isGlassMaterial` (по аналогии с другими материалами):

```typescript
abstract class Material {
  // ... существующий код ...
  public readonly isGlassMaterial?: boolean = false;
}
```

### Шаг 2: Создать GlassMaterial

Новый файл `src/materials/GlassMaterial.ts`:

```typescript
import { Material, MaterialParameters } from "./Material";
import { Color } from "../math/Color";

export interface GlassMaterialParameters extends MaterialParameters {
    tintColor?: Color;
}

export class GlassMaterial extends Material {
    public readonly isGlassMaterial: true = true;
    public tintColor: Color;

    constructor(parameters: GlassMaterialParameters = {}) {
        super(parameters);
        this.tintColor = parameters.tintColor ?? new Color(0.1, 0.1, 0.1, 0.2);
        this.transparent = true;
    }
}
```

### Шаг 3: Создать GlassPanel

Новый файл `src/ui/GlassPanel.ts`:

```typescript
import { Object3D } from "../core/Object3D";
import { Mesh } from "../core/Mesh";
import { PlaneGeometry } from "../geometries/PlaneGeometry";
import { GlassMaterial } from "../materials/GlassMaterial";
import { LayoutProps } from "../layout/LayoutTypes";

export class GlassPanel extends Object3D {
    public layout: LayoutProps;
    private mesh: Mesh;

    constructor(layoutProps: LayoutProps) {
        super();
        this.name = 'GlassPanel';
        this.layout = layoutProps;

        const geometry = new PlaneGeometry({ width: 1, height: 1 });
        const material = new GlassMaterial();
        this.mesh = new Mesh(geometry, material);
        this.add(this.mesh);
    }
}
```

### Шаг 4: Обновить рендерер

В `src/renderer/index.ts` в методе `render` добавить фильтрацию по типу материала:

```typescript
// В цикле сбора объектов:
const glassObjects = collectedObjects.filter(item => item.object.material?.isGlassMaterial === true);
const otherObjects = collectedObjects.filter(item => item.object.material?.isGlassMaterial !== true);
```

## ✅ Ожидаемый результат

1. Можно создать стеклянную панель: `new GlassPanel({ width: 100, height: 50 })`
2. Материал корректно идентифицируется в рендерере
3. Панель участвует в верстке через свойство `layout`
4. Материал по умолчанию полупрозрачный с легким тонированием

## 🧪 Тестовый сценарий

```typescript
// Создание стеклянной панели
const glassPanel = new GlassPanel({
    width: 200,
    height: 100,
    margin: 20,
    alignSelf: 'center'
});

display.addUI(glassPanel);
```

## 🔧 Зависимости

- Базовый класс Material должен поддерживать свойство `isGlassMaterial`
- Рендерер должен быть готов к фильтрации объектов по типу материала
