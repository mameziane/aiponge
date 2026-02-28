# Deep Linking Configuration

This directory contains the configuration files for app indexing and deep linking (Universal Links for iOS and App Links for Android).

## Setup Instructions

### For iOS (Apple App Site Association)

1. Replace `TEAMID` in `apple-app-site-association` with your Apple Developer Team ID
2. Host this file at: `https://aiponge.com/.well-known/apple-app-site-association`
3. The file must be served:
   - Without `.json` extension
   - With `Content-Type: application/json`
   - Over HTTPS (no redirects)

### For Android (Asset Links)

1. Replace `REPLACE_WITH_YOUR_APP_SIGNING_KEY_SHA256_FINGERPRINT` with your app signing key SHA256 fingerprint
2. Get your fingerprint using: `keytool -list -v -keystore your-release-key.keystore`
3. Host this file at: `https://aiponge.com/.well-known/assetlinks.json`

## Supported Deep Links

| Path Pattern    | Description                   |
| --------------- | ----------------------------- |
| `/track/:id`    | Open specific track in player |
| `/playlist/:id` | Open playlist view            |
| `/profile/:id`  | View user profile             |
| `/share/:id`    | Shared content view           |
| `/entry/:id`    | View entry details            |
| `/invite/:code` | Handle invite links           |

## Testing

### iOS Testing

```bash
xcrun simctl openurl booted "https://aiponge.com/track/123"
```

### Android Testing

```bash
adb shell am start -a android.intent.action.VIEW -d "https://aiponge.com/track/123"
```

## Expo Router Integration

Deep links are handled by expo-router. Add route handlers in:

- `apps/aiponge/app/track/[id].tsx`
- `apps/aiponge/app/playlist/[id].tsx`
- etc.
