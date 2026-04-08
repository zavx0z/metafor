# Подзадача 5: Базовые UI-компоненты (Panel, Button, Image)

## 📁 Затронутые файлы

- `src/ui/UIPanel.ts` (новый)
- `src/ui/UIButton.ts` (новый)
- `src/ui/UIImage.ts` (новый)
- `src/materials/UIPanelMaterial.ts` (новый)
- `src/materials/ImageMaterial.ts` (новый)
- `src/renderer/index.ts` (добавление поддержки текстур)
- `src/loaders/TextureLoader.ts` (новый)

## 🎯 Цель

Создать набор базовых UI-компонентов для построения интерфейсов.

## 📋 Что сделать

### Шаг 1: Создать материал для обычных панелей

`src/materials/UIPanelMaterial.ts`:

```typescript
import { Material, MaterialParameters } from "./Material";
import { Color } from "../math/Color";

export interface UIPanelMaterialParameters extends MaterialParameters {
    backgroundColor?: Color;
    borderColor?: Color;
    borderWidth?: number;
    borderRadius?: number; // Для будущей реализации закругленных углов
}

export class UIPanelMaterial extends Material {
    public readonly isUIPanelMaterial: true = true;
    public backgroundColor: Color;
    public borderColor: Color;
    public borderWidth: number;
    
    constructor(parameters: UIPanelMaterialParameters = {}) {
        super(parameters);
        this.backgroundColor = parameters.backgroundColor ?? new Color(0.2, 0.2, 0.2, 0.8);
        this.borderColor = parameters.borderColor ?? new Color(0.5, 0.5, 0.5, 1.0);
        this.borderWidth = parameters.borderWidth ?? 2;
        this.transparent = true;
    }
}
```

### Шаг 2: Создать компонент UIPanel

`src/ui/UIPanel.ts`:

```typescript
import { Object3D } from "../core/Object3D";
import { Mesh } from "../core/Mesh";
import { PlaneGeometry } from "../geometries/PlaneGeometry";
import { UIPanelMaterial } from "../materials/UIPanelMaterial";
import { LayoutProps } from "../layout/LayoutTypes";

export interface UIPanelOptions {
    layout: LayoutProps;
    backgroundColor?: Color;
    borderColor?: Color;
    borderWidth?: number;
}

export class UIPanel extends Object3D {
    public layout: LayoutProps;
    private mesh: Mesh;
    private material: UIPanelMaterial;
    
    constructor(options: UIPanelOptions) {
        super();
        this.name = 'UIPanel';
        this.layout = options.layout;
        
        const geometry = new PlaneGeometry({ width: 1, height: 1 });
        this.material = new UIPanelMaterial({
            backgroundColor: options.backgroundColor,
            borderColor: options.borderColor,
            borderWidth: options.borderWidth
        });
        
        this.mesh = new Mesh(geometry, this.material);
        this.add(this.mesh);
    }
    
    public setBackgroundColor(color: Color): void {
        this.material.backgroundColor = color;
        this.material.needsUpdate = true;
    }
}
```

### Шаг 3: Создать материал для изображений

`src/materials/ImageMaterial.ts`:

```typescript
import { Material, MaterialParameters } from "./Material";

export interface ImageMaterialParameters extends MaterialParameters {
    texture?: GPUTexture;
}

export class ImageMaterial extends Material {
    public readonly isImageMaterial: true = true;
    public texture?: GPUTexture;
    
    constructor(parameters: ImageMaterialParameters = {}) {
        super(parameters);
        this.texture = parameters.texture;
    }
}
```

### Шаг 4: Создать загрузчик текстур

`src/loaders/TextureLoader.ts`:

```typescript
export class TextureLoader {
    public static async fromUrl(url: string, device: GPUDevice): Promise<GPUTexture> {
        const response = await fetch(url);
        const blob = await response.blob();
        const imageBitmap = await createImageBitmap(blob);
        
        const texture = device.createTexture({
            size: [imageBitmap.width, imageBitmap.height],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | 
                   GPUTextureUsage.COPY_DST |
                   GPUTextureUsage.RENDER_ATTACHMENT
        });
        
        device.queue.copyExternalImageToTexture(
            { source: imageBitmap },
            { texture: texture },
            [imageBitmap.width, imageBitmap.height]
        );
        
        return texture;
    }
}
```

### Шаг 5: Создать компонент Image

`src/ui/UIImage.ts`:

```typescript
import { Object3D } from "../core/Object3D";
import { Mesh } from "../core/Mesh";
import { PlaneGeometry } from "../geometries/PlaneGeometry";
import { ImageMaterial } from "../materials/ImageMaterial";
import { LayoutProps } from "../layout/LayoutTypes";
import { TextureLoader } from "../loaders/TextureLoader";

export interface UIImageOptions {
    layout: LayoutProps;
    src: string;
}

export class UIImage extends Object3D {
    public layout: LayoutProps;
    private mesh: Mesh;
    private material: ImageMaterial;
    
    constructor(options: UIImageOptions) {
        super();
        this.name = 'UIImage';
        this.layout = options.layout;
        
        const geometry = new PlaneGeometry({ width: 1, height: 1 });
        this.material = new ImageMaterial();
        
        this.mesh = new Mesh(geometry, this.material);
        this.add(this.mesh);
        
        // Асинхронная загрузка текстуры
        this.loadTexture(options.src);
    }
    
    private async loadTexture(src: string): Promise<void> {
        // Нужно получить device из рендерера - это требует рефакторинга
        // Пока оставляем как TODO
        console.warn('Texture loading not implemented yet');
    }
}
```

### Шаг 6: Создать компонент Button

`src/ui/UIButton.ts`:

```typescript
import { Object3D } from "../core/Object3D";
import { Mesh } from "../core/Mesh";
import { PlaneGeometry } from "../geometries/PlaneGeometry";
import { UIPanelMaterial } from "../materials/UIPanelMaterial";
import { Text } from "../text/Text";
import { LayoutProps } from "../layout/LayoutTypes";

export interface UIButtonOptions {
    layout: LayoutProps;
    text: string;
    backgroundColor?: Color;
    hoverColor?: Color;
    onClick?: () => void;
}

export class UIButton extends Object3D {
    public layout: LayoutProps;
    private mesh: Mesh;
    private material: UIPanelMaterial;
    private textObject: Text;
    private onClick?: () => void;
    private isHovered: boolean = false;
    
    constructor(options: UIButtonOptions) {
        super();
        this.name = 'UIButton';
        this.layout = options.layout;
        this.onClick = options.onClick;
        
        const geometry = new PlaneGeometry({ width: 1, height: 1 });
        this.material = new UIPanelMaterial({
            backgroundColor: options.backgroundColor || new Color(0.3, 0.3, 0.3, 0.9),
            borderColor: new Color(0.5, 0.5, 0.5, 1.0),
            borderWidth: 2
        });
        
        this.mesh = new Mesh(geometry, this.material);
        this.add(this.mesh);
        
        // Создаем текст (пока без реального шрифта)
        // this.textObject = new Text(...);
        // this.add(this.textObject);
        
        // TODO: Добавить обработку событий мыши через Raycaster
    }
    
    public setHovered(hovered: boolean): void {
        if (this.isHovered !== hovered) {
            this.isHovered = hovered;
            // Изменяем цвет материала при наведении
            if (hovered) {
                this.material.backgroundColor = new Color(0.4, 0.4, 0.4, 0.9);
            } else {
                this.material.backgroundColor = new Color(0.3, 0.3, 0.3, 0.9);
            }
            this.material.needsUpdate = true;
        }
    }
}
```

## ✅ Ожидаемый результат

1. Три базовых UI-компонента: Panel, Button, Image
2. Панели с настраиваемыми цветами фона и границами
3. Кнопки с состоянием наведения (hover)
4. Изображения с асинхронной загрузкой текстур
5. Все компоненты работают с системой верстки

## 🧪 Тестовый сценарий

```typescript
// Создание панели с кнопкой и изображением
const panel = new UIPanel({
    layout: { width: 300, height: 200, padding: 20 }
});

const button = new UIButton({
    layout: { width: 100, height: 40, margin: 10 },
    text: 'Click me',
    onClick: () => console.log('Clicked!')
});

const image = new UIImage({
    layout: { width: 64, height: 64 },
    src: 'icon.png'
});

panel.add(button);
panel.add(image);
display.addUI(panel);
```

## 🔧 Зависимости

- Система верстки должна быть рабочей
- Для Image необходим доступ к device из рендерера
- Для Button нужен Raycaster для обработки событий мыши
