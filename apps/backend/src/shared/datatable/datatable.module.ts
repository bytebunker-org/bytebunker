import { Global, Module } from '@nestjs/common';
import { DatatableService } from './datatable.service.js';

@Global()
@Module({
    providers: [DatatableService],
    exports: [DatatableService],
})
export class DatatableModule {}
