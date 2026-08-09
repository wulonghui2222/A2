## Context

The A2 Atoms Demo currently has no authentication system. All projects exist without ownership,
and any visitor can generate applications. The database uses Prisma with SQLite, and the app
runs on Next.js 15 App Router. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- User registration and login with username/password
- JWT session management via httpOnly cookie
- Route protection via Next.js middleware
- "My Projects" page showing the current user's projects as a card grid
- Associate new projects with their creating user (userId on Project)

**Non-Goals:**
- OAuth / social login (can be added later as a NextAuth provider extension)
- Email verification or password reset
- Role-based access control (RBAC)
- Multi-tenancy or team workspaces
- Rate limiting on auth endpoints (acceptable for demo)

## Decisions

### 1. Auth Library: NextAuth.js (Auth.js v5)

**Choice**: `next-auth@5` (Auth.js)

**Rationale**: First-class Next.js App Router integration, middleware support, JWT strategy
built in. Supports Credentials provider out of the box. Easy to extend with OAuth providers later.

**Alternatives considered**:
- Custom JWT with `jose`: more control but requires building session management, CSRF, middleware from scratch
- Lucia Auth: lightweight but less mature ecosystem
- Clerk / Auth0: external dependency, overkill for demo

### 2. Password Hashing: bcryptjs

**Choice**: `bcryptjs` (pure JS) over `bcrypt` (native)

**Rationale**: No native build dependencies, works on all platforms including Windows without
compilation. Performance difference is negligible for a demo app.

### 3. Session Strategy: JWT in httpOnly Cookie

**Choice**: Stateless JWT tokens managed by NextAuth, stored in httpOnly cookie

**Rationale**: Stateless (no session table needed), works well with Vercel serverless.
HttpOnly cookie prevents XSS-based session theft.

### 4. Database Changes: User Table + Project.userId

```
User
├── id          String   @id @default(uuid())
├── username    String   @unique
├── password    String   (bcrypt hash)
├── displayName String?
├── createdAt   DateTime @default(now())
└── projects    Project[]

Project (MODIFIED)
├── ... existing fields ...
└── userId      String?  (FK → User, nullable for backward compat)
```

`userId` is nullable to preserve existing anonymous projects without migration issues.

### 5. Route Protection: Next.js Middleware

**Choice**: `middleware.ts` at project root using `next-auth`'s `auth()` helper

Protected routes: `/my-projects`, `POST /api/generate`
Public routes: `/`, `/login`, `/register`, `/projects/:id`, `GET /api/generate/*/status`

### 6. Architecture Overview

```
┌───────────────────────────────────────────────────────────┐
│                      Browser                              │
│  httpOnly cookie (JWT)                                    │
└──────────────────────┬────────────────────────────────────┘
                       │
              ┌────────▼────────┐
              │  middleware.ts   │  ← auth() check
              │  /my-projects    │  → redirect to /login
              │  POST /api/gen   │  → 401 or redirect
              └────────┬────────┘
                       │
        ┌──────────────▼──────────────┐
        │      NextAuth.js v5         │
        │                             │
        │  auth.ts    → config        │
        │  /api/auth  → auto routes   │
        │  Credentials Provider       │
        │    → authorize() queries    │
        │      User table (bcrypt)    │
        └──────────────┬──────────────┘
                       │
        ┌──────────────▼──────────────┐
        │       Prisma + SQLite       │
        │                             │
        │  User table (NEW)           │
        │  Project.userId (NEW FK)    │
        └─────────────────────────────┘
```

### 7. File Structure (New Files)

```
src/
├── auth.ts                          ← NextAuth config + Credentials provider
├── middleware.ts                    ← Route protection
├── app/
│   ├── login/page.tsx               ← Login form
│   ├── register/page.tsx            ← Registration form
│   ├── my-projects/page.tsx         ← Card grid of user's projects
│   └── api/
│       └── auth/register/route.ts   ← Registration API
└── components/
    └── UserMenu.tsx                 ← Header user state + logout
```

## Risks / Trade-offs

- **[SQLite concurrent auth]** → Negligible for demo scale; no mitigation needed
- **[No password reset]** → Users can be recreated during demo; acceptable limitation
- **[JWT token size]** → Only stores userId + username, well under cookie size limits
- **[Backward compat]** → Existing projects have `userId: null`; they won't appear in any user's "My Projects" (expected behavior)
