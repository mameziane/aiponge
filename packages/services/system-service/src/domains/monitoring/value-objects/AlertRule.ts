export class AlertRule {
  constructor(
    public readonly condition: string,
    public readonly threshold?: number,
    public readonly severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ) {}
}
