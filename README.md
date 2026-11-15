# My Apartment – Backend (Node.js + Express + MongoDB Atlas)

The frontend (React) already talks to `http://localhost:5000/api`. This backend saves everything in MongoDB Atlas.

## What is stored (database `my_apartment`)

| Collection   | What it stores |
|--------------|----------------|
| `residents`  | name, flat, residenceName, wing, mobile, email, type (Owner/Tenant), status |
| `complaints` | residenceName, resident, flat, category/title (Water / Electricity / Parking / write-your-own), description, priority, status |
| `visitors`   | visitor name, purpose, **resident being visited**, flat, phone, vehicle, **visitTime**, status |
| `notices`    | type (Notice / Suggestion / Poll), title, body, category, audience, pinned, reads, poll options + votes |
| `parking`    | resident, flat, vehicle, slot, **fromTime → toTime**, type (Resident Reserved / Visitor), status |
| `users`      | login accounts: username, email, passwordHash, role (Admin / Resident / Security Guard / Maintenance Staff), flat, phone |
| `security_staff` | guards: name, photo, phone, post, shift + start/end, duty status, linked username |
| `incidents` | security incident reports: type, severity, status, location, reporter, action taken |
| `maintenance_staff` | maintenance team: name, photo, phone, job role, category, work status, linked username |
| `maintenance_requests` | resident requests: category, priority, status (Pending/Assigned/In Progress/Completed), assignee, dates, history |
| `notifications` | one per recipient: type, title, message, link, read/readAt |
| `handoff_codes` | one-time mobile → website sign-in codes (hashed, auto-deleted after 60 s) |
| `counters`   | internal – gives friendly IDs (C006, VIS-502, NT-107 …) |

## Step 1 – Atlas (one time)

1. https://cloud.mongodb.com → create a free **M0** cluster.
2. **Database Access** → Add Database User → username + password (use only letters/numbers to avoid URL problems) → role *Read and write to any database*.
3. **Network Access** → Add IP Address → **Allow access from anywhere (0.0.0.0/0)** → Confirm. *(This is the #1 reason Compass/shell "does not connect". Wait ~1 minute after saving.)*
4. **Database → Connect → Drivers** → copy the connection string:
   `mongodb+srv://<db_username>:<db_password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`

## Step 2 – Run the backend

```bash
cd smart-society/backend
npm install
copy .env.example .env        # Windows CMD   (Mac/Linux: cp .env.example .env)
```
Open `.env` and paste your string into `MONGODB_URI` (replace `<db_username>` and `<db_password>`, no `<>` brackets).

```bash
npm run check-db     # tests Atlas connection -> should print "Ping OK"
npm run seed         # adds sample data to every EMPTY collection (existing data is left alone)
npm run dev          # starts API on http://localhost:5000
```

Success looks like:
```
✅ MongoDB connected  →  host: cluster0-shard-00-00.xxxxx.mongodb.net  |  database: my_apartment
📚 Collections: complaints, counters, notices, parking, residents, visitors
🚀 API running at http://localhost:5000/api
```
With `DEBUG_DB=true` in `.env`, every query and every saved record is printed in this terminal.

## Step 3 – Run the frontend (second terminal)

```bash
cd smart-society/frontend
npm install
npm run dev
```
Open the URL it prints (http://localhost:5173). Add a complaint / visitor / notice / parking reservation → it appears in the backend terminal **and** in Atlas.

## Login accounts (fixed admin)

Run once (and again any time you change the passwords in `.env`):
```bash
npm run seed-users
```
| Role | Username | Password |
|------|----------|----------|
| Admin | `admin` (or `admin@myapartment.com`) | `Admin@123` |
| Resident (flat A-1203) | `arjun` | `Resident@123` |
| Resident (flat C-502) | `priya` | `Resident@123` |
| Security Guard | `guard` | `Guard@123` |
| Maintenance Staff | `ravi` | `Maint@123` |

Passwords are saved only as bcrypt hashes. Change them with `ADMIN_USERNAME / ADMIN_EMAIL / ADMIN_PASSWORD` and `JWT_SECRET` in `.env`, then run `npm run seed-users` again. Change the admin password before putting the site online.

Check in mongosh: `db.users.find({}, { username: 1, email: 1, role: 1, flat: 1, _id: 0 })` and `db.users.find({ role: "Admin" })`.

## Step 4 – See the data in MongoDB Shell (mongosh)

Install: https://www.mongodb.com/try/download/shell (then reopen the terminal).

```bash
mongosh "mongodb+srv://cluster0.xxxxx.mongodb.net/my_apartment" --username <db_username>
```
(it asks for the password), then:

```js
show collections
db.residents.find().pretty()
db.complaints.find().pretty()
db.visitors.find().pretty()
db.notices.find().pretty()
db.parking.find().pretty()

db.complaints.countDocuments()
db.complaints.find({ status: "Pending" })
db.complaints.find({ flat: "A-1203" })
db.visitors.find({}, { name: 1, resident: 1, visitTime: 1, status: 1, _id: 0 })
db.parking.find({ slot: "A-01" })
db.notices.find({ type: "Poll" })
```

## MongoDB Compass

Paste the **same** connection string (with your real user and password) into Compass → Connect. Then open `my_apartment`.
If it fails, see Troubleshooting below.

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Server selection timed out` / `ECONNREFUSED` | Atlas → Network Access → allow your IP / 0.0.0.0/0. College or office Wi-Fi may block port 27017 → try a mobile hotspot. |
| `bad auth` / `Authentication failed` | Wrong user or password. Use the *Database Access* user (not your Atlas login). URL-encode special characters (`@` → `%40`). |
| `querySrv ENOTFOUND` / `ECONNREFUSED _mongodb._tcp` | DNS blocks SRV lookups. Change DNS to 8.8.8.8, switch network, or in Atlas → Connect → Compass pick an older driver version to get a `mongodb://` string without `+srv`. |
| Website shows "offline data" notice | Backend is not running or not on port 5000. Check http://localhost:5000/api/health. |

## API summary (all under `/api`)

Every route except `POST /auth/login`, `POST /auth/handoff/redeem` and `GET /health` needs `Authorization: Bearer <token>`,
and each one checks the user's role. Full details with roles and request bodies: **`../../UPGRADE.md` → section 8**.

- `GET/POST /security/staff`, `PATCH/DELETE /security/staff/:id`
- `GET/POST /security/incidents`, `PATCH/DELETE /security/incidents/:id`, `POST /security/emergency`, `GET /security/summary`
- `GET/POST /maintenance/staff`, `PATCH/DELETE /maintenance/staff/:id`
- `GET/POST /maintenance/requests`, `GET/PATCH/DELETE /maintenance/requests/:id`, `PATCH /maintenance/requests/:id/assign`, `PATCH /maintenance/requests/:id/status`, `GET /maintenance/summary`
- `GET /notifications`, `GET /notifications/unread-count`, `GET /notifications/stream` (live), `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`, `DELETE /notifications/:id`, `DELETE /notifications`, `POST /notifications/announce`
- `POST /auth/users` (Admin), `POST /auth/handoff`, `POST /auth/handoff/redeem`

- `GET/POST /residents`, `PATCH/DELETE /residents/:id`
- `GET /complaints/categories`, `GET/POST /complaints`, `PATCH/DELETE /complaints/:id`
- `GET/POST /visitors`, `PATCH/DELETE /visitors/:id` (PATCH `{status}`)
- `GET/POST /notices`, `POST /notices/:id/read`, `POST /notices/:id/vote` `{optionIndex, voter}`
- `GET/POST /parking` (rejects overlapping reservations of one slot), `PATCH/DELETE /parking/:id`
- `POST /auth/login` `{login, password}`, `GET /auth/me`, `GET /auth/users` (Admin only)
- `GET /health`
