# Scripts Guide - Simple & Clean

## 📋 Available Scripts (4 total)

### 🚀 For Daily Development

#### `./start-dev.sh`

**Start local development environment**

Starts everything you need for development:

- All 8 backend services
- Mobile app with Expo
- Development database

```bash
./start-dev.sh
```

**When to use:**

- Starting your development session
- First time running the app
- After pulling code changes

---

#### `./restart.sh`

**Clean restart when things get stuck**

Kills all processes and starts fresh:

- Clears caches
- Kills stuck processes
- Restarts everything cleanly

```bash
./restart.sh
```

**When to use:**

- Metro bundler is stuck
- Services not responding
- Port conflicts
- "Something weird is happening"

---

### 🎯 For Production

#### `prod-start.sh`

**Production deployment startup**

Starts minimal essential services for production:

- API Gateway (port 8080)
- User Service
- System Service

```bash
# You don't run this manually - Replit deployment uses it
```

**When to use:**

- Automatically used by Replit deployment
- Don't run this manually

---

### 📱 For Native Builds (Optional)

#### `create-dev-build.sh`

**Create Expo development build**

Creates a native development build for iOS/Android.

```bash
./create-dev-build.sh
```

**When to use:**

- When you need native modules
- Testing on physical device without Expo Go
- Building for TestFlight/internal distribution

**Note:** Only needed if you outgrow Expo Go. For most development, use `start-dev.sh` with Expo Go.

---

## 🎯 Quick Reference

| Task                     | Command                                       |
| ------------------------ | --------------------------------------------- |
| **Start development**    | `./start-dev.sh`                              |
| **Restart when stuck**   | `./restart.sh`                                |
| **Test on phone**        | Run `start-dev.sh`, then open Expo Go         |
| **Deploy to production** | Click "Publish" button (uses `prod-start.sh`) |

---

## 🔧 What Each Script Does Internally

### start-dev.sh

```
1. Starts Redis cache
2. Starts system-service (service discovery)
3. Starts API Gateway + 7 microservices
4. Starts mobile app with Expo Metro bundler
```

### restart.sh

```
1. Kills all node/tsx processes
2. Clears Metro cache
3. Clears Expo cache
4. Runs start-dev.sh
```

### prod-start.sh

```
1. Sets NODE_ENV=production
2. Starts Redis cache
3. Starts only 3 essential services:
   - API Gateway
   - User Service (auth)
   - System Service (discovery)
```

---

## 📝 .replit File Update Needed

**Manual update required** (I can't edit .replit automatically):

Open `.replit` and change these 3 lines:

**Line 7:** Change `./dev-full.sh` to `./start-dev.sh`
**Line 40:** Change `./dev-full.sh` to `./start-dev.sh`
**Line 50:** Change `./restart-dev.sh` to `./restart.sh`

This makes the Replit "Run" button use the new script names.

---

## ✅ Scripts Removed

The following obsolete scripts were deleted:

- ❌ `dev-full-with-tunnel.sh` - ngrok tunneling (replaced by production deployment)
- ❌ `setup-cloudflare-tunnel.sh` - Cloudflare tunnel (never used)
- ❌ `start-backend-tunnel.sh` - localtunnel (replaced by production deployment)
- ❌ `member.sh` - duplicate functionality
- ❌ `check-build.sh` - not actively used
- ❌ `TEST_BACKEND_NOW.sh` - temporary testing script

These were created during troubleshooting and are no longer needed.

---

## 🎓 Why This Naming Scheme?

**Old naming:**

- `dev-full.sh`, `dev-full-with-tunnel.sh` - confusing prefixes
- `restart-dev.sh` - redundant "-dev"
- Multiple tunnel scripts - which one to use?

**New naming:**

- `start-dev.sh` - clear action + purpose
- `restart.sh` - simple, obvious
- `prod-start.sh` - clearly for production
- No confusion!

---

## 💡 Pro Tips

1. **99% of the time, you only need:** `./start-dev.sh`

2. **When Metro is slow:** First time builds take 2-5 minutes. Subsequent builds are faster (20-30 seconds).

3. **When services crash:** Use `./restart.sh` instead of manually killing processes.

4. **Production testing:** Your mobile app connects to production (`https://aiponge-mvp-12-aiponge.replit.app`), not local backend.

5. **Port conflicts:** `restart.sh` kills everything cleanly, preventing port conflicts.

---

**TL;DR: Use `./start-dev.sh` for development. That's it!** 🚀
