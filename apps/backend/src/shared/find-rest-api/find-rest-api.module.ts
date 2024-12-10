import { Global, Module } from '@nestjs/common';
import { FindRestApiService } from './find-rest-api.service.js';

@Global()
@Module({
    providers: [FindRestApiService],
    exports: [FindRestApiService],
})
export class FindRestApiModule {}
