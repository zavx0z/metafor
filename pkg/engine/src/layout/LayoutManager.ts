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
            if (object.layout.width !== undefined) yogaNode.setWidth(object.layout.width);
            if (object.layout.height !== undefined) yogaNode.setHeight(object.layout.height);
            
            if (object.layout.flexDirection) {
               const dir = object.layout.flexDirection;
               if (dir === 'row') yogaNode.setFlexDirection(yoga.FLEX_DIRECTION_ROW);
               if (dir === 'column') yogaNode.setFlexDirection(yoga.FLEX_DIRECTION_COLUMN);
               if (dir === 'row-reverse') yogaNode.setFlexDirection(yoga.FLEX_DIRECTION_ROW_REVERSE);
               if (dir === 'column-reverse') yogaNode.setFlexDirection(yoga.FLEX_DIRECTION_COLUMN_REVERSE);
            }
            
            if (object.layout.justifyContent) {
               const justify = object.layout.justifyContent;
               if (justify === 'flex-start') yogaNode.setJustifyContent(yoga.JUSTIFY_FLEX_START);
               if (justify === 'center') yogaNode.setJustifyContent(yoga.JUSTIFY_CENTER);
               if (justify === 'flex-end') yogaNode.setJustifyContent(yoga.JUSTIFY_FLEX_END);
               if (justify === 'space-between') yogaNode.setJustifyContent(yoga.JUSTIFY_SPACE_BETWEEN);
               if (justify === 'space-around') yogaNode.setJustifyContent(yoga.JUSTIFY_SPACE_AROUND);
               if (justify === 'space-evenly') yogaNode.setJustifyContent(yoga.JUSTIFY_SPACE_EVENLY);
            }
            
             if (object.layout.alignItems) {
               const align = object.layout.alignItems;
               if (align === 'flex-start') yogaNode.setAlignItems(yoga.ALIGN_FLEX_START);
               if (align === 'center') yogaNode.setAlignItems(yoga.ALIGN_CENTER);
               if (align === 'flex-end') yogaNode.setAlignItems(yoga.ALIGN_FLEX_END);
               if (align === 'stretch') yogaNode.setAlignItems(yoga.ALIGN_STRETCH);
               if (align === 'baseline') yogaNode.setAlignItems(yoga.ALIGN_BASELINE);
            }

            if (object.layout.alignSelf) {
               const align = object.layout.alignSelf;
               if (align === 'auto') yogaNode.setAlignSelf(yoga.ALIGN_AUTO);
               if (align === 'flex-start') yogaNode.setAlignSelf(yoga.ALIGN_FLEX_START);
               if (align === 'center') yogaNode.setAlignSelf(yoga.ALIGN_CENTER);
               if (align === 'flex-end') yogaNode.setAlignSelf(yoga.ALIGN_FLEX_END);
               if (align === 'stretch') yogaNode.setAlignSelf(yoga.ALIGN_STRETCH);
               if (align === 'baseline') yogaNode.setAlignSelf(yoga.ALIGN_BASELINE);
            }
            
            if (object.layout.padding !== undefined) yogaNode.setPadding(yoga.EDGE_ALL, object.layout.padding);
            if (object.layout.margin !== undefined) yogaNode.setMargin(yoga.EDGE_ALL, object.layout.margin);
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