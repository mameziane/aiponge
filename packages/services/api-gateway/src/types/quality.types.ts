export interface ServiceQualityAnalysis {
  serviceName: string;
  coupling: {
    inbound: number;
    outbound: number;
    score: 'low' | 'medium' | 'high' | 'critical';
  };
  complexity: {
    dependencyDepth: number;
    fanOut: number;
    score: 'low' | 'medium' | 'high' | 'critical';
  };
  health: {
    uptime: number;
    errorRate: number;
    averageResponseTime: number;
    score: 'excellent' | 'good' | 'fair' | 'poor';
  };
  overallScore: number;
  recommendations: string[];
}

export interface SystemQualityReport {
  overallScore: number;
  totalServices: number;
  criticalIssues: number;
  servicesOffline: number;
  recommendations: string[];
  serviceAnalysis: ServiceQualityAnalysis[];
  architectureHealth: {
    averageCoupling: number;
    maxDependencyDepth: number;
    highlyCoupledServices: number;
    circularDependencies: boolean;
    totalDependencies: number;
  };
  timestamp: string;
}
