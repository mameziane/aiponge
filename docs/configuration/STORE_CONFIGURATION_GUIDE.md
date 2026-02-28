# Store Configuration Guide - aiponge

This guide covers the **manual configuration tasks** required in App Store Connect, Google Play Console, and RevenueCat dashboard to set up subscriptions and song credit purchases.

**Important:** RevenueCat does NOT automatically create products in the stores. You must manually configure products in App Store Connect and Google Play Console first, then import them into RevenueCat.

---

## Table of Contents

1. [aiponge Product Catalog](#aiponge-product-catalog)
2. [App Store Connect (iOS)](#app-store-connect-ios)
3. [Google Play Console (Android)](#google-play-console-android)
4. [RevenueCat Dashboard](#revenuecat-dashboard)
5. [Testing Checklist](#testing-checklist)

---

## Aiponge Product Catalog

### Subscription Tiers

| Tier | Price | Songs/Month | Features |
|------|-------|-------------|----------|
| Guest (Free) | $0 | 1 | No account required, limited access, conversion prompts |
| Explorer (Free) | $0 | 2 | Registered account, basic app access |
| Personal | $9.99/month | 15 | Full app access |
| Practice | $49/month | 50 | Priority generation, all features |
| Studio | $149/month | 150 | Maximum generation capacity, all features |

### Product IDs to Configure

#### Subscriptions

| Product ID | Type | Price | Description |
|------------|------|-------|-------------|
| `com.aiponge.subscription.personal.monthly` | Auto-Renewable | $9.99/month | Personal Monthly |
| `com.aiponge.subscription.personal.yearly` | Auto-Renewable | $79.99/year | Personal Yearly |
| `com.aiponge.subscription.practice.monthly` | Auto-Renewable | $49/month | Practice Monthly |
| `com.aiponge.subscription.practice.yearly` | Auto-Renewable | $399.99/year | Practice Yearly |
| `com.aiponge.subscription.studio.monthly` | Auto-Renewable | $149/month | Studio Monthly |
| `com.aiponge.subscription.studio.yearly` | Auto-Renewable | $1199.99/year | Studio Yearly |

#### Song Credit Packs (Consumables)

| Product ID | Type | Credits | Price |
|------------|------|---------|-------|
| `com.aiponge.credits.5` | Consumable | 5 songs | $4.99 |
| `com.aiponge.credits.15` | Consumable | 15 songs | $12.99 |
| `com.aiponge.credits.30` | Consumable | 30 songs | $22.99 |

---

## App Store Connect (iOS)

### Prerequisites

Before creating products, complete these steps:

- [ ] **Sign Paid Applications Agreement**
  - Go to: App Store Connect → Business → Agreements, Tax, and Banking
  - Sign the "Paid Applications" agreement
  
- [ ] **Complete Banking Information**
  - Add bank account for payouts
  - Status must show "Clear" (may take 1-2 business days)
  
- [ ] **Complete Tax Information**
  - Complete US Tax forms (W-8BEN or W-9)
  - Status must show "Clear"

### Step 1: Generate In-App Purchase Key (Required for RevenueCat)

1. Go to: **App Store Connect → Users and Access → Integrations → In-App Purchase**
2. Click **"Generate In-App Purchase Key"** (or "+" if you have existing keys)
3. Download the **.p8 file** - save securely, you cannot download it again
4. Copy the **Issuer ID** from the same page
5. Note the **Key ID** shown

**Store these values:**
- `.p8` file (for RevenueCat upload)
- Issuer ID: `______________________________`
- Key ID: `______________________________`

### Step 2: Create Subscription Group

1. Go to: **App Store Connect → My Apps → Aiponge → Monetization → Subscriptions**
2. Click **"+"** to create a new subscription group
3. Name: `Aiponge Access` (internal reference name)
4. Click **Create**

### Step 3: Create Subscription Products

For each subscription product:

#### Personal Monthly ($9.99)

1. Click your subscription group **"Aiponge Access"**
2. Click **"Create"**
3. Configure:
   - **Reference Name:** `Personal Monthly`
   - **Product ID:** `com.aiponge.subscription.personal.monthly`
4. Click **Create**
5. Set **Duration:** 1 month
6. Set **Subscription Level:** 3 (below Practice and Studio)
7. Click **"Add Subscription Price"**
   - Base country: United States
   - Price: $9.99
   - Apple auto-calculates other regions
   - Click **Next → Confirm**
8. Add **Localization:**
   - Language: English (US)
   - Display Name: `Personal`
   - Description: `15 AI-generated songs per month, full app access`
9. Add **Review Screenshot:** Upload a screenshot of your paywall
10. Save

#### Personal Yearly ($79.99)

Repeat above with:
- **Reference Name:** `Personal Yearly`
- **Product ID:** `com.aiponge.subscription.personal.yearly`
- **Duration:** 1 year
- **Price:** $79.99
- **Display Name:** `Personal Annual`
- **Description:** `15 AI-generated songs per month, save 33% with annual billing`

#### Practice Monthly ($49)

1. Click **"Create"** in subscription group
2. Configure:
   - **Reference Name:** `Practice Monthly`
   - **Product ID:** `com.aiponge.subscription.practice.monthly`
3. Set **Duration:** 1 month
4. Set **Subscription Level:** 2 (above Personal, below Studio)
5. Set **Price:** $49
6. Add **Localization:**
   - Display Name: `Practice`
   - Description: `50 AI-generated songs per month, priority generation, all features`
7. Add Review Screenshot and Save

#### Practice Yearly ($399.99)

Repeat above with:
- **Reference Name:** `Practice Yearly`
- **Product ID:** `com.aiponge.subscription.practice.yearly`
- **Duration:** 1 year
- **Price:** $399.99
- **Display Name:** `Practice Annual`
- **Description:** `50 AI-generated songs per month, save 32% with annual billing`

#### Studio Monthly ($149)

1. Click **"Create"** in subscription group
2. Configure:
   - **Reference Name:** `Studio Monthly`
   - **Product ID:** `com.aiponge.subscription.studio.monthly`
3. Set **Duration:** 1 month
4. Set **Subscription Level:** 1 (highest access level)
5. Set **Price:** $149
6. Add **Localization:**
   - Display Name: `Studio`
   - Description: `150 AI-generated songs per month, maximum generation capacity, all features`
7. Add Review Screenshot and Save

#### Studio Yearly ($1199.99)

Repeat above with:
- **Reference Name:** `Studio Yearly`
- **Product ID:** `com.aiponge.subscription.studio.yearly`
- **Duration:** 1 year
- **Price:** $1199.99
- **Display Name:** `Studio Annual`
- **Description:** `150 AI-generated songs per month, save 33% with annual billing`

### Step 4: Create Consumable Products (Song Credits)

1. Go to: **App Store Connect → My Apps → Aiponge → Monetization → In-App Purchases**
2. Click **"+"**
3. Select **"Consumable"**

#### 5 Song Credits ($4.99)

- **Reference Name:** `5 Song Credits`
- **Product ID:** `com.aiponge.credits.5`
- **Price:** $4.99
- **Localization:**
  - Display Name: `5 Song Credits`
  - Description: `Generate 5 additional AI songs`
- Add Review Screenshot and Save

#### 15 Song Credits ($12.99)

- **Reference Name:** `15 Song Credits`
- **Product ID:** `com.aiponge.credits.15`
- **Price:** $12.99
- **Localization:**
  - Display Name: `15 Song Credits`
  - Description: `Generate 15 additional AI songs (save 13%)`

#### 30 Song Credits ($22.99)

- **Reference Name:** `30 Song Credits`
- **Product ID:** `com.aiponge.credits.30`
- **Price:** $22.99
- **Localization:**
  - Display Name: `30 Song Credits`
  - Description: `Generate 30 additional AI songs (save 23%)`

### Step 5: Configure Server Notifications (Recommended)

1. Go to: **App Store Connect → My Apps → Aiponge → General → App Information**
2. Scroll to **"App Store Server Notifications"**
3. Add Production URL: `https://api.revenuecat.com/v1/webhooks/apple`
4. Add Sandbox URL: `https://api.revenuecat.com/v1/webhooks/apple`
5. Select **Version 2** notifications

### Step 6: Create Sandbox Test Accounts

1. Go to: **App Store Connect → Users and Access → Sandbox → Testers**
2. Click **"+"** to add testers
3. Create test accounts (use fake email addresses you control)
4. These accounts can make test purchases without real charges

---

## Google Play Console (Android)

### Prerequisites

- [ ] **Upload an APK/AAB** to at least the Closed Test track
  - Required to unlock monetization features
- [ ] **Complete Payments Profile**
  - Go to: Settings → Payments profile
  - Add bank account and tax information

### Step 1: Create Service Account (Required for RevenueCat)

1. Go to: **Google Play Console → Setup → API access**
2. Under "Service accounts", click **"Create new service account"**
3. Click **"Google Cloud Platform"** link
4. In Google Cloud Console:
   - Click **"+ CREATE SERVICE ACCOUNT"**
   - Name: `RevenueCat Integration`
   - Click **Create and Continue**
   - Skip role assignment, click **Done**
5. Click on the created service account
6. Go to **Keys** tab → **Add Key → Create new key**
7. Select **JSON** format
8. Download the JSON file - save securely

**Back in Google Play Console:**
1. Refresh the API access page
2. Click **"Grant access"** next to your service account
3. Under "App permissions", select **Aiponge**
4. Set permission to **Admin** (full access)
5. Click **Invite user**

**Store this value:**
- Service Account JSON file (for RevenueCat upload)

### Step 2: Create Subscriptions

1. Go to: **Google Play Console → Aiponge → Monetize with Play → Products → Subscriptions**
2. Click **"Create subscription"**

#### Personal Subscription

1. **Product ID:** `personal`
2. **Name:** `Personal Plan`
3. **Description:** `15 AI-generated songs per month`
4. Add **Benefits:**
   - 15 personalized AI songs monthly
   - Full app access
   - Writing-to-music generation
5. Click **Save**

**Add Base Plans:**

**Monthly Base Plan:**
1. Click **"Add base plan"**
2. **Base Plan ID:** `personal-monthly`
3. **Billing Period:** 1 month
4. **Renewal Type:** Auto-renewing
5. Set **Price:** $9.99
6. Click **Activate**

**Yearly Base Plan:**
1. Click **"Add base plan"**
2. **Base Plan ID:** `personal-yearly`
3. **Billing Period:** 1 year
4. **Renewal Type:** Auto-renewing
5. Set **Price:** $79.99
6. Click **Activate**

#### Practice Subscription

1. Click **"Create subscription"**
2. **Product ID:** `practice`
3. **Name:** `Practice Plan`
4. **Description:** `50 AI-generated songs per month with priority`
5. Add **Benefits:**
   - 50 personalized AI songs monthly
   - Priority song generation
   - All features unlocked
6. Click **Save**

**Add Base Plans:**

**Monthly Base Plan:**
- **Base Plan ID:** `practice-monthly`
- **Billing Period:** 1 month
- **Price:** $49
- Click **Activate**

**Yearly Base Plan:**
- **Base Plan ID:** `practice-yearly`
- **Billing Period:** 1 year
- **Price:** $399.99
- Click **Activate**

#### Studio Subscription

1. Click **"Create subscription"**
2. **Product ID:** `studio`
3. **Name:** `Studio Plan`
4. **Description:** `150 AI-generated songs per month, maximum capacity`
5. Add **Benefits:**
   - 150 personalized AI songs monthly
   - Maximum generation capacity
   - All features unlocked
6. Click **Save**

**Add Base Plans:**

**Monthly Base Plan:**
- **Base Plan ID:** `studio-monthly`
- **Billing Period:** 1 month
- **Price:** $149
- Click **Activate**

**Yearly Base Plan:**
- **Base Plan ID:** `studio-yearly`
- **Billing Period:** 1 year
- **Price:** $1199.99
- Click **Activate**

### Step 3: Create In-App Products (Song Credits)

1. Go to: **Google Play Console → Aiponge → Monetize with Play → Products → In-app products**
2. Click **"Create product"**

#### 5 Song Credits

- **Product ID:** `credits_5`
- **Name:** `5 Song Credits`
- **Description:** `Generate 5 additional AI songs`
- **Price:** $4.99
- Click **Save** → **Activate**

#### 15 Song Credits

- **Product ID:** `credits_15`
- **Name:** `15 Song Credits`
- **Description:** `Generate 15 additional AI songs (save 13%)`
- **Price:** $12.99
- Click **Save** → **Activate**

#### 30 Song Credits

- **Product ID:** `credits_30`
- **Name:** `30 Song Credits`
- **Description:** `Generate 30 additional AI songs (save 23%)`
- **Price:** $22.99
- Click **Save** → **Activate**

### Step 4: Configure Real-Time Developer Notifications

1. Go to: **Google Play Console → Aiponge → Monetization setup**
2. Under "Real-time developer notifications":
3. **Topic name:** Create a Cloud Pub/Sub topic or use RevenueCat's
4. **Webhook URL:** `https://api.revenuecat.com/v1/webhooks/google`

### Step 5: Set Up License Testing

1. Go to: **Google Play Console → Settings → License testing**
2. Add email addresses of test accounts
3. Set **License response:** `RESPOND_NORMALLY`
4. These accounts can test purchases in any build

---

## RevenueCat Dashboard

### Step 1: Create RevenueCat Project

1. Go to: https://app.revenuecat.com
2. Click **"+ New Project"**
3. Name: `Aiponge`

### Step 2: Add iOS App

1. Click **"+ Add App"**
2. Select **Apple App Store**
3. Configure:
   - **App name:** `aiponge iOS`
   - **Bundle ID:** `com.aiponge.app` (your actual bundle ID)
4. Under **"In-app purchase key configuration":**
   - Upload the **.p8 file** from App Store Connect
   - Enter **Issuer ID**
   - Enter **Key ID**
5. Click **Save**

### Step 3: Add Android App

1. Click **"+ Add App"**
2. Select **Google Play Store**
3. Configure:
   - **App name:** `aiponge Android`
   - **Package name:** `com.aiponge.app` (your actual package name)
4. Under **"Service credentials":**
   - Upload the **Service Account JSON** file from Google Cloud
5. Click **Save**

### Step 4: Import Products

#### iOS Products:

1. Go to: **Products** (left sidebar)
2. Click **"+ New"** or **"Import"**
3. Select **iOS** tab
4. Import all products:
   - `com.aiponge.subscription.personal.monthly`
   - `com.aiponge.subscription.personal.yearly`
   - `com.aiponge.subscription.practice.monthly`
   - `com.aiponge.subscription.practice.yearly`
   - `com.aiponge.subscription.studio.monthly`
   - `com.aiponge.subscription.studio.yearly`
   - `com.aiponge.credits.5`
   - `com.aiponge.credits.15`
   - `com.aiponge.credits.30`

#### Android Products:

1. Click **"Import"** → select **Android**
2. Import all products:
   - `personal:personal-monthly`
   - `personal:personal-yearly`
   - `practice:practice-monthly`
   - `practice:practice-yearly`
   - `studio:studio-monthly`
   - `studio:studio-yearly`
   - `credits_5`
   - `credits_15`
   - `credits_30`

### Step 5: Create Entitlements

Entitlements define what users can access. DO NOT attach entitlements to consumables.

1. Go to: **Entitlements** (left sidebar)
2. Click **"+ New"**

#### Personal Entitlement:

- **Identifier:** `personal`
- **Description:** `Personal tier access`
- Click **Add**
- Attach products:
  - `com.aiponge.subscription.personal.monthly` (iOS)
  - `com.aiponge.subscription.personal.yearly` (iOS)
  - `personal:personal-monthly` (Android)
  - `personal:personal-yearly` (Android)

#### Practice Entitlement:

- **Identifier:** `practice`
- **Description:** `Practice tier access`
- Click **Add**
- Attach products:
  - `com.aiponge.subscription.practice.monthly` (iOS)
  - `com.aiponge.subscription.practice.yearly` (iOS)
  - `practice:practice-monthly` (Android)
  - `practice:practice-yearly` (Android)

#### Studio Entitlement:

- **Identifier:** `studio`
- **Description:** `Studio tier access`
- Click **Add**
- Attach products:
  - `com.aiponge.subscription.studio.monthly` (iOS)
  - `com.aiponge.subscription.studio.yearly` (iOS)
  - `studio:studio-monthly` (Android)
  - `studio:studio-yearly` (Android)

**Note:** DO NOT attach credit pack products to entitlements. Credits are consumables and handled separately.

### Step 6: Create Offerings

Offerings group products for display in the app.

1. Go to: **Offerings** (left sidebar)
2. Click **"+ New"**

#### Default Offering:

- **Identifier:** `default`
- **Description:** `Standard subscription offering`
- Click **Add**

**Add Packages:**

1. Click on your offering
2. Click **"+ Add Package"**

**Personal Monthly Package:**
- **Identifier:** `$rc_monthly` (standard RevenueCat identifier)
- **Product:** Select personal monthly products (iOS & Android)

**Personal Yearly Package:**
- **Identifier:** `$rc_annual`
- **Product:** Select personal yearly products

**Practice Monthly Package:**
- **Identifier:** `practice_monthly` (custom identifier)
- **Product:** Select practice monthly products

**Practice Yearly Package:**
- **Identifier:** `practice_annual`
- **Product:** Select practice yearly products

**Studio Monthly Package:**
- **Identifier:** `studio_monthly` (custom identifier)
- **Product:** Select studio monthly products

**Studio Yearly Package:**
- **Identifier:** `studio_annual`
- **Product:** Select studio yearly products

3. **Mark as Current:** Click the three dots on your offering → "Make Current"

#### Credit Packs Offering:

1. Click **"+ New"** offering
2. **Identifier:** `credit_packs`
3. **Description:** `Song credit purchases`

**Add Packages:**
- **Package:** `credits_5` → attach 5 credit products
- **Package:** `credits_15` → attach 15 credit products
- **Package:** `credits_30` → attach 30 credit products

### Step 7: Configure Virtual Currency (Optional but Recommended)

For tracking song credits:

1. Go to: **Product Catalog → Virtual Currencies**
2. Click **"+ New virtual currency"**
3. Configure:
   - **Code:** `SONG_CREDITS`
   - **Name:** `Song Credits`
   - **Description:** `Credits for generating AI songs`
4. Click **Add associated product** for each credit pack:
   - `com.aiponge.credits.5` → Grants: `5`
   - `com.aiponge.credits.15` → Grants: `15`
   - `com.aiponge.credits.30` → Grants: `30`

### Step 8: Get API Keys

1. Go to: **Project Settings → API Keys**
2. Copy:
   - **iOS Public API Key:** `appl_XXXXXXXX`
   - **Android Public API Key:** `goog_XXXXXXXX`
3. Store these in your app's environment variables:
   - `EXPO_PUBLIC_REVENUECAT_IOS_KEY`
   - `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`

---

## Testing Checklist

### Before Testing

- [ ] All products created in App Store Connect with status "Ready to Submit"
- [ ] All products created in Google Play Console with status "Active"
- [ ] Products imported to RevenueCat
- [ ] Entitlements created and products attached
- [ ] Offerings configured with packages
- [ ] API keys added to app environment

### iOS Testing

- [ ] Create sandbox tester in App Store Connect
- [ ] Sign out of App Store on device
- [ ] Sign in with sandbox account when prompted
- [ ] Test subscription purchase (instant renewal in sandbox)
- [ ] Verify entitlement granted in RevenueCat dashboard
- [ ] Test credit pack purchase
- [ ] Verify credits added (check virtual currency balance)
- [ ] Test restore purchases
- [ ] Test subscription cancellation

### Android Testing

- [ ] Add test email to License Testing in Play Console
- [ ] Upload app to internal/closed testing track
- [ ] Install from Play Store (not sideload)
- [ ] Test subscription purchase
- [ ] Verify entitlement granted
- [ ] Test credit pack purchase
- [ ] Test restore purchases

### RevenueCat Dashboard Verification

- [ ] Check "Overview" for test transactions
- [ ] Verify customer profiles show correct entitlements
- [ ] Check webhooks are being received (if configured)
- [ ] Verify product pricing displays correctly

---

## Important Notes

1. **RevenueCat does NOT auto-create products** - You must manually configure everything in App Store Connect and Google Play Console first.

2. **Product IDs are permanent** - Once used, they cannot be reused even if deleted.

3. **Entitlements vs Consumables** - Only attach subscriptions to entitlements. Consumable products (credits) should NOT have entitlements.

4. **Testing requires real devices** - Simulators/emulators have limited IAP testing support.

5. **Sandbox purchases are instant** - Subscriptions renew every few minutes in sandbox for testing.

6. **Price changes take time** - Allow up to 24 hours for price changes to propagate.

7. **Screenshots required** - App Store Connect requires paywall screenshots for each product.

---

## Quick Reference: Product ID Summary

| Platform | Product Type | Product ID |
|----------|--------------|------------|
| iOS | Personal Monthly | `com.aiponge.subscription.personal.monthly` |
| iOS | Personal Yearly | `com.aiponge.subscription.personal.yearly` |
| iOS | Practice Monthly | `com.aiponge.subscription.practice.monthly` |
| iOS | Practice Yearly | `com.aiponge.subscription.practice.yearly` |
| iOS | Studio Monthly | `com.aiponge.subscription.studio.monthly` |
| iOS | Studio Yearly | `com.aiponge.subscription.studio.yearly` |
| iOS | 5 Credits | `com.aiponge.credits.5` |
| iOS | 15 Credits | `com.aiponge.credits.15` |
| iOS | 30 Credits | `com.aiponge.credits.30` |
| Android | Personal Monthly | `personal:personal-monthly` |
| Android | Personal Yearly | `personal:personal-yearly` |
| Android | Practice Monthly | `practice:practice-monthly` |
| Android | Practice Yearly | `practice:practice-yearly` |
| Android | Studio Monthly | `studio:studio-monthly` |
| Android | Studio Yearly | `studio:studio-yearly` |
| Android | 5 Credits | `credits_5` |
| Android | 15 Credits | `credits_15` |
| Android | 30 Credits | `credits_30` |

---

## Support Resources

- [App Store Connect Help](https://developer.apple.com/help/app-store-connect/)
- [Google Play Console Help](https://support.google.com/googleplay/android-developer)
- [RevenueCat Documentation](https://www.revenuecat.com/docs)
- [RevenueCat Community](https://community.revenuecat.com)
