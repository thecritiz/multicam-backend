// Real auth: signup/login with bcrypt password hashing + JWT sessions.
// Replaces the old client-side access-code gate (which shipped the code in
// the JS bundle — theatre, not auth). Tokens are also required on the
// Socket.IO handshake, so signaling itself is authenticated now.
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Router } from "express";
import { createUser, findUserByUsername, findUserById, isUniqueViolation } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
export const usingDevJwtSecret = !process.env.JWT_SECRET;

const TOKEN_TTL = "7d";
const BCRYPT_ROUNDS = 10;
// Same charset family as room names / stream keys elsewhere in the project.
const USERNAME_RE = /^[a-zA-Z0-9_-]{3,20}$/;
const PASSWORD_MIN = 8;

function issueToken(user) {
  return jwt.sign({ sub: String(user.id), username: user.username }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

// Returns { id, username } or null. Never throws.
export function verifyToken(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return { id: Number(payload.sub), username: payload.username };
  } catch {
    return null;
  }
}

// Express middleware for Bearer-token routes.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const user = token && verifyToken(token);
  if (!user) return res.status(401).json({ error: "unauthorized" });
  req.user = user;
  next();
}

// Socket.IO middleware: client passes { auth: { token } } in the handshake.
export function socketAuth(socket, next) {
  const user = verifyToken(socket.handshake.auth?.token || "");
  if (!user) return next(new Error("unauthorized"));
  socket.data.user = user;
  next();
}

export const authRouter = Router();

authRouter.post("/signup", async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== "string" || !USERNAME_RE.test(username)) {
    return res.status(400).json({ error: "username must be 3-20 chars: letters, digits, _ or -" });
  }
  if (typeof password !== "string" || password.length < PASSWORD_MIN) {
    return res.status(400).json({ error: `password must be at least ${PASSWORD_MIN} characters` });
  }
  try {
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = createUser(username, hash);
    res.status(201).json({ token: issueToken(user), username: user.username });
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(409).json({ error: "username already taken" });
    console.error("signup error:", err);
    res.status(500).json({ error: "internal error" });
  }
});

authRouter.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  const user = typeof username === "string" ? findUserByUsername(username) : null;
  // Same 401 for unknown user and wrong password — don't leak which usernames exist.
  const ok = user && typeof password === "string" && (await bcrypt.compare(password, user.password_hash));
  if (!ok) return res.status(401).json({ error: "invalid username or password" });
  res.json({ token: issueToken(user), username: user.username });
});

authRouter.get("/me", requireAuth, (req, res) => {
  const user = findUserById(req.user.id);
  if (!user) return res.status(401).json({ error: "unauthorized" });
  res.json({ id: user.id, username: user.username, createdAt: user.created_at });
});
