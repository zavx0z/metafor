# Подзадача 2: Offscreen-текстуры и расширение рендерера

## 📁 Затронутые файлы

- `src/renderer/index.ts` (расширение класса Renderer)
- `src/core/Scene.ts` (опционально, для фона сцены)

## 🎯 Цель

Подготовить рендерер для многопроходного рендеринга: создать offscreen-текстуры для рендеринга сцены и размытия.

## 📋 Что сделать

### Шаг 1: Добавить свойства в класс Renderer

В `src/renderer/index.ts` добавить:

```typescript
class Renderer {
    // Существующие свойства...
    private offscreenTexture: GPUTexture;
    private blurredIntermediateTexture: GPUTexture;
    private finalBlurredTexture: GPUTexture;
    private offscreenDepthTexture: GPUTexture;
    
    // Для отслеживания изменений размера
    private lastCanvasWidth: number = 0;
    private lastCanvasHeight: number = 0;
}
```

### Шаг 2: Обновить метод init

Настроить контекст с прозрачностью:

```typescript
public async init(canvas?: HTMLCanvasElement): Promise<void> {
    // ... существующий код до конфигурации context ...
    
    this.context.configure({
        device: this.device,
        format: this.presentationFormat,
        alphaMode: 'premultiplied', // Важно для прозрачности
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    
    // ... остальной код ...
}
```

### Шаг 3: Создать метод для управления текстурами

Добавить приватный метод `updateOffscreenTextures()`:

```typescript
private updateOffscreenTextures(): void {
    const width = this.canvas.width;
    const height = this.canvas.height;
    
    // Проверяем, изменился ли размер
    if (width === this.lastCanvasWidth && height === this.lastCanvasHeight) {
        return;
    }
    
    this.lastCanvasWidth = width;
    this.lastCanvasHeight = height;
    
    const textureUsage = GPUTextureUsage.RENDER_ATTACHMENT | 
                         GPUTextureUsage.TEXTURE_BINDING | 
                         GPUTextureUsage.STORAGE_BINDING |
                         GPUTextureUsage.COPY_SRC;
    
    // Освобождаем старые текстуры
    this.offscreenTexture?.destroy();
    this.blurredIntermediateTexture?.destroy();
    this.finalBlurredTexture?.destroy();
    this.offscreenDepthTexture?.destroy();
    
    const textureDescriptor: GPUTextureDescriptor = {
        size: [width, height],
        format: this.presentationFormat,
        usage: textureUsage,
    };
    
    // Создаем текстуры для offscreen-рендеринга
    this.offscreenTexture = this.device.createTexture(textureDescriptor);
    this.blurredIntermediateTexture = this.device.createTexture({
        ...textureDescriptor,
        format: 'rgba8unorm', // Формат для compute-шейдеров
    });
    this.finalBlurredTexture = this.device.createTexture({
        ...textureDescriptor,
        format: 'rgba8unorm',
    });
    
    // Текстура глубины для offscreen-пасса
    this.offscreenDepthTexture = this.device.createTexture({
        size: [width, height],
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
}
```

### Шаг 4: Интегрировать в основной цикл рендеринга

В начале метода `render()` вызывать обновление текстур:

```typescript
public render(scene: Scene, viewPoint: ViewPoint): void {
    this.updateTextures(); // Существующий метод
    this.updateOffscreenTextures(); // Новый метод
    
    // ... остальной код рендеринга ...
}
```

### Шаг 5: Создать утилиту для фильтрации объектов

Добавить вспомогательный метод для разделения объектов сцены:

```typescript
private collectSceneObjectsByType(
    scene: Scene, 
    camera: Camera
): { glassObjects: RenderItem[], regularObjects: RenderItem[], uiObjects: RenderItem[] } {
    const allObjects = this.collectSceneObjects(scene, [], [], this.frustum);
    
    return {
        glassObjects: allObjects.filter(item => item.object.material?.isGlassMaterial === true),
        regularObjects: allObjects.filter(item => 
            !item.object.material?.isGlassMaterial && 
            !(item.object instanceof UIDisplay || item.object.findParentByType(UIDisplay))
        ),
        uiObjects: allObjects.filter(item => 
            item.object instanceof UIDisplay || item.object.findParentByType(UIDisplay)
        )
    };
}
```

## ✅ Ожидаемый результат

1. Рендерер создает и управляет offscreen-текстурами
2. При изменении размера canvas текстуры пересоздаются
3. Текстуры имеют правильные флаги использования для compute-шейдеров
4. Объекты сцены корректно разделяются по типам для разных пассов рендеринга

## 📊 Требования к ресурсам

- Память GPU: 3 текстуры размером с экран (формат RGBA8) + 1 текстура глубины
- Производительность: метод `updateOffscreenTextures()` вызывается только при ресайзе

## 🔧 Зависимости

- WebGPU API должен поддерживать флаги `STORAGE_BINDING` и `COPY_SRC`
- Необходимо наличие метода `collectSceneObjects` в рендерере
