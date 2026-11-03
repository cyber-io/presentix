# Present — photo and location attendance

React 19 + Vite frontend, ASP.NET Core 10 API, Supabase Auth/Postgres/private Storage.
Photo and location attendance with server-side face verification.

## Run the local demo

Prerequisites: Node.js 22.12+ and .NET SDK 10. Installed dependencies are available in this working copy; on another machine run `npm ci` in `frontend`.

From this project directory, run `./start-demo.sh` to build and start both servers. Press Ctrl+C to stop them. Alternatively, use two terminals:

Terminal 1:
```sh
cd backend
ASPNETCORE_ENVIRONMENT=Development DemoMode=true dotnet run --urls http://127.0.0.1:5080
```
Terminal 2:
```sh
cd frontend
npm run dev
```
Open http://127.0.0.1:5173. Demo mode is explicitly labeled, uses one local administrator, and is forbidden outside the Development environment. Demo records and private photos persist in `backend/data/` and are excluded from Git. Do not expose this demo server to a network. There are no fabricated attendance records or default office coordinates.

1. Open **Locations → Add location** and enter your actual workplace centre, address and radius (20–1,000 metres).
2. On **Overview**, select the office and choose **Verify my location**.
3. Allow browser location access. The entire GPS uncertainty radius must fit inside the office boundary; accuracy must be at most 100 metres.
4. Open the camera, capture a photo, and confirm check-in. Use the same flow to check out.
5. Review **My attendance**, filter by month/activity, or export CSV.

Desktop GPS can be inaccurate. A phone with precise location enabled is usually more suitable. Production requires HTTPS for location and camera access. The API verifies the captured face against the employee’s registered reference using YuNet detection and SFace recognition. Browser-reported location and photos remain evidence; face matching does not provide liveness detection or prevent GPS spoofing.

## Face match and mismatch

Face recognition now runs on the .NET server using the bundled YuNet/SFace models. The browser’s colour/pattern comparison has been removed. Register a clear JPEG face photo from the administrator employee form; both check-in and check-out are compared with that reference. Poor images request a retake, uncertain scores request review, and mismatches cannot create attendance records. New or changed reference photos are validated before saving.

The project selects the OpenCvSharp native runtime for macOS ARM64/x64, Windows ARM64/x64, and glibc Linux ARM64/x64. Models and licenses are copied into build/publish output. No Supabase schema change is needed. The existing employee reference-photo column is reused.

The thresholds in `backend/appsettings.json` are preliminary, and no liveness provider is configured. See [FACE_VERIFICATION.md](FACE_VERIFICATION.md) for setup, response formats, calibration, and repeatable tests.

## Connect Supabase

1. Create a new Supabase project. Run `database/schema.sql` in its SQL editor. This schema is for a fresh project, not a migration of the insecure starter schema found in Downloads.
2. Create employee accounts in Supabase Authentication. This app intentionally has no public sign-up.
3. Assign an administrator using Supabase's trusted admin API/app metadata: `app_metadata.role = "admin"`. User-editable metadata is not used for authorization.
4. Set backend environment variables (keep the service role key server-side):
```sh
export Supabase__Url='https://YOUR_PROJECT.supabase.co'
export Supabase__ServiceRoleKey='YOUR_SERVER_ONLY_SERVICE_ROLE_KEY'
export FrontendOrigin='http://127.0.0.1:5173'
export DemoMode=false
dotnet run --project backend --urls http://127.0.0.1:5080
```
5. Copy `frontend/.env.example` to `frontend/.env.local`. Enter the same project's URL and its public anon key, then restart Vite. Never use the service role key in a `VITE_` variable.
6. Sign in as your administrator and define the office locations. Employees can see locations and their own attendance; only administrators can add offices.

The API checks the bearer token with Supabase Auth for every protected request. Database tables have RLS enabled and direct anonymous/authenticated browser access is revoked. The backend service role owns database operations; photos use a private bucket. See [Supabase private storage guidance](https://supabase.com/docs/guides/storage/buckets/fundamentals) and [server-side auth guidance](https://supabase.com/docs/guides/auth/server-side/advanced-guide).

## Validation

```sh
npm --prefix frontend run build
dotnet build backend
dotnet run --project tests
```
`tests/api_smoke.py` uses Python + Pillow and public OpenCV fixture portraits to exercise a running **empty demo** API. Run it with the local server origin and fixture directory as its two arguments. It intentionally writes fixture employees, one office and two records. Stop the server and remove only that test-generated `backend/data` directory after an isolated test run. Do not run it against real data.

## Production deployment

Build `frontend` with `npm ci && npm run build` and serve `frontend/dist` on an HTTPS static host. Set `VITE_API_URL` before building if the API uses a separate origin. Deploy `dotnet publish backend -c Release -o publish` to a .NET-capable host, configure the Supabase secrets and exact `FrontendOrigin`, and leave `DemoMode=false`. Terminate HTTPS at your hosting proxy and set request/upload limits. Sites hosting does not support this .NET backend, so no Site deployment was created.

## Implemented

- Supabase email/password login and logout; authenticated identity comes from the server.
- Administrator office creation with fixed coordinates and radius.
- Location freshness, accuracy and distance checks on client and server.
- Location-gated live camera, JPEG capture, retake and private storage.
- Check-in/check-out sequence enforcement, including database advisory locking across API instances.
- Server timestamps, personal history, month/type filters, CSV export, responsive UI.
- **Dual Workspace Architecture (Admin Panel & User Panel)**:
  - **Admin Panel**:
    - **Executive Overview**: Total employees, total monthly payroll, company-wide attendance feed, and quick management actions.
    - **Team Attendance & Payroll**: Inspect any single employee's attendance and calculate their payable salary for any month.
    - **Employee Salary Sheet**: Manage employee salaries in the sheet, add employees, edit salaries, and import/export CSV.
    - **Office Geofences**: Add and configure office coordinates, radiuses, and addresses.
    - **System Settings**: Administrative controls and system configurations.
  - **User (Employee) Panel**:
    - **Mark Attendance**: Verify GPS location, live camera capture or photo upload, check-in and check-out confirmation.
    - **My Attendance**: Personal verified check-in history, month filter, and personal CSV export.
    - **My Salary & Pay Slip**: Personal monthly salary breakdown for any selected month (base salary, days present, daily rate, payable amount, and CSV slip download).
    - **My Workplaces**: Permitted workplace geofences and office locations.
    - **My Profile**: Employee designation, registered salary, and personal details.
  - **Live Switcher**: Instant switching between Admin Panel and User Panel, including employee emulation in Demo Mode.
- Explicit persistent local demo; no silent fallback when Supabase fails.

## Remaining rollout work

The live Supabase path needs integration testing with your project; no credentials or cloud resources were available during implementation. Test location/camera permissions on intended mobile browsers. Decide photo-retention policy, account provisioning/password-reset workflow, office edit/archive requirements, and whether attendance reports need a fixed business timezone. History currently loads the latest 1,000 records, and the month filter uses your browser’s local timezone. Production photo-review UI, team-wide admin reporting, offline check-ins, leave scheduling and anti-spoofing are not implemented. Face matching is implemented; its preliminary thresholds still require calibration on intended cameras and lighting. GPS/photo inputs are client-controlled; a stronger attendance assurance model needs trusted device attestation or another on-site factor.
