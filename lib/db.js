// User database — SQLite via node:sqlite (built into Node 22.5+, unflagged
// from 23.4; this repo pins engines.node >= 24). Chosen over better-sqlite3/pg
// to keep zero native/network dependencies: one file on disk, synchronous API,
// nothing to provision. Swap point for Postgres later is this module only.
//
// NOTE for deploys: the DB lives at DB_PATH on local disk. Render's free tier
// has an EPHEMERAL filesystem — users are wiped on every deploy/restart there.
// Fine for a demo; for persistence run this on a VPS/Fly volume or point a
// future pg-backed version of this module at Neon.
import { DatabaseSync } from "node:sqlite";
import fs from "fs";
import path from "path";

const DB_PATH = path.resolve(process.env.DB_PATH || "./data/users.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const insertUser = db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)");
const selectByUsername = db.prepare("SELECT * FROM users WHERE username = ?");
const selectById = db.prepare("SELECT id, username, created_at FROM users WHERE id = ?");

// Throws on UNIQUE violation — callers map that to a 409. Relying on the DB
// constraint (not a pre-check) makes duplicate handling race-safe.
export function createUser(username, passwordHash) {
  const { lastInsertRowid } = insertUser.run(username, passwordHash);
  return findUserById(Number(lastInsertRowid));
}

export function findUserByUsername(username) {
  return selectByUsername.get(username) ?? null;
}

export function findUserById(id) {
  return selectById.get(id) ?? null;
}

export function isUniqueViolation(err) {
  return typeof err?.message === "string" && err.message.includes("UNIQUE constraint");
}
