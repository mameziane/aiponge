import { IAnalyticsRepository, UserActivityRecord } from '../../domains/repositories/IAnalyticsRepository';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('fraud-detection-service');

export interface FraudSignal {
  type: 'multi_account_ip' | 'rapid_actions' | 'impossible_travel' | 'suspicious_user_agent' | 'brute_force';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  evidence: Record<string, unknown>;
  detectedAt: Date;
}

export interface FraudAnalysisResult {
  userId: string;
  riskScore: number;
  signals: FraudSignal[];
  recommendation: 'allow' | 'monitor' | 'challenge' | 'block';
  analyzedAt: Date;
}

const SUSPICIOUS_USER_AGENTS = ['curl', 'wget', 'python-requests', 'httpclient', 'bot', 'crawler', 'scraper'];

export class FraudDetectionService {
  constructor(private readonly repository: IAnalyticsRepository) {}

  async analyzeUser(userId: string, lookbackHours: number = 24): Promise<FraudAnalysisResult> {
    const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
    const activities = await this.repository.getUserActivityByUserId(userId, since);

    const signals: FraudSignal[] = [];

    signals.push(...this.detectRapidActions(activities));
    signals.push(...this.detectSuspiciousUserAgents(activities));
    signals.push(...this.detectMultiIpAccess(activities));
    signals.push(...this.detectBruteForce(activities));

    const riskScore = this.calculateRiskScore(signals);
    const recommendation = this.getRecommendation(riskScore);

    const result: FraudAnalysisResult = {
      userId,
      riskScore,
      signals,
      recommendation,
      analyzedAt: new Date(),
    };

    if (signals.length > 0) {
      logger.info('Fraud analysis completed', {
        userId,
        riskScore,
        signalCount: signals.length,
        recommendation,
      });
    }

    return result;
  }

  async analyzeIp(
    ipAddress: string,
    lookbackHours: number = 24
  ): Promise<{
    ipAddress: string;
    distinctUsers: number;
    totalActions: number;
    signals: FraudSignal[];
    riskScore: number;
  }> {
    const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
    const activities = await this.repository.getUserActivityByIp(ipAddress, since);

    const signals: FraudSignal[] = [];
    const distinctUsers = new Set(activities.map(a => a.userId)).size;

    if (distinctUsers > 5) {
      signals.push({
        type: 'multi_account_ip',
        severity: distinctUsers > 20 ? 'critical' : distinctUsers > 10 ? 'high' : 'medium',
        description: `${distinctUsers} distinct users from same IP address`,
        evidence: { distinctUsers, ipAddress, activityCount: activities.length },
        detectedAt: new Date(),
      });
    }

    signals.push(...this.detectRapidActions(activities));

    return {
      ipAddress,
      distinctUsers,
      totalActions: activities.length,
      signals,
      riskScore: this.calculateRiskScore(signals),
    };
  }

  private detectRapidActions(activities: UserActivityRecord[]): FraudSignal[] {
    const signals: FraudSignal[] = [];
    if (activities.length < 2) return signals;

    const sorted = [...activities].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    let rapidCount = 0;
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].timestamp.getTime() - sorted[i - 1].timestamp.getTime();
      if (gap < 1000) rapidCount++;
    }

    if (rapidCount > 10) {
      signals.push({
        type: 'rapid_actions',
        severity: rapidCount > 50 ? 'critical' : rapidCount > 20 ? 'high' : 'medium',
        description: `${rapidCount} actions within 1 second gaps detected`,
        evidence: { rapidCount, totalActions: activities.length },
        detectedAt: new Date(),
      });
    }

    return signals;
  }

  private detectSuspiciousUserAgents(activities: UserActivityRecord[]): FraudSignal[] {
    const signals: FraudSignal[] = [];

    const suspiciousActivities = activities.filter(a => {
      if (!a.userAgent) return false;
      const ua = a.userAgent.toLowerCase();
      return SUSPICIOUS_USER_AGENTS.some(s => ua.includes(s));
    });

    if (suspiciousActivities.length > 0) {
      const agents = [...new Set(suspiciousActivities.map(a => a.userAgent))];
      signals.push({
        type: 'suspicious_user_agent',
        severity: suspiciousActivities.length > 20 ? 'high' : 'medium',
        description: `Suspicious user agents detected: ${agents.join(', ')}`,
        evidence: { agents, count: suspiciousActivities.length },
        detectedAt: new Date(),
      });
    }

    return signals;
  }

  private detectMultiIpAccess(activities: UserActivityRecord[]): FraudSignal[] {
    const signals: FraudSignal[] = [];

    const ips = new Set(activities.filter(a => a.ipAddress).map(a => a.ipAddress));
    if (ips.size > 10) {
      signals.push({
        type: 'impossible_travel',
        severity: ips.size > 30 ? 'critical' : 'high',
        description: `Activity from ${ips.size} distinct IP addresses`,
        evidence: { distinctIps: ips.size, sampleIps: [...ips].slice(0, 5) },
        detectedAt: new Date(),
      });
    }

    return signals;
  }

  private detectBruteForce(activities: UserActivityRecord[]): FraudSignal[] {
    const signals: FraudSignal[] = [];

    const failedLogins = activities.filter(a => a.action === 'login' && !a.success);
    if (failedLogins.length > 5) {
      signals.push({
        type: 'brute_force',
        severity: failedLogins.length > 20 ? 'critical' : failedLogins.length > 10 ? 'high' : 'medium',
        description: `${failedLogins.length} failed login attempts detected`,
        evidence: {
          failedAttempts: failedLogins.length,
          ips: [...new Set(failedLogins.filter(f => f.ipAddress).map(f => f.ipAddress))],
        },
        detectedAt: new Date(),
      });
    }

    return signals;
  }

  private calculateRiskScore(signals: FraudSignal[]): number {
    if (signals.length === 0) return 0;

    const severityWeights: Record<string, number> = {
      low: 10,
      medium: 25,
      high: 50,
      critical: 80,
    };

    const totalWeight = signals.reduce((sum, s) => sum + (severityWeights[s.severity] || 0), 0);
    return Math.min(100, totalWeight);
  }

  private getRecommendation(riskScore: number): 'allow' | 'monitor' | 'challenge' | 'block' {
    if (riskScore >= 80) return 'block';
    if (riskScore >= 50) return 'challenge';
    if (riskScore >= 25) return 'monitor';
    return 'allow';
  }
}
