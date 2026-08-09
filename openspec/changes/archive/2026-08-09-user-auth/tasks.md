## 1. Database & Dependencies (UA-01, FR-04)

- [x] 1.1 Install `next-auth@5` and `bcryptjs` (+ `@types/bcryptjs`)
- [x] 1.2 Add `User` model to `prisma/schema.prisma` (id, username, password, displayName, createdAt)
- [x] 1.3 Add `userId` field to `Project` model (nullable FK → User)
- [x] 1.4 Run `npx prisma db push` to apply schema changes
- [x] 1.5 Add `NEXTAUTH_SECRET` and `NEXTAUTH_URL` to `.env.local`

## 2. NextAuth Configuration (UA-02, UA-03)

- [x] 2.1 Create `src/auth.ts` — NextAuth config with Credentials provider
- [x] 2.2 Implement `authorize()` callback — query User by username, bcrypt.compare
- [x] 2.3 Configure JWT callbacks — encode userId and username in token
- [x] 2.4 Export `auth`, `signIn`, `signOut` helpers from `auth.ts`

## 3. Registration API (UA-01)

- [x] 3.1 Create `src/app/api/auth/register/route.ts` — POST handler
- [x] 3.2 Validate username (4-20 chars, unique) and password (≥6 chars)
- [x] 3.3 Hash password with bcryptjs and create User record
- [x] 3.4 Auto-login after registration (call signIn)

## 4. Middleware & Route Protection (UA-04)

- [x] 4.1 Create `src/middleware.ts` — protect `/my-projects` and `POST /api/generate`
- [x] 4.2 Redirect unauthenticated users to `/login?callbackUrl=<url>`
- [x] 4.3 Redirect authenticated users away from `/login` and `/register`

## 5. Login & Register Pages (UA-01, UA-02)

- [x] 5.1 Create `src/app/login/page.tsx` — login form (username + password)
- [x] 5.2 Create `src/app/register/page.tsx` — registration form (username + password + confirm)
- [x] 5.3 Add client-side validation (username length, password length, confirm match)
- [x] 5.4 Handle error display (duplicate username, invalid credentials)

## 6. Header User Menu (UA-03)

- [x] 6.1 Create `src/components/UserMenu.tsx` — show username + logout button when logged in
- [x] 6.2 Update layout header to include UserMenu (login/register links when logged out)

## 7. Generate API — User Association (FR-01, FR-04)

- [x] 7.1 Update `POST /api/generate` to extract session userId via `auth()`
- [x] 7.2 Pass userId to `runPipeline()` and store on Project record
- [x] 7.3 Frontend: redirect to `/login` if unauthenticated user tries to generate

## 8. My Projects Page (UA-05, FR-05)

- [x] 8.1 Create `src/app/my-projects/page.tsx` — server component with auth() check
- [x] 8.2 Query projects where `userId = session.user.id`, sorted by updatedAt desc
- [x] 8.3 Render card grid (thumbnail/placeholder + title + creation time)
- [x] 8.4 Implement empty state: "还没有应用，去创建一个吧"
- [x] 8.5 Add search filter (client-side, filter by title)

## 9. Testing & Verification

- [x] 9.1 Test registration → auto-login → home page flow
- [x] 9.2 Test login → generate → verify project has userId
- [x] 9.3 Test /my-projects shows only current user's projects
- [x] 9.4 Test middleware redirects for unauthenticated access
