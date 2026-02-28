# Technical Debt Tracker

This document tracks TODO/FIXME items identified during the maintainability audit. These represent future enhancements and should be converted to issues when prioritized.

## ai-analytics-service

### DetectAnomaliesUseCase.ts - ML/Pattern Detection (11 items)

Location: `packages/services/ai-analytics-service/src/application/use-cases/DetectAnomaliesUseCase.ts`

| Line | Description                                          | Priority | Effort |
| ---- | ---------------------------------------------------- | -------- | ------ |
| 896  | Implement sophisticated pattern detection algorithms | Medium   | High   |
| 907  | Implement ML-based anomaly detection                 | Low      | High   |
| 1093 | Implement pattern analysis for recurring anomalies   | Medium   | Medium |
| 1102 | Implement prediction based on historical patterns    | Low      | High   |
| 1267 | Implement alerting configuration storage             | Medium   | Medium |
| 1275 | Implement pattern analysis                           | Medium   | Medium |
| 1283 | Implement correlation detection                      | Low      | High   |
| 1291 | Implement anomaly clustering                         | Low      | High   |
| 1299 | Implement trend analysis                             | Medium   | Medium |
| 1309 | Implement insight generation from patterns           | Low      | Medium |
| 1317 | Implement recommendation generation from patterns    | Low      | Medium |

**Summary**: These are advanced analytics features that can be implemented post-launch. The current stub implementations return empty arrays or default values, which is acceptable for MVP.

### GetSystemHealthAnalyticsUseCase.ts - Monitoring Integration (5 items)

Location: `packages/services/ai-analytics-service/src/application/use-cases/GetSystemHealthAnalyticsUseCase.ts`

| Line | Description                                                               | Priority | Effort |
| ---- | ------------------------------------------------------------------------- | -------- | ------ |
| 786  | Generate real metrics from actual system monitoring data                  | High     | Medium |
| 837  | Integrate with actual system resource monitoring (Prometheus, CloudWatch) | High     | High   |
| 1137 | Implement real-time metrics from actual monitoring system                 | Medium   | Medium |
| 1152 | Query real historical health data from TimescaleDB                        | Medium   | Medium |
| 1214 | Calculate real scalability score based on load handling capacity          | Low      | Medium |

**Summary**: These should be prioritized when setting up production monitoring infrastructure.

## music-service

### TemplateEngineServiceClient.ts (1 item)

Location: `packages/services/music-service/src/infrastructure/clients/TemplateEngineServiceClient.ts`

| Line | Description                              | Priority | Effort |
| ---- | ---------------------------------------- | -------- | ------ |
| 459  | Implement template execution when needed | Low      | Low    |

**Summary**: Feature is stubbed but not currently used in production flows.

## system-service

### S3HealthChecker.ts (1 item)

Location: `packages/services/system-service/src/monitoring/infrastructure/checkers/S3HealthChecker.ts`

| Line | Description                                                        | Priority | Effort |
| ---- | ------------------------------------------------------------------ | -------- | ------ |
| 143  | Implement AWS SigV4 signing for full AWS S3 private bucket support | Medium   | Medium |

**Summary**: Currently uses legacy signing. Should upgrade when AWS S3 private buckets are needed.

---

## Summary Statistics

| Service              | Count  | Priority Breakdown      |
| -------------------- | ------ | ----------------------- |
| ai-analytics-service | 16     | 2 High, 6 Medium, 8 Low |
| music-service        | 1      | 1 Low                   |
| system-service       | 1      | 1 Medium                |
| **Total**            | **18** |                         |

## Resolved Items

### Drizzle ORM Typed Database Wrappers (RESOLVED 2026-01-30)

All music-service repositories now use properly typed `DatabaseConnection` with Drizzle's `$dynamic()` method for flexible query chaining. Files updated:

- DrizzleAudioProcessingJobRepository.ts
- DrizzleMusicResultRepository.ts
- DrizzleMusicRequestRepository.ts
- DrizzleMusicTemplateRepository.ts
- DrizzleUserTrackRepository.ts
- DrizzleLyricsRepository.ts
- DrizzleUserLyricsRepository.ts
- DrizzleAlbumRequestRepository.ts
- DrizzleSongRequestRepository.ts

## Recommendations

1. **High Priority Items (2)**: Focus on monitoring integration before production launch
2. **Medium Priority Items (7)**: Schedule for post-launch sprints
3. **Low Priority Items (9)**: Backlog - implement when analytics features are prioritized

---

_Generated: 2026-01-30_
_Last Audit: Maintainability Audit v1_
