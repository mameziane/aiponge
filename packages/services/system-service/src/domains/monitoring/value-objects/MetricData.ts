export class MetricData {
  constructor(
    public readonly serviceName: string,
    public readonly metricName: string,
    public readonly value: number,
    public readonly timestamp: Date,
    public readonly unit: string = '',
    public readonly tags: Record<string, string> = {}
  ) {}
}
