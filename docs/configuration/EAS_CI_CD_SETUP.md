# EAS CI/CD Setup Guide

This guide explains how to set up automated builds and deployments using Expo EAS (Expo Application Services).

## Prerequisites

1. Expo account (create at expo.dev)
2. EAS CLI installed: `npm install -g eas-cli`
3. Access to Apple Developer and/or Google Play Console

## EXPO_TOKEN Setup

For CI/CD pipelines, use an access token instead of username/password authentication.

### Generate Access Token

1. Go to [expo.dev/accounts/[your-account]/settings/access-tokens](https://expo.dev/settings/access-tokens)
2. Click "Create Token"
3. Give it a descriptive name (e.g., "Replit CI/CD")
4. Select appropriate permissions:
   - `read:projects` - Read project information
   - `write:projects` - Create builds and updates
5. Copy the generated token immediately (it won't be shown again)

### Add to Replit Secrets

Add the token to your Replit Secrets:

1. Open the Secrets panel in Replit
2. Add a new secret:
   - **Key:** `EXPO_TOKEN`
   - **Value:** `your-generated-token`

### Verify Token Works

```bash
# The token is automatically used when EXPO_TOKEN env var is set
EXPO_TOKEN=your-token eas whoami
```

## Build Commands

### Development Build (Testing)

```bash
cd apps/aiponge
eas build --platform ios --profile development
eas build --platform android --profile development
```

### Preview Build (Internal Testing)

```bash
cd apps/aiponge
eas build --platform ios --profile preview
eas build --platform android --profile preview
```

### Production Build (App Store/Play Store)

```bash
cd apps/aiponge
eas build --platform ios --profile production
eas build --platform android --profile production

# Or build both platforms at once
eas build --platform all --profile production
```

## Submit to App Stores

### iOS Submission

```bash
cd apps/aiponge
eas submit --platform ios --profile production
```

Required credentials in `eas.json`:
- `appleId`: Your Apple ID email
- `ascAppId`: App Store Connect App ID
- `appleTeamId`: Your Apple Developer Team ID

### Android Submission

```bash
cd apps/aiponge
eas submit --platform android --profile production
```

Required:
- `google-service-account.json` file in `apps/aiponge/`
- Configure in `eas.json` under `submit.production.android`

## OTA Updates

For JavaScript-only changes (no native code changes):

```bash
# Push update to production
eas update --branch production --message "Bug fixes and improvements"

# Push update to preview/beta testers
eas update --branch preview --message "Testing new feature"
```

## CI/CD Pipeline Example

### GitHub Actions

```yaml
name: EAS Build

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          
      - name: Install dependencies
        run: npm ci
        
      - name: Install EAS CLI
        run: npm install -g eas-cli
        
      - name: Build iOS
        run: cd apps/aiponge && eas build --platform ios --profile production --non-interactive
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
          
      - name: Build Android
        run: cd apps/aiponge && eas build --platform android --profile production --non-interactive
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
```

### Replit Workflow

Run builds directly from Replit shell:

```bash
# Ensure EXPO_TOKEN is set in Secrets
cd apps/aiponge

# Non-interactive build (for automation)
eas build --platform all --profile production --non-interactive
```

## Troubleshooting

### "Not logged in" Error

Ensure `EXPO_TOKEN` environment variable is set correctly:
```bash
echo $EXPO_TOKEN  # Should show your token
```

### Build Queue Delays

EAS builds are queued. Check status at:
- expo.dev/accounts/[account]/projects/aiponge/builds

Consider EAS Priority builds for faster queue times.

### Credential Issues

Reset credentials if needed:
```bash
eas credentials --platform ios
eas credentials --platform android
```

## Version Management

Before submitting new versions:

1. Update version in `apps/aiponge/app.json`:
   ```json
   {
     "expo": {
       "version": "1.0.1"
     }
   }
   ```

2. Build and submit:
   ```bash
   eas build --platform all --profile production
   eas submit --platform all --profile production
   ```

## Security Best Practices

- Never commit `EXPO_TOKEN` to version control
- Use Replit Secrets or CI/CD secret management
- Rotate tokens periodically
- Use minimal required permissions for tokens
- Keep `google-service-account.json` secure and out of git

---

**Document Version:** 1.0  
**Last Updated:** December 29, 2025
