export type DtoToEntityType<DtoType extends object, RelationKeys extends keyof DtoType = never> = {
    [DtoProperty in keyof Omit<DtoType, RelationKeys>]: DtoType[DtoProperty];
};

// TODO: Fix this type to not ignore relations
/* & {
    [DtoProperty in keyof Pick<DtoType, RelationKeys>]-?: DtoType[DtoProperty] extends DtoRef<infer U>
        ? Ref<DtoToEntityType<U>>
        : DtoType[DtoProperty] extends DtoCollection<infer U>
          ? Collection<DtoToEntityType<U>>
          : DtoType[DtoProperty];
};*/
