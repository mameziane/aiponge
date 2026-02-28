# User Service

Unified service combining User Authentication, Profiles, and User Intelligence (Entries/Insights).

## Architecture

This is a **modular monolith** with three bounded contexts:

1. **Auth Module** - User authentication, accounts
2. **Profile Module** - User profiles, onboarding  
3. **Intelligence Module** - Entries, insights, reflections, analytics

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architecture documentation.

## Quick Start

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Run production build
npm start
```

## Database Setup

```bash
# Push schema changes to database
npm run db:push

# Force push (if conflicts)
npm run db:push:force
```

## API Endpoints

### Auth Module
- `POST /api/users/register` - Register new user
- `POST /api/users/login` - Authenticate user
- `GET /api/users/:id` - Get user details
- `POST /api/invitations` - Create invitation

### Profile Module
- `GET /api/profiles/:userId` - Get user profile
- `PUT /api/profiles/:userId` - Update profile
- `GET /api/profiles/:userId/summary` - Get profile summary

### Intelligence Module
- `POST /api/entries` - Create entry
- `GET /api/entries/:userId` - Get user entries
- `GET /api/entries/id/:id` - Get entry by ID
- `PATCH /api/entries/:id` - Update entry
- `DELETE /api/entries/:id` - Delete entry
- `GET /api/entries/:entryId/illustrations` - Get entry illustrations
- `POST /api/entries/:entryId/illustrations` - Add illustration
- `GET /api/insights/:userId` - Get user insights
- `GET /api/insights/entry/:entryId` - Get insights by entry

## Port Configuration

Default port: **3020** (from services.config.ts)

## Migration Status

- [x] Service structure created
- [x] Package configuration
- [ ] Auth module implementation
- [ ] Profile module implementation
- [ ] Intelligence module implementation
- [ ] Database schema migration
- [ ] API Gateway routing update
- [ ] Integration tests
- [ ] Production deployment
