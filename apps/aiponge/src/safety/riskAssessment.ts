import { apiRequest } from '../lib/axiosApiClient';
import { logger } from '../lib/logger';

export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface RiskAssessmentResult {
  level: RiskLevel;
  assessedAt: string;
}

export class RiskAssessmentService {
  static async assessRisk(text: string, userId?: string): Promise<RiskAssessmentResult> {
    try {
      const response = (await apiRequest('/api/v1/app/safety/assess-risk', {
        method: 'POST',
        data: {
          content: text,
          userId,
          sourceType: 'journal_entry',
          createFlag: false,
        },
      })) as { success?: boolean; data?: { detected?: boolean; matchedPatterns?: string[]; previewOnly?: boolean } };

      const detected = response?.data?.detected === true;

      return {
        level: detected ? 'medium' : 'none',
        assessedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('[RiskAssessment] Server assessment failed', { error });
      return {
        level: 'none',
        assessedAt: new Date().toISOString(),
      };
    }
  }
}
