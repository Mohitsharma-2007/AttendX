import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
import { MongoClient, Db } from 'mongodb';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const { Pool } = pg;

export type DbKind = 'mongodb' | 'postgres' | 'sqlite';

let dbKind: DbKind = 'sqlite';
let pgPool: pg.Pool | null = null;
let sqliteDb: DatabaseSync | null = null;
let mongoClient: MongoClient | null = null;
let mongoDb: Db | null = null;

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function getMongoDb(): Db | null {
  return mongoDb;
}

export function isMongoActive(): boolean {
  return dbKind === 'mongodb' && Boolean(mongoDb);
}

export async function initDb(): Promise<DbKind> {
  // 1. Check MongoDB first (MongoDB Atlas or local URI)
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URL;
  if (mongoUri) {
    try {
      const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 3500 });
      await client.connect();
      mongoClient = client;
      mongoDb = client.db(process.env.MONGODB_DB_NAME || 'attendx');
      dbKind = 'mongodb';
      console.log('🍃 Connected to MongoDB Atlas / Database at', mongoUri.replace(/:[^:@]+@/, ':***@'));
      await initMongoIndexes();
      await seedDefaults();
      return dbKind;
    } catch (err) {
      console.warn('⚠️ MongoDB connection failed, trying fallbacks:', (err as Error).message);
    }
  }

  // 2. Check PostgreSQL
  const pgUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (pgUrl) {
    try {
      const pool = new Pool({ connectionString: pgUrl, connectionTimeoutMillis: 3000 });
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      pgPool = pool;
      dbKind = 'postgres';
      console.log(' Connected to PostgreSQL database at', pgUrl.replace(/:[^:@]+@/, ':***@'));
      await runPostgresSchema();
      await seedDefaults();
      return dbKind;
    } catch (err) {
      console.warn('⚠️ PostgreSQL connection failed, falling back to embedded SQLite:', (err as Error).message);
    }
  }

  // 3. Fallback to embedded SQLite
  const dbPath = path.join(DATA_DIR, 'attendx.sqlite');
  sqliteDb = new DatabaseSync(dbPath);
  sqliteDb.exec('PRAGMA journal_mode = WAL;');
  sqliteDb.exec('PRAGMA foreign_keys = ON;');
  dbKind = 'sqlite';
  console.log(' Connected to embedded SQLite database at', dbPath);
  await runSqliteSchema();
  await seedDefaults();
  return dbKind;
}

export function getDbKind(): DbKind {
  return dbKind;
}

async function initMongoIndexes() {
  if (!mongoDb) return;
  try {
    await mongoDb.collection('profiles').createIndex({ email: 1 }, { unique: true });
    await mongoDb.collection('batches').createIndex({ code: 1 }, { unique: true });
    await mongoDb.collection('classes').createIndex({ code: 1 }, { unique: true });
    await mongoDb.collection('qr_tokens').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
    await mongoDb.collection('otps').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await mongoDb.collection('attendance_records').createIndex({ session_id: 1, student_id: 1 }, { unique: true });
  } catch (e) {
    console.warn('MongoDB index initialization note:', (e as Error).message);
  }
}

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  if (dbKind === 'postgres' && pgPool) {
    // Postgres uses $1, $2 instead of ?
    let pgSql = sql;
    let paramIdx = 1;
    pgSql = pgSql.replace(/\?/g, () => `$${paramIdx++}`);
    const res = await pgPool.query(pgSql, params);
    return res.rows as T[];
  }

  if (sqliteDb) {
    const stmt = sqliteDb.prepare(sql);
    return stmt.all(...params) as T[];
  }

  return [];
}

export async function execute(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid?: number | bigint }> {
  if (dbKind === 'postgres' && pgPool) {
    let pgSql = sql;
    let paramIdx = 1;
    pgSql = pgSql.replace(/\?/g, () => `$${paramIdx++}`);
    const res = await pgPool.query(pgSql, params);
    return { changes: res.rowCount || 0 };
  }

  if (sqliteDb) {
    const stmt = sqliteDb.prepare(sql);
    const info = stmt.run(...params);
    return { changes: Number(info.changes), lastInsertRowid: info.lastInsertRowid };
  }

  return { changes: 0 };
}

export async function getOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] || null;
}

async function runPostgresSchema() {
  if (!pgPool) return;
  const ddl = `
    CREATE TABLE IF NOT EXISTS profiles (
      id UUID PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('student', 'faculty', 'admin')),
      identifier TEXT,
      department TEXT,
      approval_status TEXT NOT NULL DEFAULT 'approved',
      is_active BOOLEAN NOT NULL DEFAULT true,
      invite_code TEXT,
      password_hash TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS batches (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      department TEXT,
      academic_year TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS classes (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      batch_id UUID REFERENCES batches(id) ON DELETE CASCADE,
      faculty_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
      geofence_lat DOUBLE PRECISION,
      geofence_lng DOUBLE PRECISION,
      geofence_radius_m INTEGER DEFAULT 50,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS class_schedules (
      id UUID PRIMARY KEY,
      class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
      day_of_week INTEGER,
      start_time TEXT,
      end_time TEXT,
      room TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS enrollments (
      id UUID PRIMARY KEY,
      class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
      student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (class_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS attendance_sessions (
      id UUID PRIMARY KEY,
      class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
      faculty_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'active',
      center_lat DOUBLE PRECISION NOT NULL,
      center_lng DOUBLE PRECISION NOT NULL,
      geofence_radius_m INTEGER NOT NULL DEFAULT 50,
      refresh_interval_s INTEGER NOT NULL DEFAULT 15,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      scheduled_end_at TIMESTAMPTZ,
      ended_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS qr_tokens (
      id UUID PRIMARY KEY,
      session_id UUID REFERENCES attendance_sessions(id) ON DELETE CASCADE,
      nonce TEXT NOT NULL,
      token TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS devices (
      id UUID PRIMARY KEY,
      user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
      device_uuid TEXT NOT NULL,
      platform TEXT,
      model TEXT,
      os_version TEXT,
      app_version TEXT,
      is_trusted BOOLEAN NOT NULL DEFAULT true,
      integrity_verdict JSONB,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, device_uuid)
    );

    CREATE TABLE IF NOT EXISTS attendance_records (
      id UUID PRIMARY KEY,
      session_id UUID REFERENCES attendance_sessions(id) ON DELETE CASCADE,
      student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
      gps_lat DOUBLE PRECISION,
      gps_lng DOUBLE PRECISION,
      gps_accuracy_m DOUBLE PRECISION,
      distance_from_center_m DOUBLE PRECISION,
      is_mock_location BOOLEAN DEFAULT false,
      developer_mode_detected BOOLEAN DEFAULT false,
      selfie_path TEXT,
      classroom_photo_path TEXT,
      device_id UUID REFERENCES devices(id),
      ip_address TEXT,
      integrity_verdict JSONB,
      selfie_captured_at TIMESTAMPTZ,
      selfie_uploaded_at TIMESTAMPTZ,
      classroom_captured_at TIMESTAMPTZ,
      classroom_uploaded_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'present',
      rejection_reason TEXT,
      evidence_review_status TEXT DEFAULT 'approved',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (session_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS join_tokens (
      id UUID PRIMARY KEY,
      batch_id UUID REFERENCES batches(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id UUID PRIMARY KEY,
      user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      identifier TEXT,
      reason TEXT,
      temp_password TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS face_profiles (
      id UUID PRIMARY KEY,
      user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
      model TEXT,
      model_version TEXT,
      embedding JSONB NOT NULL,
      quality_score DOUBLE PRECISION,
      source_photo_path TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY,
      actor_id UUID,
      action TEXT NOT NULL,
      target_table TEXT,
      target_id UUID,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await pgPool.query(ddl);
}

async function runSqliteSchema() {
  if (!sqliteDb) return;
  const ddl = `
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('student', 'faculty', 'admin')),
      identifier TEXT,
      department TEXT,
      approval_status TEXT NOT NULL DEFAULT 'approved',
      is_active INTEGER NOT NULL DEFAULT 1,
      invite_code TEXT,
      password_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS batches (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      department TEXT,
      academic_year TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      batch_id TEXT REFERENCES batches(id) ON DELETE CASCADE,
      faculty_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      geofence_lat REAL,
      geofence_lng REAL,
      geofence_radius_m INTEGER DEFAULT 50,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS class_schedules (
      id TEXT PRIMARY KEY,
      class_id TEXT REFERENCES classes(id) ON DELETE CASCADE,
      day_of_week INTEGER,
      start_time TEXT,
      end_time TEXT,
      room TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS enrollments (
      id TEXT PRIMARY KEY,
      class_id TEXT REFERENCES classes(id) ON DELETE CASCADE,
      student_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (class_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS attendance_sessions (
      id TEXT PRIMARY KEY,
      class_id TEXT REFERENCES classes(id) ON DELETE CASCADE,
      faculty_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'active',
      center_lat REAL NOT NULL,
      center_lng REAL NOT NULL,
      geofence_radius_m INTEGER NOT NULL DEFAULT 50,
      refresh_interval_s INTEGER NOT NULL DEFAULT 15,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      scheduled_end_at TEXT,
      ended_at TEXT
    );

    CREATE TABLE IF NOT EXISTS qr_tokens (
      id TEXT PRIMARY KEY,
      session_id TEXT REFERENCES attendance_sessions(id) ON DELETE CASCADE,
      nonce TEXT NOT NULL,
      token TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
      device_uuid TEXT NOT NULL,
      platform TEXT,
      model TEXT,
      os_version TEXT,
      app_version TEXT,
      is_trusted INTEGER NOT NULL DEFAULT 1,
      integrity_verdict TEXT,
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, device_uuid)
    );

    CREATE TABLE IF NOT EXISTS attendance_records (
      id TEXT PRIMARY KEY,
      session_id TEXT REFERENCES attendance_sessions(id) ON DELETE CASCADE,
      student_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
      gps_lat REAL,
      gps_lng REAL,
      gps_accuracy_m REAL,
      distance_from_center_m REAL,
      is_mock_location INTEGER DEFAULT 0,
      developer_mode_detected INTEGER DEFAULT 0,
      selfie_path TEXT,
      classroom_photo_path TEXT,
      device_id TEXT REFERENCES devices(id),
      ip_address TEXT,
      integrity_verdict TEXT,
      selfie_captured_at TEXT,
      selfie_uploaded_at TEXT,
      classroom_captured_at TEXT,
      classroom_uploaded_at TEXT,
      status TEXT NOT NULL DEFAULT 'present',
      rejection_reason TEXT,
      evidence_review_status TEXT DEFAULT 'approved',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (session_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS join_tokens (
      id TEXT PRIMARY KEY,
      batch_id TEXT REFERENCES batches(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      identifier TEXT,
      reason TEXT,
      temp_password TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS face_profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
      model TEXT,
      model_version TEXT,
      embedding TEXT NOT NULL,
      quality_score REAL,
      source_photo_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT,
      action TEXT NOT NULL,
      target_table TEXT,
      target_id TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `;
  sqliteDb.exec(ddl);
}

// Simple hash for password
export function hashPassword(plain: string): string {
  return crypto.createHash('sha256').update(plain + 'attendx_salt_secure_2026').digest('hex');
}

export function verifyPassword(plain: string, hash: string): boolean {
  return hashPassword(plain) === hash;
}

async function seedDefaults() {
  const adminEmail = 'admin@attendx.edu';
  const facultyEmail = 'faculty@attendx.edu';
  const studentEmail = 'student@attendx.edu';

  let admin = await getOne('SELECT id FROM profiles WHERE email = ?', [adminEmail]);
  if (!admin) {
    const adminId = crypto.randomUUID();
    const passwordHash = hashPassword('Admin@123456');
    await execute(
      `INSERT INTO profiles (id, email, full_name, role, identifier, department, approval_status, is_active, password_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [adminId, adminEmail, 'System Administrator', 'admin', 'ADM-001', 'Administration', 'approved', 1, passwordHash]
    );
    console.log('✅ Seeded default administrator: admin@attendx.edu (Password: Admin@123456)');
    admin = { id: adminId };
  }

  let faculty = await getOne('SELECT id FROM profiles WHERE email = ?', [facultyEmail]);
  if (!faculty) {
    const facultyId = crypto.randomUUID();
    const passwordHash = hashPassword('Faculty@123456');
    await execute(
      `INSERT INTO profiles (id, email, full_name, role, identifier, department, approval_status, is_active, password_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [facultyId, facultyEmail, 'Prof. Robert Vance', 'faculty', 'FAC-001', 'Computer Science', 'approved', 1, passwordHash]
    );
    console.log('✅ Seeded default faculty: faculty@attendx.edu (Password: Faculty@123456)');
    faculty = { id: facultyId };
  }

  let student = await getOne('SELECT id FROM profiles WHERE email = ?', [studentEmail]);
  if (!student) {
    const studentId = crypto.randomUUID();
    const passwordHash = hashPassword('Student@123456');
    await execute(
      `INSERT INTO profiles (id, email, full_name, role, identifier, department, approval_status, is_active, password_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [studentId, studentEmail, 'Alex Mercer', 'student', 'STU-001', 'Computer Science', 'approved', 1, passwordHash]
    );
    console.log('✅ Seeded default student: student@attendx.edu (Password: Student@123456)');
    student = { id: studentId };
  }

  // Seed sample batch and class if empty
  const batches = await query('SELECT id FROM batches LIMIT 1');
  if (batches.length === 0) {
    const batchId = crypto.randomUUID();
    await execute(
      `INSERT INTO batches (id, name, code, department, academic_year, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
      [batchId, 'Computer Science 2026', 'CS-2026', 'Computer Science', '2025-2026', admin.id]
    );

    const classId = crypto.randomUUID();
    await execute(
      `INSERT INTO classes (id, name, code, batch_id, geofence_lat, geofence_lng, geofence_radius_m, is_active, publication_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [classId, 'Advanced Distributed Systems', 'CS401', batchId, 28.6139, 77.2090, 100, 1, 'published']
    );

    // Link faculty to batch and enroll student
    await execute(
      `INSERT OR IGNORE INTO batch_faculty (batch_id, faculty_id) VALUES (?, ?)`,
      [batchId, faculty.id]
    );
    await execute(
      `INSERT OR IGNORE INTO batch_members (batch_id, student_id, status) VALUES (?, ?, ?)`,
      [batchId, student.id, 'active']
    );
    await execute(
      `INSERT OR IGNORE INTO enrollments (class_id, student_id, status) VALUES (?, ?, ?)`,
      [classId, student.id, 'active']
    );

    console.log('✅ Seeded default batch (CS-2026), class (CS401), and linked faculty/student');
  }
}
