# Validation results

- React/Vite production build: PASS.
- .NET 10 build: PASS, zero warnings and errors.
- Guard checks: 17 PASS (distance, coordinates, accuracy, freshness, JPEG input, office constraints, employee name/email/salary validations).
- Local HTTP API checks: 9 PASS (outside boundary, inaccurate GPS, stale GPS, invalid photo, checkout before checkin, successful checkin, duplicate checkin, successful checkout, history).
- Employee & Salary Sheet API: verified (GET /api/employees, POST /api/employees, PUT /api/employees/{id}, DELETE /api/employees/{id}, GET /api/attendance?user_id=...).
- Browser dashboard rendered and visually reviewed; history navigation worked. Camera and attendance submission were visibly disabled without location verification.
- Test fixtures were removed from the delivered application data folder after testing.

- Live Supabase Integration: PASS. Verified live authentication with Supabase Auth (`superadmin@present.local`, `manager@present.local`, `sarah.connor@present.local`), PostgREST queries for offices (`Krishna Gaushala Jainabad`), employee roster sync (3 employees), private storage photo uploads, and `mark_attendance` advisory lock RPC execution.
- Company-wide Attendance Feed: PASS. When an administrator accesses `/api/attendance` without specifying a `user_id`, the API returns all company attendance records across all employees. Regular users remain strictly scoped to their own attendance records.
- Dual Workspace Panel Rendering: PASS. Fixed panel state evaluation (`isAdminPanel`), ensuring the Executive Overview, Team Attendance, Salary Sheet, Office Geofences, and System Settings views render immediately upon signing in as Super Admin or Manager.
- Persona Roster Sync: PASS. Logged-in user accounts automatically sync name, designation, registered monthly salary, and reference photos from the database employee roster.

## Pending items
Physical mobile device hardware testing remains pending. Cloud static hosting deployment not performed.

## Face verification integration — 30 October 2026

- ASP.NET Core 10 build: PASS, zero compiler warnings/errors.
- React/Vite production build: PASS (`--configLoader native` used for the isolated sandbox copy).
- Guard, identity-binding and face inference checks: 42 PASS using public OpenCV fixtures, no employee data.
- Isolated local HTTP API checks: 18 PASS, including invalid enrollment, same/different/no-face captures, no records for rejected captures, duplicate prevention and checkout matching.
- Release publish: PASS; both model binaries are present and their SHA-256 hashes match the tested sources.
- Fixture cosine scores: identical 1.0000, resized/lighting-adjusted 0.9777, different portrait 0.1815. These are integration checks, not an accuracy estimate.
- Existing Supabase database schema is reused. No cloud writes or production data tests were performed for this change.
- Thresholds remain preliminary; intended-camera calibration and a separately integrated liveness provider are rollout work.
