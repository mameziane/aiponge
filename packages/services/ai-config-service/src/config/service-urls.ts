/**
 * Service URL Configuration for ai-config-service
 * Thin wrapper around platform-core's consolidated factory.
 */

import { createServiceUrlsConfig } from '@aiponge/platform-core';
import type { HttpClient, HttpResponse } from '@aiponge/platform-core';
import type * as winston from 'winston';
import { ServiceRegistry, hasService, waitForService, listServices } from '@aiponge/platform-core';

export type Logger = winston.Logger;

const config = createServiceUrlsConfig('ai-config-service');

export const SERVICE_URLS = config.SERVICE_URLS;
export const SERVICE_PORTS = config.SERVICE_PORTS;
export const { getServiceUrl, getServicePort, getOwnPort, createServiceHttpClient, createServiceClient, getHttpConfig } = config;
export type { HttpClient, HttpResponse };
export type HttpClientType = Parameters<typeof config.createServiceHttpClient>[0];
export type HttpClientConfig = ReturnType<typeof config.getHttpConfig>;

export { createLogger as getLogger } from '@aiponge/platform-core';
export { ServiceRegistry, hasService, waitForService, listServices };
