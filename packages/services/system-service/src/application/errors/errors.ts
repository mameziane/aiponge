import { DomainError, DomainErrorCode, createDomainServiceError } from '@aiponge/platform-core';

const SystemDomainCodes = {
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  RESOURCE_LIMIT_EXCEEDED: 'RESOURCE_LIMIT_EXCEEDED',
  OPERATION_FAILED: 'OPERATION_FAILED',
  INITIALIZATION_FAILED: 'INITIALIZATION_FAILED',
} as const;

const SystemErrorCodes = { ...DomainErrorCode, ...SystemDomainCodes } as const;

const SystemErrorBase = createDomainServiceError('System', SystemErrorCodes);

export class SystemError extends SystemErrorBase {
  static configurationError(reason: string) {
    return new SystemError(`Configuration error: ${reason}`, 500, SystemErrorCodes.CONFIGURATION_ERROR);
  }

  static invalidStateTransition(fromState: string, toState: string) {
    return new SystemError(
      `Cannot transition from '${fromState}' to '${toState}'`,
      422,
      SystemErrorCodes.INVALID_STATE_TRANSITION
    );
  }

  static resourceLimitExceeded(resource: string, limit: number) {
    return new SystemError(
      `Resource limit exceeded for ${resource}: ${limit}`,
      429,
      SystemErrorCodes.RESOURCE_LIMIT_EXCEEDED
    );
  }

  static operationFailed(operation: string, reason: string, cause?: Error) {
    return new SystemError(`Operation '${operation}' failed: ${reason}`, 500, SystemErrorCodes.OPERATION_FAILED, cause);
  }

  static initializationFailed(component: string, reason: string, cause?: Error) {
    return new SystemError(
      `Initialization failed for ${component}: ${reason}`,
      500,
      SystemErrorCodes.INITIALIZATION_FAILED,
      cause
    );
  }
}

const SysConfigDomainCodes = {
  MISSING_REQUIRED: 'MISSING_REQUIRED',
  INVALID_VALUE: 'INVALID_VALUE',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  RATE_LIMIT_INVALID: 'RATE_LIMIT_INVALID',
  CIRCUIT_BREAKER_INVALID: 'CIRCUIT_BREAKER_INVALID',
  RESOURCE_INVALID: 'RESOURCE_INVALID',
} as const;

const SysConfigErrorCodes = { ...DomainErrorCode, ...SysConfigDomainCodes } as const;

const ConfigErrorBase = createDomainServiceError('Config', SysConfigErrorCodes);

export class ConfigError extends ConfigErrorBase {
  static missingRequired(field: string) {
    return new ConfigError(`Missing required configuration: ${field}`, 400, SysConfigErrorCodes.MISSING_REQUIRED);
  }

  static invalidValue(field: string, value: unknown, reason: string) {
    return new ConfigError(
      `Invalid value for ${field}: ${JSON.stringify(value)} - ${reason}`,
      400,
      SysConfigErrorCodes.INVALID_VALUE
    );
  }

  static invalidStateTransition(fromState: string, toState: string) {
    return new ConfigError(
      `Cannot transition from '${fromState}' to '${toState}'`,
      422,
      SysConfigErrorCodes.INVALID_STATE_TRANSITION
    );
  }

  static rateLimitInvalid(reason: string) {
    return new ConfigError(`Invalid rate limit configuration: ${reason}`, 400, SysConfigErrorCodes.RATE_LIMIT_INVALID);
  }

  static circuitBreakerInvalid(reason: string) {
    return new ConfigError(
      `Invalid circuit breaker configuration: ${reason}`,
      400,
      SysConfigErrorCodes.CIRCUIT_BREAKER_INVALID
    );
  }

  static resourceInvalid(resource: string, reason: string) {
    return new ConfigError(
      `Invalid resource configuration for ${resource}: ${reason}`,
      400,
      SysConfigErrorCodes.RESOURCE_INVALID
    );
  }
}

const MonitoringDomainCodes = {
  ALERT_NOT_FOUND: 'ALERT_NOT_FOUND',
  ALERT_RULE_NOT_FOUND: 'ALERT_RULE_NOT_FOUND',
  HEALTH_CHECK_FAILED: 'HEALTH_CHECK_FAILED',
  INVALID_HEALTH_STATUS: 'INVALID_HEALTH_STATUS',
  THRESHOLD_EXCEEDED: 'THRESHOLD_EXCEEDED',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
} as const;

const MonitoringErrorCodes = { ...DomainErrorCode, ...MonitoringDomainCodes } as const;

const MonitoringErrorBase = createDomainServiceError('Monitoring', MonitoringErrorCodes);

export class MonitoringError extends MonitoringErrorBase {
  static alertNotFound(alertId: string) {
    return new MonitoringError(`Alert not found: ${alertId}`, 404, MonitoringErrorCodes.ALERT_NOT_FOUND);
  }

  static alertRuleNotFound(ruleId: string) {
    return new MonitoringError(`Alert rule not found: ${ruleId}`, 404, MonitoringErrorCodes.ALERT_RULE_NOT_FOUND);
  }

  static healthCheckFailed(service: string, reason: string, cause?: Error) {
    return new MonitoringError(
      `Health check failed for ${service}: ${reason}`,
      503,
      MonitoringErrorCodes.HEALTH_CHECK_FAILED,
      cause
    );
  }

  static invalidHealthStatus(status: string) {
    return new MonitoringError(`Invalid health status: ${status}`, 400, MonitoringErrorCodes.INVALID_HEALTH_STATUS);
  }

  static thresholdExceeded(metric: string, value: number, threshold: number) {
    return new MonitoringError(
      `Threshold exceeded for ${metric}: ${value} > ${threshold}`,
      422,
      MonitoringErrorCodes.THRESHOLD_EXCEEDED
    );
  }

  static configurationError(reason: string) {
    return new MonitoringError(`Configuration error: ${reason}`, 500, MonitoringErrorCodes.CONFIGURATION_ERROR);
  }

  static timeout(operation: string, timeoutMs: number) {
    return new MonitoringError(
      `Operation '${operation}' timed out after ${timeoutMs}ms`,
      504,
      MonitoringErrorCodes.TIMEOUT
    );
  }
}

const NotificationDomainCodes = {
  PREFERENCE_NOT_FOUND: 'PREFERENCE_NOT_FOUND',
  TEMPLATE_NOT_FOUND: 'TEMPLATE_NOT_FOUND',
  INVALID_CHANNEL: 'INVALID_CHANNEL',
  DELIVERY_FAILED: 'DELIVERY_FAILED',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  INVALID_PRIORITY: 'INVALID_PRIORITY',
  INVALID_FREQUENCY: 'INVALID_FREQUENCY',
  INVALID_TIME: 'INVALID_TIME',
} as const;

const NotificationErrorCodes = { ...DomainErrorCode, ...NotificationDomainCodes } as const;

const NotificationErrorBase = createDomainServiceError('Notification', NotificationErrorCodes);

export class NotificationError extends NotificationErrorBase {
  static preferenceNotFound(userId: string) {
    return new NotificationError(
      `Notification preferences not found for user: ${userId}`,
      404,
      NotificationErrorCodes.PREFERENCE_NOT_FOUND
    );
  }

  static templateNotFound(templateId: string) {
    return new NotificationError(
      `Notification template not found: ${templateId}`,
      404,
      NotificationErrorCodes.TEMPLATE_NOT_FOUND
    );
  }

  static invalidChannel(channel: string) {
    return new NotificationError(
      `Invalid notification channel: ${channel}`,
      400,
      NotificationErrorCodes.INVALID_CHANNEL
    );
  }

  static deliveryFailed(channel: string, reason: string, cause?: Error) {
    return new NotificationError(
      `Notification delivery failed via ${channel}: ${reason}`,
      500,
      NotificationErrorCodes.DELIVERY_FAILED,
      cause
    );
  }

  static rateLimitExceeded(userId: string) {
    return new NotificationError(
      `Notification rate limit exceeded for user: ${userId}`,
      429,
      NotificationErrorCodes.RATE_LIMITED
    );
  }

  static providerUnavailable(provider: string) {
    return new NotificationError(
      `Notification provider unavailable: ${provider}`,
      503,
      NotificationErrorCodes.PROVIDER_UNAVAILABLE
    );
  }

  static invalidPriority(priority: string) {
    return new NotificationError(
      `Invalid notification priority: ${priority}`,
      400,
      NotificationErrorCodes.INVALID_PRIORITY
    );
  }

  static invalidFrequency(frequency: string) {
    return new NotificationError(
      `Invalid notification frequency: ${frequency}`,
      400,
      NotificationErrorCodes.INVALID_FREQUENCY
    );
  }

  static invalidTime(time: string, reason: string) {
    return new NotificationError(`Invalid time '${time}': ${reason}`, 400, NotificationErrorCodes.INVALID_TIME);
  }
}
