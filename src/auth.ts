// Users, passwords and sessions for the admin area.
// Passwords: PBKDF2-SHA256 (100 000 iterations, 16-byte salt). Sessions: random 32-byte token in an
// HttpOnly cookie; only its SHA-256 is stored, so a database leak does not leak live sessions.

import type { Env } from "./types.ts";

export type Role = "admin" | "editor" | "author";
export const ROLES: Role[] = ["admin", "editor", "author"];
export const ROLE_LABEL: Record<Role, string> = { admin: "Administrator", editor: "Redakteur", author: "Autor" };

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: number;
  created: number;
  last_login: number | null;
}

const COOKIE = "db_session";
const SESSION_DAYS = 14;
const enc = new TextEncoder();

function hex(buf: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomId(bytes = 16): string {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function sha256(s: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

export async function hashPassword(password: string, salt = randomId(16)): Promise<{ hash: string; salt: string }> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 100_000 }, key, 256);
  return { hash: hex(bits), salt };
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return "Das Passwort muss mindestens 10 Zeichen lang sein.";
  return null;
}

export async function countUsers(env: Env): Promise<number> {
  return (await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>())?.n ?? 0;
}

export async function createUser(env: Env, u: { email: string; name: string; role: Role; password: string }): Promise<string> {
  const id = randomId(8);
  const { hash, salt } = await hashPassword(u.password);
  await env.DB.prepare("INSERT INTO users (id, email, name, role, pw_hash, pw_salt, active, created) VALUES (?,?,?,?,?,?,1,?)")
    .bind(id, u.email.trim().toLowerCase(), u.name.trim(), u.role, hash, salt, Date.now()).run();
  return id;
}

export async function setPassword(env: Env, userId: string, password: string): Promise<void> {
  const { hash, salt } = await hashPassword(password);
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET pw_hash = ?, pw_salt = ? WHERE id = ?").bind(hash, salt, userId),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
  ]);
}

export async function verifyLogin(env: Env, email: string, password: string): Promise<User | null> {
  const row = await env.DB.prepare("SELECT * FROM users WHERE email = ? AND active = 1")
    .bind(email.trim().toLowerCase()).first<User & { pw_hash: string; pw_salt: string }>();
  // Hash even when the user does not exist, so timing does not reveal valid e-mail addresses.
  const { hash } = await hashPassword(password, row?.pw_salt ?? "x".repeat(32));
  if (!row || !safeEqual(hash, row.pw_hash)) return null;
  return row;
}

export async function startSession(env: Env, userId: string): Promise<string> {
  const token = randomId(32);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO sessions (id, user_id, expires, created) VALUES (?,?,?,?)").bind(await sha256(token), userId, now + SESSION_DAYS * 86400_000, now),
    env.DB.prepare("UPDATE users SET last_login = ? WHERE id = ?").bind(now, userId),
    env.DB.prepare("DELETE FROM sessions WHERE expires < ?").bind(now),
  ]);
  return `${COOKIE}=${token}; Path=/admin; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`;
}

function tokenFrom(req: Request): string | null {
  const m = (req.headers.get("Cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`));
  return m?.[1] ?? null;
}

export async function currentUser(env: Env, req: Request): Promise<User | null> {
  const token = tokenFrom(req);
  if (!token) return null;
  return await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.role, u.active, u.created, u.last_login
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires > ? AND u.active = 1`,
  ).bind(await sha256(token), Date.now()).first<User>();
}

export async function endSession(env: Env, req: Request): Promise<string> {
  const token = tokenFrom(req);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256(token)).run();
  return `${COOKIE}=; Path=/admin; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

/** What each role may do. */
export const can = {
  publish: (u: User) => u.role === "admin" || u.role === "editor",
  editPost: (u: User, authorId: string, status: string) => u.role !== "author" || (authorId === u.id && status !== "published"),
  ads: (u: User) => u.role === "admin" || u.role === "editor",
  sources: (u: User) => u.role === "admin" || u.role === "editor",
  users: (u: User) => u.role === "admin",
  pages: (u: User) => u.role === "admin",
  stats: (u: User) => u.role === "admin" || u.role === "editor",
};
