export function parsePositiveInt(envVar: string, defaultValue: number, minValue = 1): number {
  const value = process.env[envVar];
  if (!value) return defaultValue;

  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < minValue) {
    throw new Error(
      `Invalid ${envVar}: "${value}". Must be a positive integer >= ${minValue}. ` + `Default is ${defaultValue}.`
    );
  }
  return parsed;
}
