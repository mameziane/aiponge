/**
 * Crisis Resources Configuration
 * Shared between frontend and backend for consistency
 *
 * These resources are displayed when risk assessment indicates
 * a user may be in crisis or experiencing distress.
 */

export interface CrisisResource {
  name: string;
  phone?: string;
  url?: string;
  description?: string;
  textLine?: string;
  available?: string;
}

export interface CrisisResourcesByRegion {
  [region: string]: CrisisResource;
}

export const CRISIS_RESOURCES: CrisisResourcesByRegion = {
  global: {
    name: 'International Association for Suicide Prevention',
    url: 'https://www.iasp.info/resources/Crisis_Centres/',
    description: 'Find a crisis center in your country',
  },
  us: {
    name: '988 Suicide & Crisis Lifeline',
    phone: '988',
    url: 'https://988lifeline.org/',
    description: '24/7 free and confidential support',
    textLine: 'Text 988',
    available: '24/7',
  },
  uk: {
    name: 'Samaritans',
    phone: '116 123',
    url: 'https://www.samaritans.org/',
    description: 'Free 24-hour helpline',
    available: '24/7',
  },
  ca: {
    name: 'Crisis Services Canada',
    phone: '1-833-456-4566',
    url: 'https://www.crisisservicescanada.ca/',
    description: '24/7 crisis support',
    textLine: 'Text 45645',
    available: '24/7',
  },
  au: {
    name: 'Lifeline Australia',
    phone: '13 11 14',
    url: 'https://www.lifeline.org.au/',
    description: '24/7 crisis support and suicide prevention',
    textLine: 'Text 0477 13 11 14',
    available: '24/7',
  },
  nz: {
    name: 'Lifeline New Zealand',
    phone: '0800 543 354',
    url: 'https://www.lifeline.org.nz/',
    description: '24/7 crisis support',
    available: '24/7',
  },
  ie: {
    name: 'Samaritans Ireland',
    phone: '116 123',
    url: 'https://www.samaritans.org/ireland/',
    description: 'Free 24-hour helpline',
    available: '24/7',
  },
  de: {
    name: 'Telefonseelsorge',
    phone: '0800 111 0 111',
    url: 'https://www.telefonseelsorge.de/',
    description: 'Free 24-hour helpline',
    available: '24/7',
  },
  fr: {
    name: 'SOS Amitié',
    phone: '09 72 39 40 50',
    url: 'https://www.sos-amitie.com/',
    description: '24/7 crisis support',
    available: '24/7',
  },
};

export const TEXT_CRISIS_RESOURCES = {
  us: {
    name: 'Crisis Text Line',
    textLine: 'Text HOME to 741741',
    url: 'https://www.crisistextline.org/',
    description: 'Free 24/7 text support',
  },
  ca: {
    name: 'Crisis Text Line Canada',
    textLine: 'Text CONNECT to 686868',
    url: 'https://www.kidshelpphone.ca/crisis-text-line/',
    description: 'Free 24/7 text support for youth',
  },
  uk: {
    name: 'Shout',
    textLine: 'Text SHOUT to 85258',
    url: 'https://giveusashout.org/',
    description: 'Free 24/7 text support',
  },
};

export function getCrisisResourceByRegion(region: string): CrisisResource {
  return CRISIS_RESOURCES[region.toLowerCase()] || CRISIS_RESOURCES.global;
}

export function getAllCrisisResources(): CrisisResourcesByRegion {
  return CRISIS_RESOURCES;
}

export function getEmergencyMessage(level: 'critical' | 'high'): string {
  if (level === 'critical') {
    return 'If you are in immediate danger, please contact emergency services (911 in the US) or a crisis helpline right away. You are not alone, and help is available 24/7.';
  }
  return 'It sounds like you might be going through a difficult time. Support is available whenever you need it.';
}

export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface RiskAssessmentResult {
  level: RiskLevel;
  score: number;
  indicators: RiskIndicator[];
  recommendedActions: RecommendedAction[];
  requiresImmediateAttention: boolean;
  assessedAt: string;
  flagId?: string;
  source?: string;
}

export interface RiskIndicator {
  category: 'self_harm' | 'crisis' | 'distress' | 'isolation' | 'hopelessness' | 'abuse';
  detected: boolean;
  confidence: number;
  matchedPatterns?: string[];
}

export interface RecommendedAction {
  type: 'show_resources' | 'suggest_support' | 'escalate' | 'monitor';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  message: string;
  resourceUrl?: string;
}
