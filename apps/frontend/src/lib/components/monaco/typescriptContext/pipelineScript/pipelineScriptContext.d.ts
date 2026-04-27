declare interface Logger {
	/**
	 * Write an 'error' level log.
	 */
	error(message: any, stack?: string, context?: string): void;

	error(message: any, ...optionalParams: [...any, string?, string?]): void;

	/**
	 * Write a 'log' level log.
	 */
	log(message: any, context?: string): void;

	log(message: any, ...optionalParams: [...any, string?]): void;

	/**
	 * Write a 'warn' level log.
	 */
	warn(message: any, context?: string): void;

	warn(message: any, ...optionalParams: [...any, string?]): void;

	/**
	 * Write a 'debug' level log.
	 */
	debug(message: any, context?: string): void;

	debug(message: any, ...optionalParams: [...any, string?]): void;

	/**
	 * Write a 'verbose' level log.
	 */
	verbose(message: any, context?: string): void;

	verbose(message: any, ...optionalParams: [...any, string?]): void;

	/**
	 * Write a 'fatal' level log.
	 */
	fatal(message: any, context?: string): void;

	fatal(message: any, ...optionalParams: [...any, string?]): void;
}

declare class EntityManager {}

declare class TimestampDto {
	createdAt: DateTime;
	updatedAt: DateTime;
}

type AssetTypeEnum = 'primary' | 'sidecar' | 'pipeline';

declare interface CommonMetadata {
	'Content-Type'?: string;

	'Original-File-Path'?: string;
}

declare class AssetDto extends TimestampDto {
	id: string;
	type: AssetTypeEnum;
	// hash: Buffer;
	originalFilename: string;
	mimeType: string;
	size?: number | null;
	storagePath?: string | null;
	externalUrl?: string | null;
	textAssetPreview?: string;
	metadata: CommonMetadata & Record<string, unknown>;
	publicUrl: string;
}

declare class CreateAssetDto {
	type: AssetTypeEnum;
	metadata: CommonMetadata & Record<string, unknown>;
	parentAssetId?: string;
	originalFilePath?: string;
	size?: number;
}

declare class AssetService {
	storeAsset(
		em: EntityManager,
		data: string,
		options: CreateAssetDto & {
			fullOriginalFilePath?: string;
		}
	): Promise<AssetDto>;

	getAssetString(em: EntityManager, assetOrId: AssetDto | string): Promise<string>;
}

declare interface ASObjectStableKeyCommonDataInterface {
	lat?: number;

	lng?: number;
}

declare interface ActivityStableKeyCommonDataInterface
	extends ASObjectStableKeyCommonDataInterface {
	start?: DateTime;

	end?: DateTime;
}

declare class ActivityDto implements ASObject {
	public '@type': ASObjectType;

	public '@secondaryTypes'?: ASObjectType[];

	public stableKeys?: string[];

	public actor: ObjectOrLink | ObjectOrLink[];
}

declare type ActivityDataType = ActivityDto & ASObject;

declare class ActivityStableKeyService {
	createActivityStableKey(
		primaryNodeType: ASObjectType,
		data: ActivityStableKeyCommonDataInterface & Record<string, unknown>,
		precisionOptions?: {
			locationPrecision?: number;
			dateTimePrecision?: DateTimeUnit;
		}
	): string;

	stabilizeLatitudeLongitude(
		latitudeOrLongitude: number,
		precisionOptions?: {
			locationPrecision?: number;
		}
	): string;

	stabilizeDateTime(
		dateTime: DateTime,
		precisionOptions?: {
			dateTimePrecision?: DateTimeUnit;
		}
	): string;

	createASObjectStableKey(
		primaryNodeType: ASObjectType,
		data: ASObjectStableKeyCommonDataInterface & Record<string, unknown>,
		precisionOptions?: {
			locationPrecision?: number;
		}
	): string;
}

declare class Node {
	get(value: 'id' | string): string;
}

declare class ActivityGraphService {
	getOwnerActor(em: EntityManager): Promise<Node>;
}

declare interface PipelineModuleExecutionContext<Input = Record<string, unknown>> {
	// em: EntityManager;
	// pipelineExecution: Loaded<PipelineExecutionEntity, 'blueprint' | 'executionData'>;
	// blueprint: Blueprint;
	// currentNode: BlueprintNodeDto;

	inputData: Input;

	em: EntityManager;

	logger: Logger;

	assetService: AssetService;
	activityStableKeyService: ActivityStableKeyService;
	activityGraphService: ActivityGraphService;

	generatorExtensionObject: ASObject;
	ownerActor: ASLink;

	/*DateTime: typeof DateTime;
	Interval: typeof Interval;
	Duration: typeof Duration;
	Zone: typeof Zone;*/
}
