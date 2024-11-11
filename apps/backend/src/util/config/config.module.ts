import { dotenvLoader, fileLoader, TypedConfigModule } from 'nest-typed-config';
import { AppConfig } from './app.config.js';
import { normalizeConfig } from './config.util.js';
import { misc } from 'typia';

export const ConfigModule = TypedConfigModule.forRoot({
    isGlobal: true,
    schema: AppConfig,
    load: [
        fileLoader({
            ignoreEnvironmentVariableSubstitution: false,
        }),
        dotenvLoader({
            separator: '__',
        }),
    ],
    normalize: (config) => normalizeConfig(AppConfig, config),
    validate: (config) => {
        const validationResult = misc.validatePrune<AppConfig>(config as AppConfig);

        if (!validationResult.success) {
            throw new Error(
                'Config validation failed, problems:\n' +
                    validationResult.errors
                        .map(
                            (error) =>
                                `- Invalid type on ${error.path}, expected to be of type "${error.expected}", got "${error.value}"`,
                        )
                        .join('\n'),
            );
        }

        return validationResult.data;
    },
});
