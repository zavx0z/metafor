import YogaService, { YogaLoadingState } from './YogaService';
import { Object3D } from '../core/Object3D';

type YogaNode = any;

export class LayoutManager {
    private yogaService: YogaService;
    private objectToNodeMap = new Map<Object3D, YogaNode>();

    constructor() {
        this.yogaService = YogaService.instance;
    }

    private get yoga() {
        return this.yogaService.yoga;
    }

    public update(rootObject: Object3D, containerWidth: number, containerHeight: number, scale: number = 0.01): void {
        if (this.yogaService.state !== YogaLoadingState.READY) return;
        
        const rootNode = this.buildYogaTree(rootObject);
        if (!rootNode) return;

        // Calculate Layout
        // Use DIRECTION_LTR constant or fallback to 1 (LTR)
        const direction = this.yoga.DIRECTION_LTR !== undefined ? this.yoga.DIRECTION_LTR : 1;
        rootNode.calculateLayout(containerWidth, containerHeight, direction);
        
        this.applyLayout(rootObject, rootNode, scale, true);
    }

    private buildYogaTree(object: Object3D): YogaNode {
        let yogaNode = this.objectToNodeMap.get(object);
        
        if (!yogaNode) {
            if (!this.yoga.Node) {
                return null;
            }
            
            if (typeof this.yoga.Node.create === 'function') {
                yogaNode = this.yoga.Node.create();
            } else {
                try {
                    // Fallback for versions where Node is a constructor
                    yogaNode = new this.yoga.Node();
                } catch (e) {
                    return null;
                }
            }
            
            this.objectToNodeMap.set(object, yogaNode);
        }

        if (object.layout) {
            const yoga = this.yoga;
            const l = object.layout;
            if (l.width !== undefined) yogaNode.setWidth(l.width);
            if (l.height !== undefined) yogaNode.setHeight(l.height);
            if (l.minWidth !== undefined) yogaNode.setMinWidth(l.minWidth);
            if (l.minHeight !== undefined) yogaNode.setMinHeight(l.minHeight);
            if (l.maxWidth !== undefined) yogaNode.setMaxWidth(l.maxWidth);
            if (l.maxHeight !== undefined) yogaNode.setMaxHeight(l.maxHeight);
            if (l.flex !== undefined) yogaNode.setFlex(l.flex);
            if (l.flexGrow !== undefined) yogaNode.setFlexGrow(l.flexGrow);
            if (l.flexShrink !== undefined) yogaNode.setFlexShrink(l.flexShrink);
            if (l.gap !== undefined && yogaNode.setGap !== undefined && yoga.GUTTER_ALL !== undefined) {
                yogaNode.setGap(yoga.GUTTER_ALL, l.gap);
            }

            if (l.flexDirection) {
               const dir = l.flexDirection;
               if (dir === 'row') yogaNode.setFlexDirection(yoga.FLEX_DIRECTION_ROW);
               if (dir === 'column') yogaNode.setFlexDirection(yoga.FLEX_DIRECTION_COLUMN);
               if (dir === 'row-reverse') yogaNode.setFlexDirection(yoga.FLEX_DIRECTION_ROW_REVERSE);
               if (dir === 'column-reverse') yogaNode.setFlexDirection(yoga.FLEX_DIRECTION_COLUMN_REVERSE);
            }

            if (l.justifyContent) {
               const justify = l.justifyContent;
               if (justify === 'flex-start') yogaNode.setJustifyContent(yoga.JUSTIFY_FLEX_START);
               if (justify === 'center') yogaNode.setJustifyContent(yoga.JUSTIFY_CENTER);
               if (justify === 'flex-end') yogaNode.setJustifyContent(yoga.JUSTIFY_FLEX_END);
               if (justify === 'space-between') yogaNode.setJustifyContent(yoga.JUSTIFY_SPACE_BETWEEN);
               if (justify === 'space-around') yogaNode.setJustifyContent(yoga.JUSTIFY_SPACE_AROUND);
               if (justify === 'space-evenly') yogaNode.setJustifyContent(yoga.JUSTIFY_SPACE_EVENLY);
            }

             if (l.alignItems) {
               const align = l.alignItems;
               if (align === 'flex-start') yogaNode.setAlignItems(yoga.ALIGN_FLEX_START);
               if (align === 'center') yogaNode.setAlignItems(yoga.ALIGN_CENTER);
               if (align === 'flex-end') yogaNode.setAlignItems(yoga.ALIGN_FLEX_END);
               if (align === 'stretch') yogaNode.setAlignItems(yoga.ALIGN_STRETCH);
               if (align === 'baseline') yogaNode.setAlignItems(yoga.ALIGN_BASELINE);
            }

            if (l.alignSelf) {
               const align = l.alignSelf;
               if (align === 'auto') yogaNode.setAlignSelf(yoga.ALIGN_AUTO);
               if (align === 'flex-start') yogaNode.setAlignSelf(yoga.ALIGN_FLEX_START);
               if (align === 'center') yogaNode.setAlignSelf(yoga.ALIGN_CENTER);
               if (align === 'flex-end') yogaNode.setAlignSelf(yoga.ALIGN_FLEX_END);
               if (align === 'stretch') yogaNode.setAlignSelf(yoga.ALIGN_STRETCH);
               if (align === 'baseline') yogaNode.setAlignSelf(yoga.ALIGN_BASELINE);
            }

            if (l.padding !== undefined) yogaNode.setPadding(yoga.EDGE_ALL, l.padding);
            if (l.paddingTop !== undefined) yogaNode.setPadding(yoga.EDGE_TOP, l.paddingTop);
            if (l.paddingBottom !== undefined) yogaNode.setPadding(yoga.EDGE_BOTTOM, l.paddingBottom);
            if (l.paddingLeft !== undefined) yogaNode.setPadding(yoga.EDGE_LEFT, l.paddingLeft);
            if (l.paddingRight !== undefined) yogaNode.setPadding(yoga.EDGE_RIGHT, l.paddingRight);
            if (l.margin !== undefined) yogaNode.setMargin(yoga.EDGE_ALL, l.margin);
            if (l.marginTop !== undefined) yogaNode.setMargin(yoga.EDGE_TOP, l.marginTop);
            if (l.marginBottom !== undefined) yogaNode.setMargin(yoga.EDGE_BOTTOM, l.marginBottom);
            if (l.marginLeft !== undefined) yogaNode.setMargin(yoga.EDGE_LEFT, l.marginLeft);
            if (l.marginRight !== undefined) yogaNode.setMargin(yoga.EDGE_RIGHT, l.marginRight);
        }

        // Reset children for the current frame to rebuild structure
        // Note: In a persistent object graph, this might be optimized by checking dirtiness,
        // but for now we ensure the Yoga tree matches the Object3D tree.
        while(yogaNode.getChildCount() > 0) {
            yogaNode.removeChild(yogaNode.getChild(0));
        }

        let childIndex = 0;
        for (const child of object.children) {
            if (child.layout) {
                const childYogaNode = this.buildYogaTree(child);
                if (childYogaNode) {
                    yogaNode.insertChild(childYogaNode, childIndex);
                    childIndex++;
                }
            }
        }

        return yogaNode;
    }

    private applyLayout(object: Object3D, yogaNode: YogaNode, scale: number, isRoot: boolean = false): void {
        const computedWidth = yogaNode.getComputedWidth();
        const computedHeight = yogaNode.getComputedHeight();
        // Expose computed dims (logical pixels) на Object3D — потребители
        // (карточки) могут читать this.computedLayout для размещения content'а.
        object.computedLayout = {
            left: yogaNode.getComputedLeft(),
            top: yogaNode.getComputedTop(),
            width: computedWidth,
            height: computedHeight,
        };
        if (!isRoot) {
            const left = yogaNode.getComputedLeft();
            const top = yogaNode.getComputedTop();

            // Convert 2D Layout coordinates (Top-Left 0,0, Y-down) to 3D (Center 0,0, Y-up)
            // We simply map Layout Top to negative Y in 3D.
            object.position.x = left * scale;
            object.position.y = -top * scale;
        }

        object.updateMatrix();
        let childIndex = 0;
        for (const child of object.children) {
             if (child.layout) {
                const childYogaNode = yogaNode.getChild(childIndex);
                if (childYogaNode) {
                    this.applyLayout(child, childYogaNode, scale, false);
                }
                childIndex++;
            }
        }
    }
}

export type ComputedLayout = {
    left: number
    top: number
    width: number
    height: number
}