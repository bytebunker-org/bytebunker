import { TypedConfigModule } from 'nest-typed-config';
import { AppConfig } from './app.config.js';
import { buildTypedConfigModuleOptions } from './config.util.js';

export const ConfigModule = TypedConfigModule.forRoot(buildTypedConfigModuleOptions(AppConfig));
