import type { BlueprintDataDto } from '../dto/blueprint-data.dto.js';
import { BlueprintNodeDto } from '../dto/blueprint-node.dto.js';
import { BlueprintEdgeDto } from '../dto/blueprint-edge.dto.js';
import { groupByKeySingle } from '../../../../util/util.js';
import type { PipelineModuleIdentifier } from '../../pipeline-module/type/pipeline-module-identifier.type.js';
import { PipelineModuleTypeEnum } from '../../pipeline-module/type/pipeline-module-type.enum.js';

export class Blueprint {
    private nodeIdCounter: number;
    private edgeIdCounter: number;

    private readonly nodes: Record<number, BlueprintNodeDto> = {};
    private readonly edges: Record<number, BlueprintEdgeDto> = {};

    constructor(data: BlueprintDataDto) {
        this.nodeIdCounter = Math.max(-1, ...data.nodes.map((n) => n.id)) + 1;
        this.edgeIdCounter = Math.max(-1, ...data.edges.map((n) => n.id)) + 1;

        this.nodes = groupByKeySingle(
            data.nodes.map((n) => new BlueprintNodeDto(n)),
            'id',
        );
        this.edges = groupByKeySingle(
            data.edges.map((e) => new BlueprintEdgeDto(e)),
            'id',
        );
    }

    public toDto(): BlueprintDataDto {
        return {
            nodes: Object.values(this.nodes),
            edges: Object.values(this.edges),
        };
    }

    public addNode(options: Pick<BlueprintNodeDto, 'moduleId'>): BlueprintNodeDto {
        const node = new BlueprintNodeDto({
            id: this.nodeIdCounter++,
            moduleId: options.moduleId,
            position: {
                x: 0,
                y: 0,
            },
        });

        this.nodes[node.id] = node;

        return node;
    }

    public addEdge(options: Omit<BlueprintEdgeDto, 'id'>): BlueprintEdgeDto {
        const edge = new BlueprintEdgeDto({
            id: this.edgeIdCounter++,
            ...options,
        });

        this.edges[edge.id] = edge;

        return edge;
    }

    public getNodes(): BlueprintNodeDto[] {
        return Object.values(this.nodes);
    }

    public getEdges(): BlueprintEdgeDto[] {
        return Object.values(this.edges);
    }

    public getNode(moduleIdentifier: PipelineModuleIdentifier): BlueprintNodeDto | undefined;
    public getNode(nodeId: number): BlueprintNodeDto | undefined;
    public getNode(nodeIdOrModuleIdentifier: number | PipelineModuleIdentifier): BlueprintNodeDto | undefined {
        if (typeof nodeIdOrModuleIdentifier === 'number') {
            return this.nodes[nodeIdOrModuleIdentifier];
        } else {
            const nodeList = Object.values(this.nodes);

            return nodeList.find((n) => n.moduleId === nodeIdOrModuleIdentifier);
        }
    }

    public getEdge(edgeId: number): BlueprintEdgeDto | undefined {
        return this.edges[edgeId];
    }

    public getEdgesAtNode(node: BlueprintNodeDto): BlueprintEdgeDto[];
    public getEdgesAtNode(nodeId: number): BlueprintEdgeDto[];
    public getEdgesAtNode(nodeOrId: BlueprintNodeDto | number): BlueprintEdgeDto[] {
        const nodeId = typeof nodeOrId === 'object' ? nodeOrId.id : nodeOrId;

        return Object.values(this.edges).filter((c) => c.source === nodeId || c.target === nodeId);
    }

    public getInputEdgesAtNode(node: BlueprintNodeDto, inputHandleName?: string): BlueprintEdgeDto[];
    public getInputEdgesAtNode(nodeId: number, inputHandleName?: string): BlueprintEdgeDto[];
    public getInputEdgesAtNode(nodeOrId: BlueprintNodeDto | number, inputHandleName?: string): BlueprintEdgeDto[] {
        const nodeId = typeof nodeOrId === 'object' ? nodeOrId.id : nodeOrId;

        return Object.values(this.edges).filter(
            (c) => c.target === nodeId && (!inputHandleName || c.targetHandle === inputHandleName),
        );
    }

    public getOutputEdgesAtNode(node: BlueprintNodeDto, outputHandleName?: string): BlueprintEdgeDto[];
    public getOutputEdgesAtNode(nodeId: number, outputHandleName?: string): BlueprintEdgeDto[];
    public getOutputEdgesAtNode(nodeOrId: BlueprintNodeDto | number, outputHandleName?: string): BlueprintEdgeDto[] {
        const nodeId = typeof nodeOrId === 'object' ? nodeOrId.id : nodeOrId;

        return Object.values(this.edges).filter(
            (c) => c.source === nodeId && (!outputHandleName || c.sourceHandle === outputHandleName),
        );
    }

    public getOutputEdgesAtNodeRecursive(node: BlueprintNodeDto, firstTargetHandleName?: string): BlueprintEdgeDto[];
    public getOutputEdgesAtNodeRecursive(nodeId: number, firstTargetHandleName?: string): BlueprintEdgeDto[];
    public getOutputEdgesAtNodeRecursive(
        nodeOrId: BlueprintNodeDto | number,
        firstTargetHandleName?: string,
    ): BlueprintEdgeDto[] {
        const nodeId = typeof nodeOrId === 'object' ? nodeOrId.id : nodeOrId;

        const currentEdges = this.getOutputEdgesAtNode(nodeId, firstTargetHandleName);
        const edgeArray = [...currentEdges];

        for (const edge of currentEdges) {
            edgeArray.push(...this.getOutputEdgesAtNodeRecursive(edge.target));
        }

        return edgeArray;
    }

    public getDependantNodesRecursive(node: BlueprintNodeDto, firstOutputHandleName?: string): BlueprintNodeDto[];
    public getDependantNodesRecursive(nodeId: number, firstOutputHandleName?: string): BlueprintNodeDto[];
    public getDependantNodesRecursive(
        nodeOrId: BlueprintNodeDto | number,
        firstOutputHandleName?: string,
    ): BlueprintNodeDto[] {
        const nodeId = typeof nodeOrId === 'object' ? nodeOrId.id : nodeOrId;

        const edgeArray = this.getOutputEdgesAtNodeRecursive(nodeId, firstOutputHandleName);
        const nodeIdArray = [...new Set(edgeArray.map((e) => e.target))];

        return nodeIdArray.map((id) => this.getNode(id)!);
    }
}
