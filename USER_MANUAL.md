# SHMMF User Manual

## 1) What This System Does

SHMMF (Shareholders Meeting Management Framework) is an AGM operations platform for:

- Shareholder registration and management
- Candidate registration and nomination voting
- Attendance marking and approval (maker-checker capable)
- Vote encoding and approval (maker-checker capable)
- Agenda management (including active agenda in discussion)
- Audit logs for traceability
- Dashboard analytics (quorum, weighted votes, agenda status)

It is designed to run locally and can be hosted on a LAN for offline office use.

---

## 2) Roles and Permissions

- `SUPER_ADMIN`
  - Full access
  - Can access Settings
  - Can export reports
  - Can reset AGM session data
- `ATTENDANCE_MAKER`
  - Marks attendance
- `ATTENDANCE_CHECKER`
  - Approves/rejects attendance
- `VOTE_ENCODER`
  - Encodes votes
- `VOTE_CHECKER`
  - Approves/rejects votes
- `GUEST`
  - Limited/non-admin visibility

Default local users (password: `admin1234`) are seeded on first run.

---

## 3) Main Pages

### Dashboard
- Top KPI cards for shareholder statistics
- Quorum progress
- Today’s agenda list (with active agenda highlight)
- Weighted vote results by candidate

### Shareholders
- Add/edit/delete shareholders
- Bulk import via Excel template
- Influential classification support

### Candidates
- Manual candidate registration
- Nomination voting (share-weighted)
- Nomination results dashboard
- Promote nominee to official candidate

### Agendas
- Create/update/delete agenda items
- Set one agenda as active for current discussion
- Dashboard automatically reflects active/today agenda

### Attendance
- Mark attendance
- Approve/reject attendance (if maker-checker enabled)
- Reverse attendance (admin)

### Votes
- Encode vote
- Approve/reject vote (if maker-checker enabled)
- Reverse vote (admin)
- Enforced business rules:
  - Only attended shareholders can vote
  - One shareholder can vote once
  - No self-voting

### Audit Logs
- Tracks actor + maker/checker context for key actions

### Settings (Super Admin only)
- Toggle maker-checker for attendance/voting
- Influential threshold controls
- Reset AGM session data

---

## 4) Language and Theme

- Supports English and Amharic UI
- Theme switch for Light/Dark mode

---

## 5) Daily Operational Flow (Recommended)

1. Prepare shareholder list (manual or bulk import)
2. Configure settings in `Settings` page
3. Create today’s agenda and set active discussion item
4. Register candidates (manual and/or nomination workflow)
5. Run attendance workflow
6. Run voting workflow
7. Monitor dashboard + audit logs
8. Export reports (Super Admin only)
9. Reset session data when starting a new AGM cycle

---

## 6) Local Development Run

From repo root:

```bash
npm install
npm run dev:api
npm run dev
```

- API default: `http://localhost:4000`
- Web default: `http://localhost:5173`

---

## 7) LAN / Offline Hosting Guide

This section is for sharing the app across devices in the same office network without internet.

### 7.1 Prerequisites (Host Machine)

- Node.js 20+ (recommended)
- npm 10+
- Same LAN as client devices
- Firewall allows inbound ports:
  - `4000` (API)
  - `4173` (Web preview, recommended)

### 7.2 Build and Run (Production-Style)

From repo root on host machine:

```bash
npm install
npm run build -w @shmmf/shared
npm run build -w @shmmf/api
VITE_API_ORIGIN=http://<HOST_LAN_IP>:4000 npm run build -w @shmmf/web
```

Run API:

```bash
npm run start -w @shmmf/api
```

Run Web (LAN exposed):

```bash
npm run preview -w @shmmf/web -- --host 0.0.0.0 --port 4173
```

Open from other LAN devices:

```text
http://<HOST_LAN_IP>:4173
```

### 7.3 Offline Notes

- Internet is only needed initially to install dependencies.
- After setup, the app runs fully on LAN/local DB (`shmmf.sqlite`).
- Back up DB file regularly:
  - `apps/api/shmmf.sqlite` (or project root depending runtime cwd)

### 7.4 If API Is On a Different Machine

At web build time, set:

```bash
VITE_API_ORIGIN=http://<API_MACHINE_IP>:4000 npm run build -w @shmmf/web
```

### 7.5 Optional Process Management (Recommended)

Use a process manager (e.g., PM2) so API/Web restart automatically after reboot.

---

## 8) Data Reset and AGM Cycle Management

From `Settings` (Super Admin):

- Reset session data to clear:
  - attendance records
  - votes
  - nomination votes
- Optional:
  - clear candidates
  - clear audit logs

Use with care and preferably after exporting required reports.

---

## 9) Troubleshooting

### Users cannot open app from another device
- Check host firewall
- Confirm web is running with `--host 0.0.0.0`
- Verify correct LAN IP

### UI loads but API calls fail
- Rebuild web with correct `VITE_API_ORIGIN`
- Confirm API running on port `4000`

### Export buttons missing
- Only `SUPER_ADMIN` can export

### Vote button fails
- Verify voter has approved attendance
- Verify voter has not already voted
- Verify voter is not voting for self

---

## 10) Security and Operations Recommendations

- Change default passwords before real usage
- Restrict host machine access
- Back up SQLite DB before major operations
- Use audit logs for verification during/after AGM

