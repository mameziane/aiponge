# Aiponge Privacy Policy (GDPR Compliant)

**Last Updated:** January 2026
**Policy Version:** 1.0.0

## 1. Introduction

Aiponge ("we," "us," "our") is committed to protecting your privacy and ensuring compliance with the General Data Protection Regulation (GDPR) and other applicable data protection laws. This Privacy Policy explains how we collect, use, store, and protect your personal data when you use our wellbeing platform.

## 2. Data Controller

**Data Controller:** Aiponge Inc.
**Contact Email:** privacy@aiponge.com
**Data Protection Officer (DPO):** dpo@aiponge.com
**EU Representative:** eu-representative@aiponge.com

## 3. Categories of Personal Data We Collect

### 3.1 Account Data

- Email address
- Password (encrypted with bcrypt)
- Phone number (optional, for SMS verification)
- Language preferences
- Timezone

### 3.2 Profile Data

- Display name
- Spiritual/wellness background
- Emotional state preferences
- Cultural context
- Life focus areas

### 3.3 User-Generated Content

- Book entries (encrypted with AES-256-GCM)
- Reflections (encrypted)
- Wellness insights
- Creative lyrics

### 3.4 Music & Content Data

- Playlists
- Favorite tracks
- Generated music tracks
- Listening history
- Track feedback

### 3.5 Technical Data

- Device information
- IP address (for security only)
- App usage analytics
- Push notification tokens

## 4. Legal Bases for Processing (GDPR Article 6)

| Data Category    | Legal Basis                          | Purpose                              |
| ---------------- | ------------------------------------ | ------------------------------------ |
| Account Data     | Contractual Necessity (Art. 6(1)(b)) | To provide and maintain your account |
| Book Entries     | Consent (Art. 6(1)(a))               | Personalized wellness content        |
| Music Generation | Contractual Necessity (Art. 6(1)(b)) | Core service functionality           |
| Analytics        | Legitimate Interest (Art. 6(1)(f))   | Service improvement                  |
| Security Logs    | Legal Obligation (Art. 6(1)(c))      | Security and fraud prevention        |

## 5. Your Rights Under GDPR

### 5.1 Right of Access (Article 15)

You can request a copy of all personal data we hold about you.
**How to exercise:** Settings > Privacy > Download My Data

### 5.2 Right to Rectification (Article 16)

You can update or correct your personal data at any time.
**How to exercise:** Settings > Profile > Edit Profile

### 5.3 Right to Erasure (Article 17)

You can request complete deletion of your account and all associated data.
**How to exercise:** Settings > Account > Delete Account
**Timeline:** Data deleted within 30 days

### 5.4 Right to Data Portability (Article 20)

You can export your data in a structured, machine-readable format (JSON).
**How to exercise:** Settings > Privacy > Export My Data

### 5.5 Right to Withdraw Consent (Article 7)

You can withdraw consent for any optional data processing at any time.
**How to exercise:** Settings > Privacy > Manage Consents

### 5.6 Right to Object (Article 21)

You can object to processing based on legitimate interests.
**How to exercise:** Contact dpo@aiponge.com

### 5.7 Right to Restrict Processing (Article 18)

You can request that we limit how we use your data.
**How to exercise:** Contact dpo@aiponge.com

## 6. Data Retention Periods

| Data Type            | Retention Period       | Reason              |
| -------------------- | ---------------------- | ------------------- |
| Account Data         | Until deletion request | Service provision   |
| Book Entries         | Until deletion request | User content        |
| Analytics            | 24 months              | Service improvement |
| Security Logs        | 12 months              | Legal compliance    |
| Deleted Account Data | 30 days (backup)       | Recovery option     |

## 7. Data Security Measures

- **Encryption at Rest:** AES-256-GCM for sensitive content (book entries, insights)
- **Encryption in Transit:** TLS 1.3 for all API communications
- **Key Management:** AWS Secrets Manager for encryption keys
- **Access Control:** Role-based access with audit logging
- **Password Security:** bcrypt hashing with salt

## 8. Third-Party Data Sharing

### 8.1 Service Providers

| Provider            | Purpose                 | Data Shared                        | DPA Status |
| ------------------- | ----------------------- | ---------------------------------- | ---------- |
| AWS                 | Cloud infrastructure    | Encrypted data                     | Yes        |
| RevenueCat          | Subscription management | User ID, subscription status       | Yes        |
| Twilio              | SMS verification        | Phone number                       | Yes        |
| Music API Providers | Music generation        | Song parameters (no personal data) | Yes        |

### 8.2 No Data Selling

We do not sell your personal data to third parties.

## 9. International Data Transfers

When transferring data outside the EEA, we use:

- Standard Contractual Clauses (SCCs)
- Data Processing Agreements with all providers
- Encryption of data in transit and at rest

## 10. Consent Management

We track consent for the following purposes:

- **Data Processing:** Required for core service
- **Analytics:** Optional, for service improvement
- **Marketing:** Optional, for promotional communications
- **Personalization:** Optional, for enhanced AI recommendations
- **Third-Party Sharing:** Explicit consent required

All consent records include:

- Timestamp
- Policy version
- Source (registration, settings, etc.)
- Consent text shown

## 11. Automated Decision-Making

Our AI systems generate personalized music and insights based on your book entries. You have the right to:

- Request human review of AI decisions
- Opt out of automated personalization
- Understand how AI recommendations are made

## 12. Children's Privacy

Aiponge is intended for users 16 years and older. We do not knowingly collect data from children under 16. If you believe a child has provided us with personal data, contact dpo@aiponge.com.

## 13. Data Breach Notification

In the event of a data breach that affects your rights:

- We will notify affected users within 72 hours
- We will notify the relevant supervisory authority
- We will document all breaches in our internal register

## 14. Cookie Policy

Aiponge mobile app does not use cookies. For web services:

- Essential cookies: Session management only
- No third-party advertising cookies
- No cross-site tracking

## 15. Changes to This Policy

We will notify you of material changes via:

- In-app notification
- Email to registered address

You will be asked to re-consent if changes affect processing purposes.

## 16. Contact Information

**For Privacy Inquiries:**

- Email: privacy@aiponge.com

**Data Protection Officer:**

- Email: dpo@aiponge.com

**EU Representative:**

- Email: eu-representative@aiponge.com

**Supervisory Authority:**
You have the right to lodge a complaint with your local data protection authority.

## 17. Technical Implementation

### API Endpoints for Rights Exercise

| Right            | Endpoint                    | Method |
| ---------------- | --------------------------- | ------ |
| Access/Export    | `/api/users/:userId/export` | GET    |
| Erasure          | `/auth/delete-account`      | DELETE |
| Consent Record   | `/consent`                  | POST   |
| Consent History  | `/consent/:userId`          | GET    |
| Withdraw Consent | `/consent/:userId/withdraw` | POST   |

---

_This privacy policy was last reviewed and updated in January 2026 and complies with GDPR, CCPA, and other applicable data protection regulations._
