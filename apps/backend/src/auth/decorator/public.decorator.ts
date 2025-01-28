import { SetMetadata } from '@nestjs/common';

export const PUBLIC_DECORATOR_KEY = 'public';
export const Public = (isPublic = true) => SetMetadata(PUBLIC_DECORATOR_KEY, isPublic);
