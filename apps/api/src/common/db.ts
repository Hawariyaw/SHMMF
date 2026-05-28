import Database from "better-sqlite3";
import bcrypt from "bcryptjs";

const db = new Database("shmmf.sqlite");
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS configurations (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shareholders (
  id TEXT PRIMARY KEY,
  full_name_en TEXT NOT NULL,
  full_name_am TEXT,
  shares INTEGER NOT NULL,
  is_high_power INTEGER NOT NULL DEFAULT 0,
  contact_info TEXT
);

CREATE TABLE IF NOT EXISTS candidates (
  id TEXT PRIMARY KEY,
  shareholder_id TEXT,
  name TEXT NOT NULL,
  position TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id TEXT PRIMARY KEY,
  shareholder_id TEXT NOT NULL,
  marked_by TEXT NOT NULL,
  approved_by TEXT,
  status TEXT NOT NULL,
  notes TEXT,
  timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS votes (
  id TEXT PRIMARY KEY,
  shareholder_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  shares_used INTEGER NOT NULL,
  encoded_by TEXT NOT NULL,
  approved_by TEXT,
  status TEXT NOT NULL,
  correction_history TEXT NOT NULL,
  timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS candidate_nomination_votes (
  id TEXT PRIMARY KEY,
  voter_shareholder_id TEXT NOT NULL,
  nominee_shareholder_id TEXT NOT NULL,
  shares_used INTEGER NOT NULL,
  timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action_type TEXT NOT NULL,
  module TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  ip_address TEXT,
  device_info TEXT,
  timestamp TEXT NOT NULL
);
`);

db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_nomination_unique_voter ON candidate_nomination_votes(voter_shareholder_id);");

const now = new Date().toISOString();
const defaultUsers = [
  { id: "u-admin", fullName: "System Admin", username: "admin", role: "SUPER_ADMIN" },
  { id: "u-att-maker", fullName: "Attendance Maker", username: "attmaker", role: "ATTENDANCE_MAKER" },
  { id: "u-att-checker", fullName: "Attendance Checker", username: "attchecker", role: "ATTENDANCE_CHECKER" },
  { id: "u-vote-encoder", fullName: "Vote Encoder", username: "voteencoder", role: "VOTE_ENCODER" },
  { id: "u-vote-checker", fullName: "Vote Checker", username: "votechecker", role: "VOTE_CHECKER" },
  { id: "u-guest", fullName: "Guest Display", username: "guest", role: "GUEST" },
];
for (const user of defaultUsers) {
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(user.username) as
    | { id: string }
    | undefined;
  if (!existing) {
    db.prepare(
      "INSERT INTO users (id, full_name, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(user.id, user.fullName, user.username, bcrypt.hashSync("admin1234", 10), user.role, now);
  }
}

const makerCheckerDefaults = [
  { key: "attendanceMakerCheckerEnabled", value: "true" },
  { key: "votingMakerCheckerEnabled", value: "true" },
  { key: "influentialAutoClassificationEnabled", value: "false" },
  { key: "influentialShareThreshold", value: "100000" },
];
for (const item of makerCheckerDefaults) {
  db.prepare("INSERT OR IGNORE INTO configurations (key, value) VALUES (?, ?)").run(
    item.key,
    item.value
  );
}

const shareholdersCount = db
  .prepare("SELECT COUNT(*) as count FROM shareholders")
  .get() as { count: number };
if (!shareholdersCount.count) {
  db.prepare(
    "INSERT INTO shareholders (id, full_name_en, full_name_am, shares, is_high_power) VALUES (?, ?, ?, ?, ?)"
  ).run("sh-1001", "Abebe Kebede", "አበበ ከበደ", 250000, 1);
  db.prepare(
    "INSERT INTO shareholders (id, full_name_en, full_name_am, shares, is_high_power) VALUES (?, ?, ?, ?, ?)"
  ).run("sh-1002", "Marta Solomon", "ማርታ ሰለሞን", 75000, 0);
}

const candidatesCount = db.prepare("SELECT COUNT(*) as count FROM candidates").get() as { count: number };
const candidateColumns = db.prepare("PRAGMA table_info(candidates)").all() as Array<{ name: string }>;
const hasShareholderId = candidateColumns.some((column) => column.name === "shareholder_id");
const hasIsActive = candidateColumns.some((column) => column.name === "is_active");
if (!hasShareholderId) {
  db.exec("ALTER TABLE candidates ADD COLUMN shareholder_id TEXT");
}
if (!hasIsActive) {
  db.exec("ALTER TABLE candidates ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1");
}
if (!candidatesCount.count) {
  db.prepare("INSERT INTO candidates (id, shareholder_id, name, position, is_active) VALUES (?, ?, ?, ?, 1)").run(
    "c-01",
    "sh-1001",
    "Samuel Girma",
    "Board Chair"
  );
}

export { db };
