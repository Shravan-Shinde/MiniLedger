# MiniLedger — Money Lending Tracker

A reliable, full-stack personal finance application built with **React Native (Expo)**, **Node.js**, **Express**, **TypeScript**, and **PostgreSQL (Prisma ORM)**. MiniLedger empowers users to keep track of money lent to friends and family, record full and partial repayments, track overdue debts with clear visual cues, and view real-time calculated financial balances.

---

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [Problem Statement](#2-problem-statement)
3. [Key Features](#3-key-features)
4. [Technology Stack](#4-technology-stack)
5. [System Architecture](#5-system-architecture)
6. [Database Design & Schema](#6-database-design--schema)
7. [Authentication & Mock OTP Lifecycle](#7-authentication--mock-otp-lifecycle)
8. [Financial Calculation Rules](#8-financial-calculation-rules)
9. [REST API Reference](#9-rest-api-reference)
10. [Prerequisites](#10-prerequisites)
11. [PostgreSQL & Docker Setup](#11-postgresql--docker-setup)
12. [Backend Setup & Installation](#12-backend-setup--installation)
13. [Environment Configuration](#13-environment-configuration)
14. [Database Migrations](#14-database-migrations)
15. [Running the Backend](#15-running-the-backend)
16. [Mobile App Setup & Installation](#16-mobile-app-setup--installation)
17. [Expo SDK & Compatibility Notes](#17-expo-sdk--compatibility-notes)
18. [Running on Android Emulator](#18-running-on-android-emulator)
19. [Running on Physical Mobile Device](#19-running-on-physical-mobile-device)
20. [Automated Testing Suite](#20-automated-testing-suite)
21. [Root-Level Convenience Scripts](#21-root-level-convenience-scripts)
22. [Common Troubleshooting](#22-common-troubleshooting)
23. [Security Architecture & Known Limitations](#23-security-architecture--known-limitations)
24. [Optional Bonus: Receipt Upload Design](#24-optional-bonus-receipt-upload-design)
25. [2–3 Minute Demo Recording Script](#25-23-minute-demo-recording-script)

---

## 1. Project Overview
MiniLedger provides a streamlined ledger for informal lending. Whether covering dinner, splitting rent, or helping out friends, it gives users complete visibility over outstanding receivables without awkward misunderstandings or lost calculations.

---

## 2. Problem Statement
Informal lending between friends and family is prone to lost records, forgotten repayment dates, floating-point calculation discrepancies, and awkward reminders. MiniLedger solves this through:
- An intuitive mobile dashboard with instantaneous outstanding and overdue cards.
- Server-authoritative calculations using fixed-precision financial arithmetic.
- Strict per-user data isolation.
- Friction-free phone login with mock OTP verification designed for demonstration.

---

## 3. Key Features
- **Phone Number Login**: Quick sign-in using phone number with a mock 6-digit OTP displayed in the backend server terminal.
- **OTP Safeguards**: 5-minute TTL, constant-time hash comparison, 5-attempt rate limit (HTTP 429), and automatic one-time-use invalidation upon verification.
- **Financial Summary Cards**: Real-time calculated cards for Total Lent, Total Repaid, Outstanding Balance, and Overdue Amount.
- **Loan Tracking & Overdue Highlighting**: Loans are listed chronologically; past-due loans with outstanding balances are prominently highlighted with red badges and styled borders.
- **Repayment Flexibility**: Support for both single-click full balance clearance and custom partial repayments.
- **Quick Date Presets**: Add-loan screen features quick-pick chips (`Today`, `+7 Days`, `+15 Days`, `+30 Days`) alongside format validation.
- **Resend OTP Cooldown**: 30-second interactive countdown timer on the mobile OTP screen.
- **100% Automated Test Coverage**: Comprehensive suite of 60 unit and integration tests covering security, validation, user isolation, database resilience, and multi-loan financial calculation rules.

---

## 4. Technology Stack

| Layer | Technologies |
|---|---|
| **Mobile Client** | React Native, Expo SDK 53, TypeScript, React 19, AsyncStorage |
| **Backend API** | Node.js, Express, TypeScript, Zod, Helmet, CORS, JWT |
| **ORM & Database** | Prisma ORM 6, PostgreSQL 16 (Docker containerized) |
| **Testing** | Vitest, Supertest |
| **Tooling** | Docker Compose, Metro Bundler, TypeScript Compiler (`tsc`) |

---

## 5. System Architecture

```text
       ┌────────────────────────────────────────────────────────┐
       │             MiniLedger React Native App                │
       │    (Expo SDK 53 / Android Emulator / Physical Device)  │
       └──────────────────────────┬─────────────────────────────┘
                                  │
                                  │ HTTPS / REST + Bearer JWT
                                  ▼
       ┌────────────────────────────────────────────────────────┐
       │                 Express TypeScript API                 │
       │                                                        │
       │  ┌─────────────────┐ ┌───────────────┐ ┌────────────┐  │
       │  │  Auth Router    │ │  Loan Router  │ │  Summary   │  │
       │  │ (Mock OTP / JWT)│ │  (CRUD/Repay) │ │  Router    │  │
       │  └────────┬────────┘ └───────┬───────┘ └──────┬─────┘  │
       │           │                  │                │        │
       │  ┌────────┴──────────────────┴────────────────┴─────┐  │
       │  │             Prisma ORM Data Access               │  │
       │  └───────────────────────────┬──────────────────────┘  │
       └──────────────────────────────┼─────────────────────────┘
                                      │
                                      ▼
       ┌────────────────────────────────────────────────────────┐
       │                 PostgreSQL 16 Database                 │
       │      [User] ──< 1:N >── [Loan] ──< 1:N >── [Repayment] │
       └────────────────────────────────────────────────────────┘
```

---

## 6. Database Design & Schema

The relational design enforces referential integrity, cascade deletions, and indexed lookups for user-scoped queries.

### Entity Relationship
```text
┌───────────────────────┐
│         User          │
├───────────────────────┤
│ id (PK, CUID)         │
│ phone (UNIQUE)        │
│ createdAt (TIMESTAMP) │
│ updatedAt (TIMESTAMP) │
└───────────┬───────────┘
            │ 1
            │
            │ N
┌───────────▼───────────┐         1 ┌─────────────────────────┐
│         Loan          ├───────────┤        Repayment        │
├───────────────────────┤           ├─────────────────────────┤
│ id (PK, CUID)         │           │ id (PK, CUID)           │
│ userId (FK -> User)   │         N │ loanId (FK -> Loan)     │
│ friendName (VARCHAR)  │           │ amount (DECIMAL 12,2)   │
│ amount (DECIMAL 12,2) │           │ repaidAt (TIMESTAMP)    │
│ dueDate (DATE)        │           └─────────────────────────┘
│ createdAt (TIMESTAMP) │
│ updatedAt (TIMESTAMP) │
└───────────────────────┘
```

### Prisma Schema (`backend/prisma/schema.prisma`)
```prisma
model User {
  id        String   @id @default(cuid())
  phone     String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  loans     Loan[]
}

model Loan {
  id          String       @id @default(cuid())
  userId      String
  friendName  String
  amount      Decimal      @db.Decimal(12, 2)
  dueDate     DateTime     @db.Date
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  user        User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  repayments  Repayment[]

  @@index([userId, dueDate])
  @@index([userId, createdAt])
}

model Repayment {
  id        String   @id @default(cuid())
  loanId    String
  amount    Decimal  @db.Decimal(12, 2)
  repaidAt  DateTime @default(now())
  loan      Loan     @relation(fields: [loanId], references: [id], onDelete: Cascade)

  @@index([loanId, repaidAt])
}
```

---

## 7. Authentication & Mock OTP Lifecycle

Authentication is intentionally passwordless and tailored for demonstration:
1. **Request OTP (`POST /api/auth/request-otp`)**:
   - Accepts normalized phone number.
   - Generates a random 6-digit integer code.
   - Computes salted SHA-256 hash stored in-memory alongside expiration timestamp.
   - Prints the OTP to the backend terminal:
     ```text
     ========== MiniLedger Mock OTP ==========
     Phone: +919876543210
     OTP: 492015
     Expires in: 300 seconds
     =========================================
     ```
   - Returns generic success message (OTP is **never** leaked via the HTTP response).
2. **Verify OTP (`POST /api/auth/verify-otp`)**:
   - Performs constant-time timing-safe hash comparison (`crypto.timingSafeEqual`).
   - Rejects expired OTPs (5-minute TTL).
   - Enforces 5-attempt limit (returns HTTP 429 when exceeded).
   - Deletes OTP record on success to guarantee single-use.
   - Upserts the user record in PostgreSQL and issues a signed JWT token valid for 7 days.

---

## 8. Financial Calculation Rules

To prevent IEEE 754 binary floating-point roundoff errors (e.g. `0.1 + 0.2 = 0.30000000000000004`), calculations are executed using integer paise (cents) in the backend service:
- **Paise Conversion**: `toCents(rupees) = Math.round(rupees * 100)`
- **Rupee Conversion**: `fromCents(cents) = Number((cents / 100).toFixed(2))`

### Metrics Definition:
1. `totalLent`: Sum of original principal amounts for all loans owned by the user.
2. `totalRepaid`: Sum of all valid repayment transactions recorded across all loans.
3. `outstandingAmount`: Sum of remaining balances (`amount - totalRepaidForLoan`) where remaining balance $> 0$.
4. `overdueAmount`: Sum of outstanding balances for active loans whose `dueDate` is strictly before the current UTC calendar date (`dueDate < today`).
5. `activeLoans`: Count of loans with outstanding balance $> 0$.
6. `repaidLoans`: Count of loans with outstanding balance $= 0$.
7. `totalLoans`: Total number of loan records.

> **Rule on Overdue Repaid Loans**: If a loan is fully repaid, its remaining balance is zero, and it **never** contributes to `overdueAmount`, even if its due date was in the past.

### Specification Verification Scenario:
Given 3 loans:
- **Loan A**: ₹5,000 principal, ₹2,000 repaid, due yesterday (overdue balance = ₹3,000)
- **Loan B**: ₹3,000 principal, ₹0 repaid, due tomorrow (pending balance = ₹3,000)
- **Loan C**: ₹2,000 principal, ₹2,000 repaid, due last week (fully repaid = ₹0)

**Calculated Output:**
- `totalLent`: ₹10,000
- `totalRepaid`: ₹4,000
- `outstandingAmount`: ₹6,000
- `overdueAmount`: ₹3,000
- `activeLoans`: 2
- `repaidLoans`: 1
- `totalLoans`: 3

*(Verified automatically in `backend/tests/api.integration.test.ts`)*

---

## 9. REST API Reference

All protected endpoints require the header: `Authorization: Bearer <JWT_TOKEN>`.

### Endpoints Summary

| Method | Endpoint | Auth | Description | Status Codes |
|---|---|---|---|---|
| `GET` | `/api/health` | No | System health check | `200` |
| `POST` | `/api/auth/request-otp` | No | Request mock OTP for phone | `200`, `400` |
| `POST` | `/api/auth/verify-otp` | No | Verify 6-digit OTP | `200`, `400`, `429` |
| `GET` | `/api/loans` | Yes | List authenticated user's loans | `200`, `401` |
| `GET` | `/api/loans/:id` | Yes | Retrieve a single loan entry by ID | `200`, `401`, `404` |
| `POST` | `/api/loans` | Yes | Create a new loan | `201`, `400`, `401` |
| `POST` | `/api/loans/:id/repay` | Yes | Record repayment (or full balance clearance) | `200`, `400`, `401`, `404` |
| `POST` | `/api/loans/:id/repayments` | Yes | Record a partial repayment | `200`, `400`, `401`, `404` |
| `PATCH` | `/api/loans/:id/repay` | Yes | Mark remaining balance as repaid | `200`, `400`, `401`, `404` |
| `GET` | `/api/summary` | Yes | Financial dashboard summary & counts | `200`, `401` |

### Sample Requests & Responses

#### 1. Request OTP
- **Request**: `POST /api/auth/request-otp`
  ```json
  { "phone": "+919876543210" }
  ```
- **Response** (`200 OK`):
  ```json
  { "message": "OTP generated. Check the backend server terminal." }
  ```

#### 2. Verify OTP
- **Request**: `POST /api/auth/verify-otp`
  ```json
  { "phone": "+919876543210", "otp": "492015" }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "message": "Login successful.",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": { "id": "cm2...", "phone": "+919876543210" }
  }
  ```

#### 3. Create Loan
- **Request**: `POST /api/loans`
  ```json
  {
    "friendName": "Rahul Sharma",
    "amount": 2500,
    "dueDate": "2026-11-15"
  }
  ```
- **Response** (`201 Created`):
  ```json
  {
    "message": "Loan created successfully.",
    "loan": {
      "id": "cm2loankey...",
      "friendName": "Rahul Sharma",
      "amount": 2500,
      "repaidAmount": 0,
      "outstandingAmount": 2500,
      "dueDate": "2026-11-15",
      "createdAt": "2026-10-24T01:00:00.000Z",
      "status": "PENDING",
      "isOverdue": false,
      "repayments": []
    }
  }
  ```

#### 4. Summary
- **Request**: `GET /api/summary`
- **Response** (`200 OK`):
  ```json
  {
    "totalLent": 10000,
    "totalRepaid": 4000,
    "outstandingAmount": 6000,
    "totalOutstandingAmount": 6000,
    "overdueAmount": 3000,
    "totalOverdueAmount": 3000,
    "activeLoans": 2,
    "partiallyRepaidLoans": 1,
    "repaidLoans": 1,
    "fullyRepaidLoans": 1,
    "overdueLoans": 1,
    "totalLoans": 3
  }
  ```

---

## 10. Prerequisites
- **Node.js**: v20 or v22+ (`node -v`)
- **npm**: v10+ (`npm -v`)
- **Docker & Docker Compose**: For containerized PostgreSQL (`docker compose version`)
- **Expo Go App**: Installed on physical Android / iOS phone, or Android Studio Emulator / iOS Simulator.

---

## 11. PostgreSQL & Docker Setup

MiniLedger includes a ready-to-run `docker-compose.yml` for PostgreSQL 16 Alpine:

```yaml
services:
  db:
    image: postgres:16-alpine
    container_name: miniledger-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: miniledger
      POSTGRES_PASSWORD: miniledger_dev_password
      POSTGRES_DB: miniledger
    ports:
      - "5432:5432"
    volumes:
      - miniledger_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U miniledger -d miniledger"]
      interval: 5s
      timeout: 3s
      retries: 10
volumes:
  miniledger_pgdata:
```

### Option A — Embedded Native PostgreSQL 16 (Recommended / No Docker Required):
MiniLedger includes a pre-configured native embedded PostgreSQL 16 binary service that runs directly on Windows without requiring Docker Desktop:
```bash
npm run db:local
```
This initializes and starts PostgreSQL 16 on `localhost:5432`, creates the `miniledger` database, and persists data inside `backend/.pgdata`.

### Option B — Containerized PostgreSQL 16 (Docker Compose):
If you have Docker Desktop running:
```bash
# Start PostgreSQL container in background:
npm run db:up

# Stop PostgreSQL container safely (data preserved in named volume):
npm run db:down
```

### Database Readiness & Health Check:
The API features an active database health check at `GET /api/health`:
- When PostgreSQL is connected: returns HTTP 200 with `{ status: "ok", database: "connected", service: "miniledger-api", timestamp: "..." }`.
- When PostgreSQL is disconnected: returns HTTP 503 with `{ status: "degraded", database: "disconnected", service: "miniledger-api", error: "Database service unavailable." }`.
- When database errors occur during request processing, the centralized error handler returns structured HTTP 503 (`DATABASE_UNAVAILABLE`) responses without leaking secrets, credentials, or stack traces.
- OTP preservation: If a database error occurs during OTP verification, the OTP is not prematurely consumed or deleted, allowing the user to retry once the database recovers while continuing to enforce rate limits.

---

## 12. Backend Setup & Installation

```bash
cd backend
npm install
```

---

## 13. Environment Configuration

### Backend Environment (`backend/.env`):
Copy the example template:
```bash
cp backend/.env.example backend/.env
```
Ensure the values match your database setup:
```env
DATABASE_URL="postgresql://miniledger:miniledger_dev_password@localhost:5432/miniledger?schema=public"
JWT_SECRET="miniledger_dev_super_secret_jwt_key_2026_at_least_24_chars_long"
PORT=5000
NODE_ENV=development
OTP_TTL_SECONDS=300
OTP_MAX_ATTEMPTS=5
CORS_ORIGIN=*
```

### Mobile Environment (`mobile/.env`):
Copy the example template:
```bash
cp mobile/.env.example mobile/.env
```
Choose the URL matching your device:
```env
# 1. Physical Device on Local Wi-Fi (Primary):
EXPO_PUBLIC_API_URL=http://10.250.154.196:5000/api

# 2. Android Emulator (Standard Android loopback to host):
# EXPO_PUBLIC_API_URL=http://10.0.2.2:5000/api

# 3. iOS Simulator / Web:
# EXPO_PUBLIC_API_URL=http://localhost:5000/api
```

---

## 14. Database Migrations

Apply the migration schema to create the `User`, `Loan`, and `Repayment` tables:
```bash
cd backend
npx prisma migrate deploy
npx prisma generate
```

To view or explore the database records via UI:
```bash
npx prisma studio
```

---

## 15. Running the Backend

Start the development server with live reload:
```bash
cd backend
npm run dev
```
The API is available at `http://localhost:5000`. Verify with:
```bash
curl http://localhost:5000/api/health
```

---

## 16. Mobile App Setup & Installation

```bash
cd mobile
npm install
```

---

## 17. Expo SDK & Compatibility Notes

### Diagnostic Audit & Resolution
- **Prior Issue**: The project previously experienced severe dependency conflicts caused by an accidental upgrade attempt to React Native `0.88.0` and experimental Expo packages, leading to:
  - Metro returning `HTTP 500`.
  - Bundler failure: `Cannot resolve react-native/unstable-internals-do-not-use`.
  - Expo Go warning: *Installed application uses a different SDK from the project*.
- **The Fix**: The dependency tree was repaired and aligned to **Expo SDK 53** with officially supported and pinned peer versions:
  - `expo`: `~53.0.27`
  - `react-native`: `0.79.6`
  - `react`: `19.0.0`
  - `@types/react`: `~19.0.10`
  - `expo-status-bar`: `~2.2.3`
  - `@react-native-async-storage/async-storage`: `2.1.2`
  - `typescript`: `~5.8.2`
- **Verification**:
  - `npx expo-doctor`: **18/18 checks passed. No issues detected!**
  - Metro production bundling: **100% successful** for both Android (`.hbc`) and iOS (`.hbc`).
  - TypeScript type check: **0 errors**.

---

## 18. Running on Android Emulator

1. Start your Android Emulator in Android Studio.
2. In `mobile/.env`, ensure:
   ```env
   EXPO_PUBLIC_API_URL=http://10.0.2.2:5000/api
   ```
3. Start the Expo bundler:
   ```bash
   cd mobile
   npx expo start --clear
   ```
4. Press `a` in the terminal to launch the app on the emulator.

---

## 19. Running on Physical Mobile Device

1. Connect your phone and computer to the **same Wi-Fi network**.
2. Your computer's reachable LAN IP (e.g. `10.250.154.196`):
   - Windows: `ipconfig` (IPv4 Address)
   - macOS / Linux: `ifconfig` or `ip a`
3. Set `mobile/.env`:
   ```env
   EXPO_PUBLIC_API_URL=http://10.250.154.196:5000/api
   ```
4. Start Expo:
   ```bash
   cd mobile
   npx expo start --clear
   ```
5. Open the **Expo Go** app on your phone and scan the QR code displayed in the terminal.

---

## 20. Automated Testing Suite

The backend contains automated unit and integration tests covering business calculations, input validation, authentication, rate limiting, and user isolation.

### Running the Test Suite:
```bash
cd backend
npm test
```

### Test Suite Results:
```text
 ✓ tests/money.test.ts (2 tests)
 ✓ tests/schemas.test.ts (4 tests)
 ✓ tests/app.unit.test.ts (29 tests)
 ✓ tests/api.integration.test.ts (25 tests)

 Test Files  4 passed (4)
      Tests  60 passed (60)
   Duration  4.34s
```

### Coverage Highlights:
- **`GET /api/health`**: Health status and uptime payload.
- **OTP Request & Validation**: Valid/invalid phone formats, terminal output without response leakage.
- **OTP Verification & One-Time Use**: Token generation, single-use invalidation, rejection of reused OTPs.
- **OTP Expiration**: Rejection of expired OTPs.
- **Attempt Limiting**: Enforcing 5 maximum attempts with HTTP 429 response.
- **Authentication Middleware**: 401 on missing, malformed, or expired JWTs.
- **Loan Creation & Listing**: Friendly names, positive amounts, calendar date validation.
- **User Isolation**: Verification that User B cannot see or repay User A's loan (returns 404).
- **Repayments**: Partial payments, overpayment rejection, full repayment via PATCH, rejection of repayments on fully settled loans.
- **Specification Financial Calculations**: Verifying Loan A (₹5000/₹2000 overdue), Loan B (₹3000/₹0 pending), Loan C (₹2000/₹2000 repaid) yield exactly:
  - Total Lent: ₹10,000
  - Total Repaid: ₹4,000
  - Outstanding: ₹6,000
  - Overdue: ₹3,000
  - Active: 2 | Repaid: 1 | Total: 3

---

## 21. Root-Level Convenience Scripts

For streamlined development, root scripts are provided:

```bash
# Start local embedded PostgreSQL 16 (Native binary, zero Docker requirement)
npm run db:local

# Start PostgreSQL database container (Docker Compose)
npm run db:up

# Run Prisma database migrations
npm run db:migrate

# Start backend dev server
npm run dev:backend

# Build backend for production
npm run build:backend

# Run production backend server
npm run start:backend

# Start mobile Expo bundler
npm run start:mobile

# Run backend automated tests (58 tests)
npm run test:backend

# Run mobile TypeScript checks as test
npm run test:mobile

# Run all test suites
npm run test:all

# Run TypeScript checks across mobile and backend
npm run typecheck:mobile
npm run typecheck:backend

# Run Expo dependency doctor
npm run doctor:mobile

# Stop PostgreSQL container safely
npm run db:down
```

---

## 22. Common Troubleshooting

### 1. Metro Bundler Cache Issues
If you encounter caching errors after changing dependencies:
```bash
cd mobile
npx expo start --clear
```

### 2. Port 5432 Conflict
If another PostgreSQL instance is running on port 5432:
- Check existing containers: `docker ps`
- Stop conflicting container or service: `docker stop <competing_container>`
- Start MiniLedger's container: `docker compose up -d db`

### 3. Phone Cannot Reach Backend (Network Timeout)
- Ensure your phone and development computer are connected to the exact same Wi-Fi network.
- Ensure Windows Defender / Firewall allows incoming connections on port 5000.
- Verify `EXPO_PUBLIC_API_URL` uses your machine's LAN IP (`http://192.168.x.x:5000/api`), not `localhost`.

---

## 23. Security Architecture & Known Limitations

- **Assignment Demonstration Context**: This project is built as an internship technical demonstration.
- **In-Memory Mock OTP**: OTPs are generated and printed to the terminal. In production, integrate an SMS gateway provider (e.g. Twilio, AWS SNS) and back the OTP store with Redis TTL keys.
- **Token Storage**: JWT tokens are stored in `AsyncStorage` for demo simplicity. Production deployments should use platform-level hardware secure storage (`expo-secure-store` with iOS Keychain and Android Keystore).
- **Sensitive Credentials**: All environment credentials are kept in `.env` files which are excluded from Git tracking via `.gitignore`.

---

## 24. Optional Bonus: Receipt Upload Design

The core lending, calculations, and mobile interfaces were prioritized and perfected. For receipt photos, the recommended architectural design is:
1. **Frontend**: Use `expo-image-picker` to capture or select a photo.
2. **Transfer**: Upload via `multipart/form-data` with JWT authentication to `POST /api/loans/:id/receipt`.
3. **Backend Storage**: Store the image on disk in a private directory (or S3/Cloud Storage bucket) and save only the relative path/URI in a `receiptUrl` column in PostgreSQL. Large binary BLOBs must never be stored directly in PostgreSQL.
4. **Access Control**: Serve via authenticated stream `GET /api/loans/:id/receipt` ensuring only the owner of the loan can download or view the receipt.

---

## 25. 2–3 Minute Demo Recording Script

Use this structured script when recording your screen recording using **Loom**, **OBS**, or **Google Drive**:

| Timestamp | Screen / Action | Narration & Visual Points |
|---|---|---|
| **0:00 – 0:25** | **Architecture Overview** | Briefly show VS Code with the project structure: `backend` (TypeScript + Express + Prisma + PostgreSQL) and `mobile` (React Native Expo SDK 53). Mention the running PostgreSQL Docker container. |
| **0:25 – 0:50** | **Authentication & Mock OTP** | Open the mobile app. Enter a phone number (e.g. `+91 9876543210`). Tap **Send Mock OTP**. Switch to backend terminal to show the printed 6-digit OTP. Enter the OTP into the app and tap **Verify and Continue**. |
| **0:50 – 1:20** | **Dashboard & Summary Cards** | Show the dashboard: Outstanding balance hero card, along with Total Lent, Total Repaid, Overdue, and Fully Repaid cards. Explain that calculations are computed strictly by PostgreSQL and the backend API. |
| **1:20 – 1:50** | **Adding a Loan** | Tap **＋ Add Loan**. Enter Friend's Name (*"Rahul"*), Amount (*"₹5000"*), and use the quick preset chip (*"+7 Days"*). Save the loan. Show the new loan appearing in the list with `PENDING` status and updated dashboard totals. |
| **1:50 – 2:20** | **Repayment Flow** | Tap **Record Repayment** on a loan. Show the modal with balance breakdown. Record a partial repayment (e.g. ₹2,000). Show remaining balance reducing to ₹3,000 and Total Repaid updating. Tap **Mark Entire Balance as Repaid** to show status change to `REPAID`. |
| **2:20 – 2:45** | **Overdue Highlighting** | Add a loan with a past due date (e.g. yesterday). Show the loan card highlighted with a red border, overdue badge, and overdue amount reflected on the red summary card. |
| **2:45 – 3:00** | **Automated Tests & Wrap-Up** | Switch to the terminal. Run `npm run test:backend` to demonstrate all 29 automated tests passing in seconds. Conclude with submission readiness. |
