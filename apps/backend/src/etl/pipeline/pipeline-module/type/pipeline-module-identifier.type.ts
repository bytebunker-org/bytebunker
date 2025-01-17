/**
 * Represents a module identifier.
 * The max length of an extension name and module name is 64 characters.
 * The max length of a module version is 5 characters (max value is 65535).
 * With the `:` and `@` characters, the total length is 135 characters.
 *
 * @example `my-extension:my-module@1`
 */
export type PipelineModuleIdentifier<
    ExtensionName extends string = string,
    ModuleName extends string = string,
    ModuleVersion extends number = number,
> = `${ExtensionName}:${ModuleName}@${ModuleVersion}`;

export interface DeconstructedPipelineModuleIdentifier {
    extensionName: string;

    moduleName: string;

    moduleVersion: number;
}
