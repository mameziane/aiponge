# App Store Deployment Guide - Aiponge Platform

Complete guide to deploying the Aiponge mobile app to Apple App Store and Google Play Store using Expo EAS Build.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Account Setup](#account-setup)
4. [App Configuration](#app-configuration)
5. [Build & Signing](#build--signing)
6. [Asset Requirements](#asset-requirements)
7. [Store Metadata](#store-metadata)
8. [Privacy & Compliance](#privacy--compliance)
9. [Submission Workflow](#submission-workflow)
10. [Post-Launch Operations](#post-launch-operations)
11. [Troubleshooting](#troubleshooting)
12. [Checklists](#checklists)

---

## Overview

### Supported Platforms

| Platform | Store             | Account Cost | Review Time |
| -------- | ----------------- | ------------ | ----------- |
| iOS      | Apple App Store   | $99/year     | 1-3 days    |
| Android  | Google Play Store | $25 one-time | 1-7 days    |

### Build System

Aiponge uses **Expo EAS (Expo Application Services)** for builds and submissions:

- `eas build` - Create production builds
- `eas submit` - Submit to app stores
- `eas update` - Push OTA updates

---

## Prerequisites

### Required Tools

```bash
# Install EAS CLI globally
npm install -g eas-cli

# Login to Expo account
eas login

# Verify login
eas whoami
```

### Required Accounts

1. **Expo Account** (free) - expo.dev
2. **Apple Developer Account** ($99/year) - developer.apple.com
3. **Google Play Developer Account** ($25 one-time) - play.google.com/console

### Required Secrets

Set these in your Expo/EAS environment or Replit Secrets:

| Secret                               | Platform | Description                                           |
| ------------------------------------ | -------- | ----------------------------------------------------- |
| `EXPO_TOKEN`                         | Both     | Expo access token for CI/CD (preferred over password) |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY`     | iOS      | RevenueCat iOS API key                                |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | Android  | RevenueCat Android API key                            |

**Token-Based Authentication (Recommended):**

```bash
# Generate access token at expo.dev/accounts/[account]/settings/access-tokens
# Set in CI/CD environment:
export EXPO_TOKEN=your-access-token

# EAS CLI will automatically use EXPO_TOKEN for authentication
eas build --platform all --non-interactive
```

Never store raw Expo account passwords in CI secrets - always use access tokens.

---

## Account Setup

### Apple Developer Account

1. **Enroll in Apple Developer Program**
   - Visit developer.apple.com/programs/enroll
   - Pay $99/year enrollment fee
   - Wait for approval (usually 24-48 hours)

2. **Create App Store Connect App**
   - Go to appstoreconnect.apple.com
   - Click "My Apps" → "+" → "New App"
   - Fill in: Name, Bundle ID (`com.aiponge`), SKU, Primary Language

3. **Generate Certificates & Profiles** (handled by EAS)
   - EAS automatically manages provisioning profiles
   - First build will prompt for Apple credentials

### Google Play Developer Account

1. **Create Developer Account**
   - Visit play.google.com/console
   - Pay $25 one-time registration fee
   - Complete identity verification

2. **Create New App**
   - Click "Create app"
   - Enter app name, default language, app/game type
   - Accept policies and create

3. **Generate Upload Key**
   ```bash
   # EAS handles this automatically, or manually:
   keytool -genkey -v -keystore upload-keystore.jks \
     -keyalg RSA -keysize 2048 -validity 10000 \
     -alias upload-key
   ```

---

## App Configuration

### app.json Configuration

The following is the complete production configuration for Aiponge:

```json
{
  "expo": {
    "name": "aiponge",
    "slug": "aiponge",
    "platforms": ["ios", "android"],
    "version": "1.0.0",
    "orientation": "default",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "automatic",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#1a0b2e"
    },
    "assetBundlePatterns": ["**/*"],
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.aiponge",
      "infoPlist": {
        "ITSAppUsesNonExemptEncryption": false,
        "UIBackgroundModes": ["audio"],
        "NSSpeechRecognitionUsageDescription": "aiponge uses speech recognition to transcribe your voice into entries",
        "NSMicrophoneUsageDescription": "aiponge needs microphone access to record your voice for transcription"
      },
      "entitlements": {
        "com.apple.security.application-groups": ["group.com.aiponge"]
      }
    },
    "android": {
      "package": "com.aiponge",
      "adaptiveIcon": {
        "foregroundImage": "./assets/icon.png",
        "backgroundColor": "#1a0b2e"
      }
    },
    "privacy": "https://aiponge.com/privacy",
    "termsOfService": "https://aiponge.com/terms",
    "scheme": "aiponge",
    "plugins": [
      "expo-router",
      "expo-font",
      "expo-localization",
      [
        "expo-speech-recognition",
        {
          "microphonePermission": "Aiponge needs microphone access to record your voice for transcription.",
          "speechRecognitionPermission": "Aiponge uses speech recognition to transcribe your voice into entries.",
          "androidSpeechServicePackages": ["com.google.android.googlequicksearchbox"]
        }
      ],
      ["@siteed/expo-audio-studio", { "enableDeviceDetection": true }],
      [
        "expo-build-properties",
        {
          "android": {
            "enableProguardInReleaseBuilds": true,
            "enableShrinkResourcesInReleaseBuilds": true,
            "enableMinifyInReleaseBuilds": true
          }
        }
      ],
      [
        "expo-share-intent",
        {
          "iosActivationRules": {
            "NSExtensionActivationSupportsText": true,
            "NSExtensionActivationSupportsWebURLWithMaxCount": 1
          },
          "androidIntentFilters": ["text/*"],
          "androidMainActivityAttributes": { "android:launchMode": "singleTask" }
        }
      ]
    ],
    "experiments": { "typedRoutes": true },
    "extra": {
      "router": {},
      "eas": { "projectId": "4c7e5def-2ee8-431e-8a7e-4dafe89c2232" }
    },
    "owner": "aiponge-productions"
  }
}
```

**Key Configuration Notes:**

- `ITSAppUsesNonExemptEncryption: false` - Required to avoid export compliance questions for iOS
- `UIBackgroundModes: ["audio"]` - Enables background audio playback
- `userInterfaceStyle: "automatic"` - Supports system dark/light mode
- `scheme: "aiponge"` - Deep linking URL scheme for app links
- `assetBundlePatterns: ["**/*"]` - Bundles all assets with the app
- `plugins` - Configure native modules and their permissions
- `experiments.typedRoutes` - Enables TypeScript route checking with expo-router
- `extra.eas.projectId` - Links to your EAS project (get from `eas project:info`)

### eas.json Configuration

Current Aiponge configuration:

```json
{
  "cli": {
    "version": ">= 16.0.0",
    "appVersionSource": "local"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": false
      }
    },
    "preview": {
      "distribution": "internal",
      "ios": {
        "simulator": false
      }
    },
    "production": {}
  },
  "submit": {
    "production": {}
  }
}
```

**For automated store submissions**, extend the production submit configuration:

```json
{
  "submit": {
    "production": {
      "ios": {
        "appleId": "your-apple-id@email.com",
        "ascAppId": "YOUR_APP_STORE_CONNECT_APP_ID",
        "appleTeamId": "YOUR_APPLE_TEAM_ID"
      },
      "android": {
        "serviceAccountKeyPath": "./google-service-account.json",
        "track": "internal"
      }
    }
  }
}
```

**How to get these values:**

- `appleId` - Your Apple ID email used for App Store Connect
- `ascAppId` - App Store Connect App ID (found in App Store Connect → App Information)
- `appleTeamId` - Your Apple Developer Team ID (found in developer.apple.com → Membership)
- `serviceAccountKeyPath` - Google Cloud service account JSON for Play Console API access

### Environment Files

Create environment files for production:

```bash
# apps/aiponge/.env.production
EXPO_PUBLIC_API_URL=https://api.aiponge.com
EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_xxxxx
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_xxxxx
```

---

## Build & Signing

### iOS Builds

```bash
cd apps/aiponge

# Development build (for testing with Expo Go alternative)
eas build --platform ios --profile development

# Preview build (internal testing)
eas build --platform ios --profile preview

# Production build (App Store)
eas build --platform ios --profile production
```

**First-time setup:**

- EAS will prompt for Apple Developer credentials
- Automatically creates/manages provisioning profiles
- Stores credentials securely on Expo servers

### Android Builds

```bash
cd apps/aiponge

# Development APK
eas build --platform android --profile development

# Preview APK (internal testing)
eas build --platform android --profile preview

# Production AAB (Google Play)
eas build --platform android --profile production
```

**Signing Key Management:**

- EAS auto-generates upload keystore on first build
- Download keystore backup: `eas credentials`
- Store backup securely (cannot be recovered if lost)

### Build Both Platforms

```bash
# Build for both platforms simultaneously
eas build --platform all --profile production
```

### Android Play App Signing

When you upload your first AAB to Google Play, Google automatically enrolls your app in **Play App Signing**. Understanding this is critical for long-term app management.

**Key Concepts:**

| Key Type        | Who Holds It | Purpose                                 |
| --------------- | ------------ | --------------------------------------- |
| Upload Key      | You (EAS)    | Signs AABs you upload to Google         |
| App Signing Key | Google       | Signs the final APKs delivered to users |

**How It Works:**

1. You sign your AAB with your **upload key** (managed by EAS)
2. Google strips your signature and re-signs with the **app signing key**
3. Users receive APKs signed by Google's key

**Benefits:**

- Google securely stores your app signing key
- If you lose your upload key, you can reset it (app signing key stays the same)
- Enables optimized APK delivery via App Bundles

**Backup Your Upload Key:**

```bash
# Download your upload keystore from EAS
eas credentials --platform android

# Select "Download keystore" and save securely
# Store in password manager or secure vault
```

**Export App Signing Key (Optional):**

```
Play Console → App → Setup → App signing
- View certificate fingerprints (SHA-1, SHA-256)
- Download public certificate (.der) for integrations
- Request key upgrade if needed (rarely necessary)
```

**Upload Key Reset Process:**
If your upload key is compromised or lost:

1. Go to Play Console → Setup → App signing
2. Click "Request upload key reset"
3. Follow the key generation instructions
4. Upload new key to Google and EAS

**Important Notes:**

- App signing key CANNOT be changed or reset (permanent)
- Upload key CAN be reset with Google's approval
- Always keep backup of credentials: `eas credentials --platform android`

---

## Asset Requirements

### iOS Assets

| Asset              | Size      | Format  | Notes                               |
| ------------------ | --------- | ------- | ----------------------------------- |
| App Icon           | 1024×1024 | PNG     | No transparency, no rounded corners |
| Splash Screen      | 1242×2688 | PNG     | Covers iPhone X+ notch area         |
| Screenshots (6.7") | 1290×2796 | PNG/JPG | iPhone 14 Pro Max                   |
| Screenshots (5.5") | 1242×2208 | PNG/JPG | iPhone 8 Plus                       |
| App Preview Video  | 1080p     | MOV/M4V | 15-30 seconds, optional             |

### Android Assets

| Asset                      | Size         | Format    | Notes                   |
| -------------------------- | ------------ | --------- | ----------------------- |
| App Icon                   | 512×512      | PNG       | 32-bit with alpha       |
| Adaptive Icon (foreground) | 108×108 dp   | PNG       | Safe zone: 66×66 dp     |
| Adaptive Icon (background) | 108×108 dp   | PNG/Color | Solid color or image    |
| Feature Graphic            | 1024×500     | PNG/JPG   | Required for Play Store |
| Screenshots (phone)        | 16:9 or 9:16 | PNG/JPG   | Min 320px, Max 3840px   |
| Promo Video                | YouTube      | URL       | Optional, unlisted OK   |

### Creating Screenshots

**Using Xcode Simulator (iOS):**

```bash
# Open simulator
open -a Simulator

# Take screenshot (Cmd+S in simulator window)
# Or from command line:
xcrun simctl io booted screenshot screenshot.png
```

**Using Android Emulator:**

```bash
# Take screenshot
adb shell screencap /sdcard/screenshot.png
adb pull /sdcard/screenshot.png ./screenshot.png
```

---

## Store Metadata

### App Store (iOS)

**App Name:** (30 characters max)

```
aiponge
```

**Subtitle:** (30 characters max)

```
AI Wellness & Music Companion
```

**Description:** (4000 characters max)

```
Aiponge is your AI-powered personal development companion,
combining psychological wellness tools with personalized
music streaming for transformative growth.

Features:
• AI-Generated Music tailored to your mood and goals
• Personalized Insights using 29 psychological frameworks
• Virtual Mentor Chat for guidance and support
• Curated Music Library for mindful listening
• Daily Affirmations and reflections

Transform your wellness journey with AI-powered
personalization designed for you.
```

**Keywords:** (100 characters, comma-separated)

```
wellness,meditation,music,AI,personal development,mindfulness,therapy,mental health,affirmations
```

**Promotional Text:** (170 characters, updatable without review)

```
Experience personalized AI-generated music and insights designed to support your mental wellness journey. Start transforming today.
```

**Category:**

- Primary: Health & Fitness
- Secondary: Music

**Age Rating:** Complete questionnaire in App Store Connect

- Expected rating: 4+ or 9+ (no objectionable content)

### Google Play Store (Android)

**App Name:** (50 characters max)

```
aiponge - AI Wellness & Music
```

**Short Description:** (80 characters max)

```
AI-powered personal development with personalized music and wellness insights.
```

**Full Description:** (4000 characters max)

```
[Same content as iOS description]
```

**Category:**

- Application Type: App
- Category: Health & Fitness

**Content Rating:** Complete IARC questionnaire

- Expected: Everyone

**Tags:** (up to 5)

- Wellness
- Meditation
- Music
- AI
- Mental Health

---

## Privacy & Compliance

### Privacy Policy

**Required by both stores.** Host at a public URL (e.g., `https://aiponge.com/privacy`).

See: `docs/PRIVACY_POLICY.md`

**Key sections required:**

- What data is collected
- How data is used
- Third-party services (RevenueCat, AI providers)
- Data retention and deletion
- Contact information
- GDPR/CCPA compliance

### App Store Privacy Nutrition Label (iOS)

Complete in App Store Connect → App Privacy:

**Data Types Collected:**

| Category         | Data Type           | Linked to User | Used for Tracking |
| ---------------- | ------------------- | -------------- | ----------------- |
| Contact Info     | Email Address       | Yes            | No                |
| Contact Info     | Name                | Yes            | No                |
| User Content     | Audio Data          | Yes            | No                |
| User Content     | Other Content       | Yes            | No                |
| Identifiers      | User ID             | Yes            | No                |
| Usage Data       | Product Interaction | Yes            | No                |
| Diagnostics      | Crash Data          | Yes            | No                |
| Health & Fitness | Health Data         | Yes            | No                |

**Data Usage:**

- App Functionality
- Analytics
- Product Personalization

### Google Play Data Safety (Android)

Complete in Play Console → Policy → App content → Data safety:

**Data Collection:**

- Personal info: Name, email
- App activity: App interactions
- Device info: Crash logs

**Data Sharing:**

- No data shared with third parties for advertising

**Security Practices:**

- Data encrypted in transit (TLS)
- Data encrypted at rest (AES-256)
- Users can request data deletion

### GDPR Compliance

- [ ] Privacy policy accessible before signup
- [ ] Consent checkboxes for data processing
- [ ] Data export functionality
- [ ] Account deletion (implemented in Profile → Delete Account)
- [ ] Right to rectification (profile editing)

### CCPA Compliance

- [ ] "Do Not Sell" link (if applicable)
- [ ] Data disclosure upon request
- [ ] Delete data upon request

---

## Submission Workflow

### iOS Submission

1. **Build Production App**

   ```bash
   eas build --platform ios --profile production
   ```

2. **Submit to App Store Connect**

   ```bash
   eas submit --platform ios --profile production
   ```

   Or upload manually via Transporter app.

3. **TestFlight Internal Testing**
   - Build appears in TestFlight within 1-2 hours
   - Add internal testers (up to 100 App Store Connect users)
   - No Apple review required for internal testing
   - Test all features thoroughly

4. **TestFlight External Testing** (Optional but Recommended)
   - Add external testers via email or public link (up to 10,000)
   - **Requires Apple Beta App Review** (usually 1-2 days)
   - Create test groups for different user segments
   - External testing allows real user feedback before release

   **Beta App Review Requirements:**
   - Complete App Information in App Store Connect
   - Provide "What to Test" description
   - Include beta contact information
   - Provide demo account if needed

   **Managing Test Groups:**

   ```
   App Store Connect → TestFlight → Internal/External Testing
   - Create groups: "Internal Team", "Beta Testers", "Early Access"
   - Set different build access per group
   - Track feedback and crash reports per group
   ```

5. **Submit for Review**
   - In App Store Connect, select build
   - Complete all metadata
   - Add review notes if needed
   - Submit for review

6. **Review Process**
   - Typical: 1-3 days
   - May receive questions/rejections
   - Respond promptly to expedite

### Android Submission

1. **Build Production AAB**

   ```bash
   eas build --platform android --profile production
   ```

2. **Submit to Play Console**

   ```bash
   eas submit --platform android --profile production
   ```

   Or upload manually in Play Console.

3. **Internal Testing Track**
   - Start with internal testing
   - Add testers via email list
   - Test on multiple devices

4. **Closed/Open Testing**
   - Graduate to closed testing
   - Get feedback from larger group
   - Fix any issues found

5. **Production Release**
   - Complete store listing
   - Complete Data Safety form
   - Submit for review

6. **Staged Rollout**
   - Start at 5-10% of users
   - Monitor crash rates and reviews
   - Gradually increase to 100%

### Review Notes Template

```
Test Account Credentials:
Email: test@aiponge.com
Password: TestUser123!

Notes for Reviewers:
- The app requires account creation to access personalized features
- AI-generated music may take 30-60 seconds to generate
- Voice input requires microphone permission
- Subscription features can be tested with sandbox account

Contact for Questions:
support@aiponge.com
```

---

## Post-Launch Operations

### Monitoring

**App Store Connect:**

- Monitor reviews daily
- Check crash reports in Xcode/App Store Connect
- Review sales and trends

**Google Play Console:**

- Check Android vitals (crashes, ANRs)
- Monitor user ratings and reviews
- Review acquisition reports

### Responding to Reviews

- Respond to negative reviews promptly
- Thank users for positive feedback
- Never argue or be defensive
- Offer to help via support email

### OTA Updates (Expo)

For non-native code changes:

```bash
# Push update to production users
eas update --branch production --message "Bug fixes"

# Push update to preview users
eas update --branch preview --message "New feature testing"
```

**OTA Limitations:**

- Cannot change native code
- Cannot add new native modules
- Cannot change app.json configuration

### Version Bumping

For new store submissions:

```bash
# Increment version in app.json
# "version": "1.0.0" → "1.0.1"

# iOS: Increment buildNumber
# Android: Increment versionCode

# Build and submit
eas build --platform all --profile production
eas submit --platform all --profile production
```

### Hotfix Process

1. Fix issue in code
2. If native change: Full build + store review
3. If JS-only change: OTA update via `eas update`
4. Monitor crash rates after release

---

## Troubleshooting

### Build Failures

**"Missing provisioning profile"**

```bash
# Clear credentials and re-authenticate
eas credentials
# Follow prompts to reset iOS credentials
```

**"Keystore not found"**

```bash
# Download existing keystore or generate new
eas credentials --platform android
```

**"Build timeout"**

- Check EAS build queue status
- Consider EAS Priority builds
- Reduce app bundle size

### Submission Rejections

**Common iOS Rejections:**

| Issue                  | Solution                        |
| ---------------------- | ------------------------------- |
| Crashes                | Test thoroughly on real devices |
| Broken links           | Verify all URLs work            |
| Incomplete metadata    | Fill all required fields        |
| Missing privacy policy | Host policy at valid URL        |
| IAP issues             | Test sandbox purchases          |

**Common Android Rejections:**

| Issue                           | Solution                           |
| ------------------------------- | ---------------------------------- |
| Policy violation                | Review all policies carefully      |
| Incomplete Data Safety          | Complete all required fields       |
| Missing permissions explanation | Add rationale in manifest          |
| Target API level                | Ensure targetSdkVersion is current |

### RevenueCat Issues

**Subscriptions not loading:**

- Verify API keys are correct
- Check products configured in RevenueCat dashboard
- Ensure App Store/Play Store products are approved

**Purchases not processing:**

- Test with sandbox/test accounts only
- Verify entitlements configured correctly
- Check webhook configuration

---

## Checklists

### Pre-Submission Checklist

#### Assets

- [ ] App icon (1024×1024 for iOS, 512×512 for Android)
- [ ] Splash screen configured
- [ ] Screenshots for all required sizes
- [ ] Feature graphic (Android)
- [ ] Adaptive icon (Android)

#### Configuration

- [ ] Bundle ID / Package name set
- [ ] Version and build numbers correct
- [ ] Production API URL configured
- [ ] All API keys set
- [ ] eas.json production profile complete

#### Legal & Compliance

- [ ] Privacy policy hosted and accessible
- [ ] Privacy Nutrition Label complete (iOS)
- [ ] Data Safety form complete (Android)
- [ ] Age rating questionnaire complete
- [ ] Support contact configured

#### Testing

- [ ] Tested on physical devices
- [ ] All features work correctly
- [ ] No crashes or ANRs
- [ ] Subscription flow tested
- [ ] Push notifications work (if applicable)

#### Backend

- [ ] Production backend deployed
- [ ] Database migrations complete
- [ ] CDN configured for media
- [ ] SSL certificates valid

### Post-Launch Checklist

- [ ] Monitor crash reports daily (first week)
- [ ] Respond to user reviews
- [ ] Track key metrics (downloads, retention)
- [ ] Prepare for first update
- [ ] Document any issues for future reference

---

## Resources

### Apple

- [App Store Connect](https://appstoreconnect.apple.com)
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
- [App Store Screenshot Specs](https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications/)

### Google

- [Google Play Console](https://play.google.com/console)
- [Google Play Policies](https://play.google.com/about/developer-content-policy/)
- [Material Design Guidelines](https://material.io/design)
- [Android App Bundle](https://developer.android.com/guide/app-bundle)

### Expo

- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [EAS Submit Documentation](https://docs.expo.dev/submit/introduction/)
- [EAS Update Documentation](https://docs.expo.dev/eas-update/introduction/)

### Internal Docs

- Privacy Policy: `docs/PRIVACY_POLICY.md`
- RevenueCat Integration: `apps/aiponge/docs/REVENUECAT_INTEGRATION.md`
- App Configuration: `apps/aiponge/app.json`
- EAS Configuration: `apps/aiponge/eas.json`

---

_Last Updated: December 2025_
