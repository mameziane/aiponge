import { describe, it, expect } from 'vitest';
import { AlertEntity, Alert } from '../domains/monitoring/entities/Alert';
import { AlertRuleEntity, AlertRule } from '../domains/monitoring/entities/AlertRule';

describe('AlertEntity', () => {
  const mockAlert: Alert = {
    id: 'alert-123',
    serviceName: 'test-service',
    healthCheckId: 'check-456',
    severity: 'high',
    status: 'active',
    title: 'Test Alert',
    message: 'Test alert message',
    createdAt: new Date('2025-01-01T00:00:00Z'),
  };

  describe('constructor and getters', () => {
    it('should create alert entity with correct properties', () => {
      const entity = new AlertEntity(mockAlert);

      expect(entity.id).toBe('alert-123');
      expect(entity.serviceName).toBe('test-service');
      expect(entity.severity).toBe('high');
      expect(entity.status).toBe('active');
      expect(entity.title).toBe('Test Alert');
      expect(entity.message).toBe('Test alert message');
      expect(entity.createdAt).toEqual(new Date('2025-01-01T00:00:00Z'));
    });
  });

  describe('isActive', () => {
    it('should return true for active alerts', () => {
      const entity = new AlertEntity({ ...mockAlert, status: 'active' });
      expect(entity.isActive()).toBe(true);
    });

    it('should return false for non-active alerts', () => {
      const entity = new AlertEntity({ ...mockAlert, status: 'resolved' });
      expect(entity.isActive()).toBe(false);
    });
  });

  describe('isCritical', () => {
    it('should return true for critical alerts', () => {
      const entity = new AlertEntity({ ...mockAlert, severity: 'critical' });
      expect(entity.isCritical()).toBe(true);
    });

    it('should return false for non-critical alerts', () => {
      const entity = new AlertEntity({ ...mockAlert, severity: 'medium' });
      expect(entity.isCritical()).toBe(false);
    });
  });

  describe('shouldEscalate', () => {
    it('should return true when escalation time threshold is exceeded', () => {
      const createdAt = new Date(Date.now() - 20 * 60 * 1000); // 20 minutes ago
      const entity = new AlertEntity({ ...mockAlert, createdAt, status: 'active' });

      expect(entity.shouldEscalate(15)).toBe(true); // 15 minute threshold
    });

    it('should return false when escalation time threshold is not exceeded', () => {
      const createdAt = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      const entity = new AlertEntity({ ...mockAlert, createdAt, status: 'active' });

      expect(entity.shouldEscalate(15)).toBe(false); // 15 minute threshold
    });

    it('should return false for non-active alerts', () => {
      const createdAt = new Date(Date.now() - 20 * 60 * 1000);
      const entity = new AlertEntity({ ...mockAlert, createdAt, status: 'resolved' });

      expect(entity.shouldEscalate(15)).toBe(false);
    });

    it('should return false for already escalated alerts', () => {
      const createdAt = new Date(Date.now() - 20 * 60 * 1000);
      const escalatedAt = new Date(Date.now() - 5 * 60 * 1000);
      const entity = new AlertEntity({ ...mockAlert, createdAt, escalatedAt, status: 'active' });

      expect(entity.shouldEscalate(15)).toBe(false);
    });
  });

  describe('acknowledge', () => {
    it('should return acknowledged alert with timestamp', () => {
      const entity = new AlertEntity(mockAlert);
      const acknowledgedAlert = entity.acknowledge();

      expect(acknowledgedAlert.status).toBe('acknowledged');
      expect(acknowledgedAlert.acknowledgedAt).toBeInstanceOf(Date);
      expect(acknowledgedAlert.id).toBe(mockAlert.id);
    });
  });

  describe('resolve', () => {
    it('should return resolved alert with timestamp', () => {
      const entity = new AlertEntity(mockAlert);
      const resolvedAlert = entity.resolve();

      expect(resolvedAlert.status).toBe('resolved');
      expect(resolvedAlert.resolvedAt).toBeInstanceOf(Date);
      expect(resolvedAlert.id).toBe(mockAlert.id);
    });
  });

  describe('escalate', () => {
    it('should return escalated alert with timestamp', () => {
      const entity = new AlertEntity(mockAlert);
      const escalatedAlert = entity.escalate();

      expect(escalatedAlert.status).toBe('escalated');
      expect(escalatedAlert.escalatedAt).toBeInstanceOf(Date);
      expect(escalatedAlert.id).toBe(mockAlert.id);
    });
  });
});

describe('AlertRuleEntity', () => {
  const mockAlertRule: AlertRule = {
    id: 'rule-123',
    serviceName: 'test-service',
    checkType: 'http',
    condition: 'response_time',
    threshold: 5000,
    severity: 'high',
    isEnabled: true,
    cooldownMinutes: 5,
    escalationMinutes: 15,
    notificationChannels: ['channel-1', 'channel-2'],
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  };

  describe('constructor and getters', () => {
    it('should create alert rule entity with correct properties', () => {
      const entity = new AlertRuleEntity(mockAlertRule);

      expect(entity.id).toBe('rule-123');
      expect(entity.serviceName).toBe('test-service');
      expect(entity.condition).toBe('response_time');
      expect(entity.threshold).toBe(5000);
      expect(entity.severity).toBe('high');
      expect(entity.cooldownMinutes).toBe(5);
      expect(entity.escalationMinutes).toBe(15);
      expect(entity.notificationChannels).toEqual(['channel-1', 'channel-2']);
    });
  });

  describe('isEnabled', () => {
    it('should return true for enabled rules', () => {
      const entity = new AlertRuleEntity({ ...mockAlertRule, isEnabled: true });
      expect(entity.isEnabled()).toBe(true);
    });

    it('should return false for disabled rules', () => {
      const entity = new AlertRuleEntity({ ...mockAlertRule, isEnabled: false });
      expect(entity.isEnabled()).toBe(false);
    });
  });

  describe('shouldTrigger', () => {
    describe('response_time condition', () => {
      const rule = { ...mockAlertRule, condition: 'response_time' as const, threshold: 3000 };

      it('should trigger when response time exceeds threshold', () => {
        const entity = new AlertRuleEntity(rule);
        expect(entity.shouldTrigger(5000)).toBe(true);
      });

      it('should not trigger when response time is below threshold', () => {
        const entity = new AlertRuleEntity(rule);
        expect(entity.shouldTrigger(2000)).toBe(false);
      });
    });

    describe('consecutive_failures condition', () => {
      const rule = { ...mockAlertRule, condition: 'consecutive_failures' as const, threshold: 3 };

      it('should trigger when failures meet threshold', () => {
        const entity = new AlertRuleEntity(rule);
        expect(entity.shouldTrigger(3)).toBe(true);
      });

      it('should trigger when failures exceed threshold', () => {
        const entity = new AlertRuleEntity(rule);
        expect(entity.shouldTrigger(5)).toBe(true);
      });

      it('should not trigger when failures are below threshold', () => {
        const entity = new AlertRuleEntity(rule);
        expect(entity.shouldTrigger(2)).toBe(false);
      });
    });

    describe('success_rate condition', () => {
      const rule = { ...mockAlertRule, condition: 'success_rate' as const, threshold: 95 };

      it('should trigger when success rate is below threshold', () => {
        const entity = new AlertRuleEntity(rule);
        expect(entity.shouldTrigger(90)).toBe(true);
      });

      it('should not trigger when success rate meets threshold', () => {
        const entity = new AlertRuleEntity(rule);
        expect(entity.shouldTrigger(95)).toBe(false);
      });

      it('should not trigger when success rate exceeds threshold', () => {
        const entity = new AlertRuleEntity(rule);
        expect(entity.shouldTrigger(98)).toBe(false);
      });
    });

    describe('cooldown period', () => {
      it('should not trigger during cooldown period', () => {
        const rule = { ...mockAlertRule, cooldownMinutes: 10 };
        const entity = new AlertRuleEntity(rule);
        const lastAlertTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago

        expect(entity.shouldTrigger(10000, lastAlertTime)).toBe(false);
      });

      it('should trigger after cooldown period expires', () => {
        const rule = { ...mockAlertRule, cooldownMinutes: 10 };
        const entity = new AlertRuleEntity(rule);
        const lastAlertTime = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes ago

        expect(entity.shouldTrigger(10000, lastAlertTime)).toBe(true);
      });
    });

    it('should not trigger when rule is disabled', () => {
      const rule = { ...mockAlertRule, isEnabled: false };
      const entity = new AlertRuleEntity(rule);

      expect(entity.shouldTrigger(10000)).toBe(false);
    });
  });

  describe('generateAlert', () => {
    it('should generate alert with correct properties', () => {
      const entity = new AlertRuleEntity(mockAlertRule);
      const alert = entity.generateAlert('health-check-456', 6000, {
        endpoint: 'http://test.com/health',
        errorMessage: 'Connection timeout',
      });

      expect(alert.serviceName).toBe('test-service');
      expect(alert.healthCheckId).toBe('health-check-456');
      expect(alert.severity).toBe('high');
      expect(alert.status).toBe('active');
      expect(alert.title).toContain('HIGH: test-service response time is too high');
      expect(alert.message).toContain('Current value: 6000ms, Threshold: 5000ms');
      expect(alert.errorDetails).toBe('Connection timeout');
      expect(alert.metadata?.ruleId).toBe('rule-123');
      expect(alert.metadata?.actualValue).toBe(6000);
      expect(alert.createdAt).toBeInstanceOf(Date);
    });

    it('should generate appropriate title for different severities', () => {
      const criticalRule = { ...mockAlertRule, severity: 'critical' as const };
      const entity = new AlertRuleEntity(criticalRule);
      const alert = entity.generateAlert('health-check-456', 6000);

      expect(alert.title).toContain('CRITICAL:');
    });

    it('should include endpoint in message when provided', () => {
      const entity = new AlertRuleEntity(mockAlertRule);
      const alert = entity.generateAlert('health-check-456', 6000, {
        endpoint: 'http://api.test.com/health',
      });

      expect(alert.message).toContain('(Endpoint: http://api.test.com/health)');
    });
  });
});
