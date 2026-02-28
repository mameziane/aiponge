# Mobile App Testing Guide - Production Backend

## ✅ Backend Deployment Status

**Production URL:** https://aiponge-mvp-12-aiponge.replit.app

**Backend Health Check:**
- ✅ Status: healthy
- ✅ Uptime: Running
- ✅ Version: 1.0.0

**Services Running:**
- ✅ API Gateway (port 8080)
- ✅ User Service (authentication)
- ✅ System Service (service discovery)

## 📱 Mobile App Testing Steps

### Step 1: Restart Your Mobile App

Since we updated the API URL, you need to restart the Expo app:

1. **Stop the current Expo server** (if running):
   ```bash
   # Press Ctrl+C in the terminal running Expo
   ```

2. **Start Expo again**:
   ```bash
   npm run dev:member-minimal
   # OR if using the full dev script:
   ./dev-full.sh
   ```

3. **On your phone**, refresh the Expo Go app or reload the app (shake device → "Reload")

### Step 2: Test Registration (New User)

1. Open your mobile app on your phone
2. You should see the **Welcome Screen**
3. Tap **"Get Started"**
4. Fill in the registration form:
   - Email: `test@example.com` (or any email)
   - Password: `Test1234!` (or any secure password)
   - Confirm password: Same as above
   - Optional: Phone number (if you want SMS verification)
5. Tap **"Create Account"**

**Expected Result:**
- ✅ Registration succeeds
- ✅ You're redirected to the home screen
- ✅ Token is saved in secure storage

### Step 3: Test Login (Existing User)

1. From the Welcome screen, tap **"Log In"**
2. Enter your credentials:
   - Email: The email you registered with
   - Password: The password you used
3. Tap **"Login"**

**Expected Result:**
- ✅ Login succeeds
- ✅ You're redirected to the home screen
- ✅ Your session persists (if you close and reopen the app)

### Step 4: Test Session Persistence

1. Close your app completely
2. Reopen the app
3. You should be automatically logged in (no need to enter credentials again)

**Expected Result:**
- ✅ App remembers your session
- ✅ You land directly on the home screen
- ✅ No login screen shown

### Step 5: Test Logout

1. Navigate to your profile or settings
2. Find the logout button
3. Tap **"Logout"**

**Expected Result:**
- ✅ You're logged out
- ✅ Redirected to Welcome screen
- ✅ Token is cleared from secure storage

## 🔍 Troubleshooting

### Problem: "Network request failed"

**Causes:**
- Mobile device can't reach the backend URL
- Backend is down

**Solutions:**
1. Test backend from browser on your phone:
   - Open Safari/Chrome on your phone
   - Visit: https://aiponge-mvp-12-aiponge.replit.app/health
   - Should see: `{"status":"healthy",...}`

2. If browser works but app doesn't:
   - Restart Expo app
   - Clear Expo cache: Delete app from phone and reinstall

### Problem: "Invalid credentials" on login

**Cause:**
- User doesn't exist in production database

**Solution:**
- Register a new user first
- Production database is separate from local development database

### Problem: App shows development URL error

**Cause:**
- Old .env cached by Expo

**Solution:**
1. Stop Expo server
2. Clear Metro cache: `npx expo start -c`
3. Reload app on phone

### Problem: Cold start delay (first request slow)

**Cause:**
- Autoscale deployment may "sleep" when idle

**Solution:**
- Normal behavior for Autoscale
- First request takes 3-5 seconds
- Subsequent requests are fast
- Upgrade to Reserved VM for 24/7 uptime (optional)

## 📊 Testing Checklist

Use this checklist to verify everything works:

- [ ] Backend health endpoint responds: https://aiponge-mvp-12-aiponge.replit.app/health
- [ ] Mobile app connects to production URL (no network errors)
- [ ] New user registration works
- [ ] User can log in with registered credentials
- [ ] Session persists after app restart
- [ ] Logout works and clears session
- [ ] Re-login works after logout

## 🎯 Success Criteria

Your mobile authentication is working when:
1. ✅ You can register a new user from your phone
2. ✅ You can log in with those credentials
3. ✅ The session persists (auto-login on app restart)
4. ✅ Logout works correctly

## 🚀 Next Steps After Testing

Once authentication works:
1. Test on multiple devices (iOS, Android)
2. Test with different email formats
3. Test error cases (wrong password, duplicate email)
4. Consider upgrading to Reserved VM if you need 24/7 uptime

## 📝 API Endpoints Available

Your production backend exposes:
- `GET /` - Root health check
- `GET /health` - Detailed health status
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user (requires auth token)
- `POST /api/auth/sms/send-code` - Send SMS verification code
- `POST /api/auth/sms/verify-code` - Verify SMS code

All authenticated endpoints require the `Authorization: Bearer <token>` header.

## 🐛 Report Issues

If you encounter issues:
1. Check the Expo Metro logs in your terminal
2. Check the browser network tab (if testing in Expo web)
3. Test the backend directly: `curl https://aiponge-mvp-12-aiponge.replit.app/health`
4. Check Replit deployment logs in the Deployments tab

Good luck testing! 🎉
