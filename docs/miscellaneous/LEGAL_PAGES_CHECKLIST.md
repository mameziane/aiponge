# Legal Pages Checklist - Aiponge

This document lists all the HTML pages you need to create and host publicly for App Store and Google Play submission.

---

## Required Pages Overview

| Page             | URL Path       | Required For       | Priority     |
| ---------------- | -------------- | ------------------ | ------------ |
| Privacy Policy   | `/privacy`     | Both stores        | **Required** |
| Terms of Service | `/terms`       | Both stores        | **Required** |
| Support/Contact  | `/support`     | Both stores        | **Required** |
| Data Deletion    | `/delete-data` | Both stores (GDPR) | **Required** |
| Cookie Policy    | `/cookies`     | Web version        | Recommended  |
| EULA             | `/eula`        | App Store          | Recommended  |

---

## Page 1: Privacy Policy

**URL:** `https://aiponge.com/privacy`

**Required by:** App Store Connect, Google Play Console

**Must include:**

- [ ] What personal data is collected
- [ ] How data is used
- [ ] How data is stored and protected
- [ ] Third-party services and data sharing (RevenueCat, analytics, AI providers)
- [ ] User rights (access, correction, deletion)
- [ ] Data retention periods
- [ ] Children's privacy statement (if applicable)
- [ ] Contact information for privacy inquiries
- [ ] Last updated date

**Special requirements:**

- Must be publicly accessible (no login required)
- Must NOT be a PDF or editable document
- Must be linked within the app (Settings screen)
- Must match actual app behavior

**Existing draft:** `docs/PRIVACY_POLICY.md` and `docs/GDPR_PRIVACY_POLICY.md`

---

## Page 2: Terms of Service

**URL:** `https://aiponge.com/terms`

**Required by:** App Store Connect, Google Play Console

**Must include:**

- [ ] Acceptance of terms
- [ ] User account responsibilities
- [ ] Subscription and payment terms
- [ ] Cancellation and refund policy (link to store policies)
- [ ] Intellectual property rights (user-generated content, AI-generated music)
- [ ] Prohibited uses
- [ ] Limitation of liability
- [ ] Disclaimer of warranties
- [ ] Governing law and jurisdiction
- [ ] Termination clause
- [ ] Contact information
- [ ] Last updated date

**Existing draft:** `docs/TERMS_OF_SERVICE.md`

---

## Page 3: Support / Contact

**URL:** `https://aiponge.com/support`

**Required by:** App Store Connect, Google Play Console

**Must include:**

- [ ] Contact email: `support@aiponge.com`
- [ ] FAQ section (common issues)
- [ ] How to manage subscriptions
- [ ] How to request data deletion
- [ ] How to restore purchases
- [ ] Bug reporting instructions
- [ ] Response time expectations

**Alternative:** Can be an email address instead of webpage, but webpage is recommended.

---

## Page 4: Data Deletion Request

**URL:** `https://aiponge.com/delete-data`

**Required by:** GDPR, Google Play (Data Safety), App Store (Privacy Nutrition Label)

**Must include:**

- [ ] Form to request data deletion
- [ ] Required information (email, user ID, or account identifier)
- [ ] Explanation of what data will be deleted
- [ ] Processing time (typically 30 days)
- [ ] Confirmation process
- [ ] Contact for questions

**App implementation:** Your app already has `DeleteUserDataUseCase` for GDPR Article 17 compliance.

---

## Page 5: Cookie Policy (Web Only)

**URL:** `https://aiponge.com/cookies`

**Required by:** GDPR, ePrivacy Directive (if you have a web version)

**Must include:**

- [ ] What cookies are used
- [ ] Purpose of each cookie
- [ ] Third-party cookies
- [ ] How to manage cookie preferences
- [ ] Cookie consent banner implementation

**Note:** Only required if you have a web application or marketing website.

---

## Page 6: End User License Agreement (EULA)

**URL:** `https://aiponge.com/eula`

**Required by:** App Store (optional but recommended)

**Must include:**

- [ ] License grant
- [ ] Restrictions on use
- [ ] Intellectual property ownership
- [ ] AI-generated content ownership
- [ ] Third-party services
- [ ] Updates and modifications
- [ ] Termination
- [ ] Disclaimer of warranties
- [ ] Limitation of liability

**Note:** Apple provides a standard EULA, but custom EULA recommended for AI-generated content apps.

---

## Hosting Requirements

### Domain Setup

Host all pages at your main domain:

```
https://aiponge.com/privacy
https://aiponge.com/terms
https://aiponge.com/support
https://aiponge.com/delete-data
```

**Alternative structure:**

```
https://legal.aiponge.com/privacy
https://legal.aiponge.com/terms
```

### Technical Requirements

- [ ] HTTPS enabled (SSL certificate)
- [ ] Mobile-responsive design
- [ ] Fast loading (under 3 seconds)
- [ ] No login required to view
- [ ] Proper HTML structure (semantic tags)
- [ ] Accessible (WCAG 2.1 compliance recommended)

### Recommended Hosting Options

1. **Your app's backend** - Add static routes
2. **Separate website** - Webflow, Squarespace, WordPress
3. **GitHub Pages** - Free, simple static hosting
4. **Vercel/Netlify** - Free tier available

---

## Store Configuration URLs

### App Store Connect

1. Go to: **App Store Connect → Apps → Aiponge → App Information**
2. Add:
   - **Privacy Policy URL:** `https://aiponge.com/privacy`
   - **Support URL:** `https://aiponge.com/support`

3. Go to: **App Privacy** section
4. Complete Privacy Nutrition Label questionnaire

### Google Play Console

1. Go to: **Play Console → Aiponge → App content → Privacy policy**
2. Add: **Privacy Policy URL:** `https://aiponge.com/privacy`

3. Go to: **Store presence → Store listing**
4. Add: **Support email:** `support@aiponge.com`

5. Go to: **App content → Data safety**
6. Complete Data Safety form

---

## In-App Links

These pages must also be accessible from within your app:

### Current Implementation

Check these screens have working links:

- [ ] Settings → Privacy Policy link
- [ ] Settings → Terms of Service link
- [ ] Settings → Support/Help link
- [ ] Onboarding/Registration → Terms acceptance checkbox
- [ ] Subscription screen → Terms link

### Code Locations

```
apps/aiponge/app/settings/index.tsx - Settings menu links
apps/aiponge/src/config/urls.ts - URL constants (create if needed)
```

---

## Content Templates

### Quick Privacy Policy Sections

```html
<h1>Privacy Policy</h1>
<p>Last updated: [DATE]</p>

<h2>1. Information We Collect</h2>
<p>We collect information you provide directly:</p>
<ul>
  <li>Account information (email, phone number)</li>
  <li>Profile information (name, preferences)</li>
  <li>Book entries</li>
  <li>Usage data and analytics</li>
</ul>

<h2>2. How We Use Your Information</h2>
<p>We use your information to:</p>
<ul>
  <li>Generate personalized AI music based on your book entries</li>
  <li>Provide and improve our services</li>
  <li>Process subscriptions and payments</li>
  <li>Send notifications you've opted into</li>
</ul>

<h2>3. Data Security</h2>
<p>We use AES-256-GCM encryption for sensitive mental health data...</p>

<h2>4. Your Rights</h2>
<p>You have the right to:</p>
<ul>
  <li>Access your data</li>
  <li>Correct inaccurate data</li>
  <li>Delete your data</li>
  <li>Export your data</li>
</ul>

<h2>5. Contact Us</h2>
<p>Email: privacy@aiponge.com</p>
```

---

## Third-Party Services to Disclose

List these in your Privacy Policy:

| Service            | Data Shared             | Purpose                 |
| ------------------ | ----------------------- | ----------------------- |
| RevenueCat         | Purchase data, user ID  | Subscription management |
| MusicAPI.ai        | Text prompts            | AI music generation     |
| ElevenLabs         | Text prompts            | AI music generation     |
| AWS S3             | Audio files, images     | File storage            |
| PostgreSQL (Neon)  | All user data           | Database                |
| Expo               | Device info, crash logs | App analytics           |
| Firebase/OneSignal | Device tokens           | Push notifications      |

---

## Compliance Checklist

### GDPR (European Users)

- [ ] Legal basis for processing documented
- [ ] Data minimization practiced
- [ ] Right to access implemented
- [ ] Right to deletion implemented (`/delete-data`)
- [ ] Right to data portability implemented
- [ ] Consent management for non-essential processing
- [ ] DPO contact if required

### CCPA/CPRA (California Users)

- [ ] "Do Not Sell My Personal Information" option
- [ ] Right to know what data is collected
- [ ] Right to delete data
- [ ] Non-discrimination clause

### App Store Specific

- [ ] Privacy Nutrition Labels completed
- [ ] App Tracking Transparency implemented (if tracking)
- [ ] Kids category compliance (if applicable)

### Google Play Specific

- [ ] Data Safety form completed
- [ ] Data deletion request mechanism
- [ ] Families Policy compliance (if applicable)

---

## Timeline Recommendation

| Task                             | Time Estimate | Priority |
| -------------------------------- | ------------- | -------- |
| Convert existing MD docs to HTML | 2-4 hours     | High     |
| Create support page              | 1-2 hours     | High     |
| Create data deletion page        | 2-3 hours     | High     |
| Set up hosting                   | 1-2 hours     | High     |
| Add in-app links                 | 1 hour        | High     |
| Complete store privacy forms     | 2-3 hours     | High     |
| EULA creation                    | 2-3 hours     | Medium   |
| Cookie policy (if web)           | 1-2 hours     | Low      |

---

## Resources

- [Apple App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play Policy Center](https://play.google.com/about/developer-content-policy/)
- [GDPR Official Text](https://gdpr.eu/)
- [Privacy Policy Generator - Termly](https://termly.io/products/privacy-policy-generator/)
- [Terms Generator - TermsFeed](https://www.termsfeed.com/terms-service-generator/)
