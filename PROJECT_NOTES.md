# MiniLedger — Project & Architecture Notes

## 1. Architectural Foundations
- **Backend as Source of Truth**: The backend API calculates all loan aggregates, status flags, and overdue amounts directly from PostgreSQL records. No financial totals are computed or hardcoded on the mobile client.
- **Financial Arithmetic**: Monetary values are stored as PostgreSQL `Decimal(12, 2)` to eliminate floating-point precision drift. Within the business logic layer, amounts are converted to integer paise (cents) during calculations and converted back to two decimal places upon serialization.
- **Per-User Isolation**: Every database query is scoped strictly to the authenticated user's ID extracted from the verified JWT `sub` claim. Client-supplied user IDs are never trusted.

## 2. Authentication & Mock OTP Design
- **Development Mock OTP**: A six-digit OTP is generated on `POST /api/auth/request-otp` and printed directly in the backend terminal. The response never returns the OTP.
- **Security & Lifecycle**:
  - OTPs expire after 5 minutes (`OTP_TTL_SECONDS = 300`).
  - Stored with SHA-256 salted hashes and verified using constant-time comparison (`crypto.timingSafeEqual`) to mitigate timing attacks.
  - Maximum 5 attempts allowed (`OTP_MAX_ATTEMPTS = 5`), returning HTTP 429 once exceeded.
  - Invalidate immediately upon successful verification (one-time use).
  - In-memory storage is scoped for local development and assignment demonstrations. In production, Redis with TTL and SMS gateway integration (e.g., Twilio/AWS SNS) should be used.

## 3. Expo & React Native Environment Alignment
- **Root Cause of Dependency Issues**:
  - The project previously experienced mismatched dependencies: an attempt to upgrade to React Native 0.88.0 and unstable Expo packages caused Metro HTTP 500 errors and `react-native/unstable-internals-do-not-use` resolution failures.
  - Additionally, Expo Go reported SDK version mismatch against experimental builds.
- **Resolution**:
  - Aligned dependencies to **Expo SDK 53** with React Native `0.79.6`, React `19.0.0`, `@types/react` `~19.0.10`, and compatible `expo-status-bar` `~2.2.3` and `@react-native-async-storage/async-storage` `2.1.2`.
  - Ran clean installation and verified 18/18 checks pass with `npx expo-doctor` and clean production bundling via Metro.

## 4. Date & Timezone Conventions
- Due dates are stored as PostgreSQL `@db.Date` in `YYYY-MM-DD` ISO format.
- Overdue status is computed using the UTC calendar date (`YYYY-MM-DD`). A loan is marked `OVERDUE` if `dueDate < today` and `outstandingAmount > 0`.
- Fully repaid loans never contribute to the overdue amount.

## 5. Token Storage & Production Considerations
- The mobile app uses `@react-native-async-storage/async-storage` for assignment demo persistence. For production deployment, `expo-secure-store` with Keychain (iOS) and Keystore (Android) should be adopted.
- Receipt photo upload is an optional bonus; the core loan tracking, repayments, calculation engine, and user flows have been prioritized and verified with 100% automated test coverage.
