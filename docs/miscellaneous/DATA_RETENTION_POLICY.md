# Aiponge Data Retention Policy

**Last Updated:** January 2026
**Policy Version:** 1.0.0

## 1. Overview

This document defines the data retention schedules for all personal data processed by Aiponge. These schedules are designed to comply with GDPR requirements for data minimization and storage limitation.

## 2. Retention Schedules by Data Category

### 2.1 User Account Data

| Data Type | Retention Period | Trigger for Deletion |
|-----------|-----------------|----------------------|
| User credentials | Account lifetime | Account deletion request |
| Email address | Account lifetime + 30 days | Account deletion request |
| Phone number | Account lifetime | Account deletion request |
| Password hash | Account lifetime | Account deletion or password change |

### 2.2 User-Generated Content

| Data Type | Retention Period | Trigger for Deletion |
|-----------|-----------------|----------------------|
| Book entries | Account lifetime | Account deletion or manual deletion |
| Entries | Account lifetime | Account deletion or manual deletion |
| Insights | Account lifetime | Account deletion |
| Reflections | Account lifetime | Account deletion |
| Creative lyrics | Account lifetime | Account deletion |

### 2.3 Music Data

| Data Type | Retention Period | Trigger for Deletion |
|-----------|-----------------|----------------------|
| Generated tracks | Account lifetime | Account deletion |
| Playlists | Account lifetime | Account deletion or manual deletion |
| Favorites | Account lifetime | Account deletion |
| Play history | 12 months rolling | Automatic purge |
| Track feedback | 24 months | Automatic purge |

### 2.4 Analytics Data

| Data Type | Retention Period | Trigger for Deletion |
|-----------|-----------------|----------------------|
| Activity logs | 24 months | Automatic purge |
| Workflow analytics | 24 months | Automatic purge |
| Provider usage logs | 24 months | Automatic purge |
| Cost analytics | 36 months | Manual audit |

### 2.5 Security & Compliance

| Data Type | Retention Period | Trigger for Deletion |
|-----------|-----------------|----------------------|
| Authentication logs | 12 months | Automatic purge |
| Consent records | 7 years | Legal requirement |
| Data export logs | 12 months | Automatic purge |
| Deletion audit trails | 7 years | Legal requirement |

### 2.6 Technical Data

| Data Type | Retention Period | Trigger for Deletion |
|-----------|-----------------|----------------------|
| Push notification tokens | Until token invalidation | Automatic cleanup |
| Session tokens | 30 days after expiry | Automatic purge |
| Blacklisted tokens | 90 days | Automatic purge |

## 3. Automated Purge Mechanisms

### 3.1 Daily Purge Jobs

The system runs automated purge jobs daily at 02:00 UTC:

```typescript
// Example purge schedule (implemented via node-cron)
- Session cleanup: Daily
- Expired token cleanup: Daily
- Play history (>12 months): Weekly
- Analytics logs (>24 months): Monthly
```

### 3.2 Purge Implementation

Purge jobs are implemented in the following services:

| Service | Tables Purged | Schedule |
|---------|--------------|----------|
| user-service | tokenBlacklist, sessions | Daily |
| music-service | recentlyPlayed, trackFeedback | Weekly |
| ai-analytics-service | activityLogs, workflowExecutions | Monthly |

## 4. Account Deletion Process

When a user requests account deletion:

### 4.1 Immediate Actions (Within 24 hours)
1. Deactivate account access
2. Remove push notification tokens
3. Invalidate all active sessions
4. Queue data deletion jobs

### 4.2 Data Deletion (Within 30 days)
1. Delete all user-generated content from all services
2. Delete music data (playlists, favorites, tracks)
3. Delete analytics data
4. Delete stored files
5. Delete user account record

### 4.3 Retained for Legal Compliance
1. Consent records (7 years)
2. Deletion audit trail (7 years)
3. Financial transaction records (as required by law)

## 5. Backup Retention

| Backup Type | Retention Period | Encryption |
|-------------|-----------------|------------|
| Daily backups | 7 days | AES-256 |
| Weekly backups | 4 weeks | AES-256 |
| Monthly backups | 12 months | AES-256 |

### 5.1 Backup Deletion on Account Deletion
When an account is deleted:
- User data is flagged for exclusion from backup restoration
- Rolling backups naturally expire and are deleted

## 6. Data Export

### 6.1 Export Retention
- Generated exports are available for download for 24 hours
- After 24 hours, export files are automatically deleted
- Export request logs are retained for 12 months

### 6.2 Export Format
All exports are provided in JSON format containing:
- Profile information
- Book entries (decrypted)
- Insights and reflections
- Music data (playlists, favorites)
- Consent history

## 7. Implementation Technical Details

### 7.1 Purge Job Configuration

```typescript
// Configuration in each service
const RETENTION_CONFIG = {
  playHistory: { days: 365, schedule: 'weekly' },
  trackFeedback: { days: 730, schedule: 'monthly' },
  activityLogs: { days: 730, schedule: 'monthly' },
  sessions: { days: 30, schedule: 'daily' },
  tokenBlacklist: { days: 90, schedule: 'daily' },
};
```

### 7.2 Database Indexes for Efficient Purge

All timestamp columns used for retention have indexes:
- `created_at` indexes on all tables
- `last_used_at` indexes on tokens and sessions
- `expires_at` indexes on time-limited records

## 8. Monitoring & Reporting

### 8.1 Retention Compliance Dashboard
- Weekly reports on data volume by age
- Alerts for purge job failures
- Audit log of all deletions

### 8.2 Metrics Tracked
- Data volume by category
- Average data age
- Purge job success rate
- Deletion request fulfillment time

## 9. Policy Review

This policy is reviewed:
- Annually (minimum)
- When new data categories are introduced
- When legal requirements change
- After significant incidents

## 10. Responsibilities

| Role | Responsibility |
|------|---------------|
| DPO | Policy oversight and compliance |
| Engineering | Implementation and monitoring |
| Operations | Purge job execution and alerts |
| Legal | Regulatory compliance review |

---

*This data retention policy supports GDPR Article 5(1)(e) - Storage Limitation principle.*
