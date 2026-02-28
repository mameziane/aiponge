# RevenueCat Integration Guide - Aiponge

## Overview

Aiponge uses RevenueCat for cross-platform in-app purchases and subscription management. This document covers the complete implementation.

## 📦 Package Installation

Already installed in `package.json`:

```json
{
  "react-native-purchases": "^9.6.5",
  "react-native-purchases-ui": "^9.6.5"
}
```

## 🔑 API Key Configuration

API keys are stored securely in Replit Secrets:

- `EXPO_PUBLIC_REVENUECAT_IOS_KEY` - iOS API key
- `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` - Android API key

Current key: `test_OoYuuZCdLnIovhBKFOykEpmGvab` (for both platforms)

## 🎯 Entitlement Configuration

**Entitlement Identifiers:**

- `personal` - Grants access to Personal tier features ($9.99/month)
- `practice` - Grants access to Practice tier features ($49/month)
- `studio` - Grants access to Studio tier features ($149/month)

These must match your RevenueCat dashboard configuration. Update in RevenueCat dashboard under:

- Products & Offerings → Entitlements → Create `personal`, `practice`, and `studio`

## 📱 Product IDs

Configure these products in your RevenueCat dashboard and link to the appropriate entitlements:

### Personal Tier (grants `personal` entitlement)

| Billing Period | Product ID                      | App Store/Play Store ID |
| -------------- | ------------------------------- | ----------------------- |
| Monthly        | `subscription_monthly_personal` | Must match store        |
| Yearly         | `subscription_yearly_personal`  | Must match store        |

### Practice Tier (grants `practice` entitlement)

| Billing Period | Product ID                      | App Store/Play Store ID |
| -------------- | ------------------------------- | ----------------------- |
| Monthly        | `subscription_monthly_practice` | Must match store        |
| Yearly         | `subscription_yearly_practice`  | Must match store        |

### Studio Tier (grants `studio` entitlement)

| Billing Period | Product ID                    | App Store/Play Store ID |
| -------------- | ----------------------------- | ----------------------- |
| Monthly        | `subscription_monthly_studio` | Must match store        |
| Yearly         | `subscription_yearly_studio`  | Must match store        |

## 📦 Offerings Configuration

Create three offerings in RevenueCat:

### 1. "personal" Offering

Add 2 packages linked to Personal products:

- `$rc_monthly` → `subscription_monthly_personal`
- `$rc_annual` → `subscription_yearly_personal`

### 2. "practice" Offering

Add 2 packages linked to Practice products:

- `$rc_monthly` → `subscription_monthly_practice`
- `$rc_annual` → `subscription_yearly_practice`

### 3. "studio" Offering (set as Current)

Add 2 packages linked to Studio products:

- `$rc_monthly` → `subscription_monthly_studio`
- `$rc_annual` → `subscription_yearly_studio`

Mark "studio" as the current offering for new users.

## 🏗️ Architecture

### 1. SubscriptionContext (`apps/aiponge/src/contexts/SubscriptionContext.tsx`)

Central subscription management with:

- ✅ SDK initialization with user ID
- ✅ Real-time customer info updates via listener
- ✅ Entitlement checking for tier-specific entitlements (`personal`, `practice`, `studio`)
- ✅ Purchase flow with error handling
- ✅ Restore purchases functionality
- ✅ Comprehensive error mapping

**Usage:**

```typescript
import { useSubscription } from '../contexts/SubscriptionContext';

function MyComponent() {
  const {
    currentTier, // 'guest' | 'explorer' | 'personal' | 'practice' | 'studio'
    tierConfig, // Current tier's feature limits and configuration
    offerings, // Available packages (monthly, yearly)
    customerInfo, // Full customer information
    isLoading, // Loading state
    purchasePackage, // Function to purchase a package
    restorePurchases, // Function to restore previous purchases
    showCustomerCenter, // Function to show subscription management
  } = useSubscription();

  // Check if user has access to a specific tier or higher
  if (currentTier === 'practice' || currentTier === 'studio') {
    // Show practice/studio content
  }

  // Use tierConfig for feature limits
  if (tierConfig.songsPerMonth > 0) {
    // Allow song generation
  }
}
```

### 2. RevenueCat Native Paywall (`apps/aiponge/src/components/RevenueCatPaywall.tsx`)

Uses RevenueCat's built-in Paywall UI:

```typescript
import { RevenueCatPaywall } from '../components/RevenueCatPaywall';

function MyScreen() {
  return (
    <RevenueCatPaywall
      onDismiss={() => console.log('Paywall dismissed')}
      displayCloseButton={true} // or false for hard paywall
    />
  );
}
```

**Features:**

- ✅ Automatically displays current offering
- ✅ Handles purchase flow
- ✅ Handles restore flow
- ✅ Auto-dismisses when purchase completes
- ✅ Configurable close button (for hard vs. soft paywalls)

### 3. Customer Center (`apps/member/src/components/CustomerCenter.tsx`)

Subscription management UI:

```typescript
import { presentCustomerCenter } from '../components/CustomerCenter';

async function showManageSubscription() {
  await presentCustomerCenter();
}
```

**Features:**

- ✅ Subscription status display
- ✅ Manage subscription options
- ✅ Restore purchases
- ✅ Refund requests (iOS)
- ✅ Feedback surveys

### 4. Usage Tracking (`apps/member/src/hooks/useUsageTracking.ts`)

Feature gating based on subscription tier:

```typescript
import { useUsageTracking } from '../hooks/useUsageTracking';

function MusicGeneration() {
  const { checkFeature, incrementUsage, currentTier, tierConfig } = useUsageTracking();

  const handleGenerateSong = async () => {
    // Check if user can generate songs based on their tier limits
    const check = checkFeature('songs');

    if (!check.allowed) {
      // Show upgrade prompt
      alert(check.reason);
      return;
    }

    // Generate song...
    await generateSong();

    // Increment usage counter (tracks against tier limits)
    await incrementUsage('songs');
  };
}
```

## 🔄 Purchase Flow

1. **User taps "Upgrade" button**
2. **Show RevenueCat Paywall** - displays available packages for each tier
3. **User selects package** - monthly or yearly for Personal, Practice, or Studio
4. **RevenueCat handles purchase** - communicates with App Store/Play Store
5. **Purchase completes** - RevenueCat validates and grants tier-specific entitlement
6. **Real-time update** - SubscriptionContext listener updates `currentTier`
7. **UI updates** - app automatically shows tier-appropriate features and limits

## 🔐 Error Handling

Comprehensive error mapping in SubscriptionContext:

```typescript
// Network errors
PURCHASES_ERROR_CODE.NETWORK_ERROR;
PURCHASES_ERROR_CODE.OFFLINE_CONNECTION_ERROR;

// Purchase errors
PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR;
PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR;
PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR;

// Store errors
PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR;

// Configuration errors
PURCHASES_ERROR_CODE.CONFIGURATION_ERROR;
```

All errors show user-friendly alert dialogs with actionable messages.

## 📊 Feature Limits

| Tier                        | Songs/Month | Lyrics/Month | Insights/Month |
| --------------------------- | ----------- | ------------ | -------------- |
| Guest (free, no account)    | 1           | 1            | 0              |
| Explorer (free, registered) | 2           | 4            | 3              |
| Personal ($9.99/mo)         | 15          | 30           | 30             |
| Practice ($49/mo)           | 50          | 100          | Unlimited      |
| Studio ($149/mo)            | 150         | 300          | Unlimited      |

Configured in backend: `packages/services/user-service/src/features/subscriptions/domain/subscription-limits.ts`

## 🧪 Testing

### Test Mode (Current)

Using test API key: `test_OoYuuZCdLnIovhBKFOykEpmGvab`

**Test Features:**

- ✅ No real charges
- ✅ Instant purchase completion
- ✅ All RevenueCat features available
- ✅ Works in Expo Go (Preview API Mode)

### Expo Go Limitations

- Shows mock data only
- Need **development build** for real purchases
- Create development build: `eas build --profile development --platform ios`

### Production Setup

1. Replace test key with production keys in Replit Secrets
2. Create development build or standalone app
3. Test real purchases with sandbox accounts

## 🎨 Customization

### Custom Paywall Screen

Already implemented: `apps/member/src/screens/Paywall.tsx`

- Custom design matching app theme
- Dynamic pricing from RevenueCat
- Conversion-optimized layout

Use either:

- **Custom Paywall** - Your branded design
- **RevenueCat Paywall** - Native UI with zero design work

### Subscription Screen

`apps/member/src/components/SubscriptionTabScreen.tsx`

- Shows current subscription tier and status
- Quick access to upgrade or manage subscription

## 🚀 RevenueCat Dashboard Setup

### 1. Create Products

**iOS (App Store Connect):**

1. Create subscriptions in App Store Connect
2. Note the Product IDs

**Android (Google Play Console):**

1. Create subscriptions in Google Play Console
2. Note the Product IDs

### 2. Configure RevenueCat

1. Go to RevenueCat Dashboard → Projects → Your Project
2. Navigate to **Products**
3. Create products matching your App Store/Play Console IDs:
   - `subscription_monthly_personal` - Personal Monthly
   - `subscription_yearly_personal` - Personal Yearly
   - `subscription_monthly_practice` - Practice Monthly
   - `subscription_yearly_practice` - Practice Yearly
   - `subscription_monthly_studio` - Studio Monthly
   - `subscription_yearly_studio` - Studio Yearly

### 3. Create Offerings

1. Navigate to **Offerings**
2. Create three offerings: `personal`, `practice`, `studio`
3. Add packages to each offering:
   - Package 1: `$rc_monthly` → links to the tier's monthly product
   - Package 2: `$rc_annual` → links to the tier's yearly product
4. Attach the corresponding entitlement to each offering (`personal`, `practice`, or `studio`)

### 4. Set as Current Offering

Mark your preferred offering as "Current" - this is what the app will display by default.

## 📝 Best Practices

### ✅ DO

- Always check `currentTier` and `tierConfig` before gating features
- Use `purchasePackage()` for purchases (handles errors)
- Use `restorePurchases()` for restore (shows user feedback)
- Show `presentCustomerCenter()` for subscription management
- Track usage against tier-specific limits for all tiers
- Test with RevenueCat's test mode first

### ❌ DON'T

- Don't hard-code product IDs in the app
- Don't bypass entitlement checks
- Don't allow usage beyond the tier's configured limits
- Don't show paywall if user is already on the highest needed tier
- Don't use custom purchase flows (let RevenueCat handle it)

## 🐛 Debugging

Enable debug logs:

```typescript
// Already configured in SubscriptionContext for __DEV__ mode
await Purchases.setLogLevel(LOG_LEVEL.DEBUG);
```

**Common Issues:**

| Issue                         | Solution                                                           |
| ----------------------------- | ------------------------------------------------------------------ |
| Paywall shows loading forever | Check API key is configured, check network connection              |
| "No offerings found"          | Verify offering is marked as "Current" in RevenueCat dashboard     |
| Purchase doesn't grant access | Check entitlement ID matches (`personal`, `practice`, or `studio`) |
| Restore doesn't work          | Ensure user is signed in with same Apple/Google account            |

## 📚 Additional Resources

- [RevenueCat Docs](https://www.revenuecat.com/docs)
- [React Native SDK](https://www.revenuecat.com/docs/getting-started/installation/reactnative)
- [Paywalls](https://www.revenuecat.com/docs/tools/paywalls)
- [Customer Center](https://www.revenuecat.com/docs/tools/customer-center)
- [Error Handling](https://www.revenuecat.com/docs/test-and-launch/errors)

## 🎯 Next Steps

1. ✅ RevenueCat SDK installed and configured
2. ✅ Subscription context with tier-based entitlement checking
3. ✅ Native paywall component
4. ✅ Customer center integration
5. ✅ Usage tracking and feature gating per tier
6. ⏳ **TODO:** Configure products in RevenueCat dashboard (personal, practice, studio)
7. ⏳ **TODO:** Set up offerings with tier-specific entitlements
8. ⏳ **TODO:** Test purchase flow for all tiers
9. ⏳ **TODO:** Create production API keys
10. ⏳ **TODO:** Build development/production app for real testing
