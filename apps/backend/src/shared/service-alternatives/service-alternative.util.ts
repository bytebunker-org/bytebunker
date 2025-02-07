import type { AbstractConstructable, Constructable } from '../../util/type/constructable.interface.js';
import { type InjectionToken, Logger, type ModuleMetadata } from '@nestjs/common';
import { ServiceAlternativesConfig } from './service-alternatives.config.js';
import { ModuleRef } from '@nestjs/core';

interface ServiceAlternativeOptions<Service> {
    abstractServiceClass: AbstractConstructable<Service>;

    injectionTokens?: InjectionToken<Service>[];

    providers: Constructable<Service>[];
}

function getInjectionTokenName(injectionToken: InjectionToken) {
    if (typeof injectionToken === 'string') {
        return injectionToken;
    } else if (typeof injectionToken === 'function' && injectionToken.name) {
        return injectionToken.name;
    }

    throw new Error(`Can't get injection token name for ${String(injectionToken)}`);
}

export function provideServiceAlternatives<Service>(
    options: ServiceAlternativeOptions<Service>,
): Required<Pick<ModuleMetadata, 'providers' | 'exports'>> {
    const logger = new Logger('ServiceAlternatives');

    const { abstractServiceClass, providers } = options;
    const injectionTokens = options.injectionTokens?.length ? options.injectionTokens : [abstractServiceClass];
    const hasAlternatives = providers.length > 1;

    if (!providers.length) {
        throw new Error(`No service implementations provided for ${getInjectionTokenName(abstractServiceClass)}`);
    }

    if (!hasAlternatives) {
        logger.log(
            `Providing service implementation ${getInjectionTokenName(providers[0])} for ${getInjectionTokenName(abstractServiceClass)}, no alternatives available`,
        );
    }
    return {
        providers: injectionTokens.map((injectionToken) =>
            hasAlternatives
                ? {
                      provide: injectionToken,
                      useFactory: (config: ServiceAlternativesConfig, moduleRef: ModuleRef) => {
                          const baseServiceInjectionTokenName = getInjectionTokenName(injectionToken);
                          const alternativeServiceInjectionTokenName = config[baseServiceInjectionTokenName];
                          const possibleProviderNames = providers.map((p) => getInjectionTokenName(p)).join(', ');

                          if (!alternativeServiceInjectionTokenName) {
                              throw new Error(
                                  `Alternative service config is incomplete, please provide an alternative service name for the "${baseServiceInjectionTokenName}". Possible implementations: ${possibleProviderNames}`,
                              );
                          }

                          const selectedImplementation = providers.find(
                              (p) => getInjectionTokenName(p) === alternativeServiceInjectionTokenName,
                          );

                          if (!selectedImplementation) {
                              throw new Error(
                                  `No service implementation with the name "${alternativeServiceInjectionTokenName}" exists for service "${baseServiceInjectionTokenName}". Possible implementations: ${possibleProviderNames}`,
                              );
                          }

                          logger.log(
                              `Providing service implementation ${selectedImplementation.name} for ${baseServiceInjectionTokenName}`,
                          );

                          return moduleRef.get(selectedImplementation);
                      },
                      inject: [ServiceAlternativesConfig, ModuleRef],
                  }
                : {
                      provide: injectionToken,
                      useClass: providers[0],
                  },
        ),
        exports: injectionTokens,
    };
}
