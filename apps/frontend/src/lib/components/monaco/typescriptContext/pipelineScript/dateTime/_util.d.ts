declare type CanBeInvalid = true;

declare type DefaultValidity = CanBeInvalid extends true ? boolean : true;

declare type IfValid<
	ValidType,
	InvalidType,
	ThisIsValid extends boolean | undefined
> = ThisIsValid extends true
	? ValidType
	: ThisIsValid extends false
		? InvalidType
		: CanBeInvalid extends true
			? ValidType | InvalidType
			: ValidType;

declare type Valid = true;
declare type Invalid = false;
