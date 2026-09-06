import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { initDb, getDbKind } from './db.js';
import { handleLogin, handleSignup, authenticate } from './auth.js';
import {
  handleStartSession,
  handleIssueQr,
  handleSubmitAttendance,
  handleJoinBatch,
  handleGenerateJoinQr,
  handleVerifyFacultyCode,
  handleAdminResetPassword,
} from './functions.js';
import { handleQuery, handleInsert, handleUpdate, handleDelete } from './data.js';
import { handleSyncToSupabase, handleExportJson } from './sync.js';
import { generateAndSendOtp, verifyOtpCode } from './otp.js';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Info', 'apikey', 'X-Processor-Key', 'Range'],
    exposedHeaders: ['content-range'],
  })
);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static uploads serving for photo evidence
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
app.use('/uploads', express.static(UPLOADS_DIR));

// Health check
app.get(['/health', '/api/health'], (_req, res) => {
  res.json({
    status: 'ok',
    app: 'AttendX Local Offline Server',
    database: getDbKind(),
    timestamp: new Date().toISOString(),
  });
});

// Auth endpoints
app.post(['/api/auth/login', '/auth/v1/token'], handleLogin);
app.post(['/api/auth/signup', '/auth/v1/signup', '/functions/v1/signup'], handleSignup);

// OTP Verification Engine (Gmail SMTP)
app.post(['/api/auth/send-otp', '/functions/v1/send-otp'], async (req, res) => {
  const { email, purpose } = req.body;
  if (!email) {
    res.status(400).json({ error: 'Email address is required' });
    return;
  }
  const result = await generateAndSendOtp(email, purpose || 'login');
  res.status(result.success ? 200 : 500).json(result);
});

app.post(['/api/auth/verify-otp', '/functions/v1/verify-otp'], async (req, res) => {
  const { email, code, purpose } = req.body;
  if (!email || !code) {
    res.status(400).json({ error: 'Email and 6-digit code are required' });
    return;
  }
  const valid = await verifyOtpCode(email, code, purpose || 'login');
  if (valid) {
    res.json({ success: true, message: 'Code verified successfully' });
  } else {
    res.status(400).json({ success: false, error: 'Invalid or expired verification code' });
  }
});

// Functions endpoints (matching both /api/functions/* and Supabase /functions/v1/*)
app.post(['/api/functions/start-session', '/functions/v1/start-session'], authenticate, handleStartSession);
app.post(['/api/functions/issue-qr', '/functions/v1/issue-qr'], authenticate, handleIssueQr);
app.post(['/api/functions/submit-attendance', '/functions/v1/submit-attendance'], authenticate, handleSubmitAttendance);
app.post(['/api/functions/join-batch', '/functions/v1/join-batch'], authenticate, handleJoinBatch);
app.post(['/api/functions/generate-join-qr', '/functions/v1/generate-join-qr'], authenticate, handleGenerateJoinQr);
app.post(['/api/functions/verify-faculty-code', '/functions/v1/verify-faculty-code'], authenticate, handleVerifyFacultyCode);
app.post(['/api/functions/admin-reset-password', '/functions/v1/admin-reset-password'], authenticate, handleAdminResetPassword);

// PostgREST generic data endpoints (matching both /api/data/:table and Supabase /rest/v1/:table)
app.get(['/api/data/:table', '/rest/v1/:table'], handleQuery);
app.post(['/api/data/:table', '/rest/v1/:table'], handleInsert);
app.patch(['/api/data/:table', '/rest/v1/:table'], handleUpdate);
app.delete(['/api/data/:table', '/rest/v1/:table'], handleDelete);

// 1-Click Supabase Migration & Export
app.post('/api/sync/to-supabase', handleSyncToSupabase);
app.get('/api/sync/export-json', handleExportJson);

async function start() {
  await initDb();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`🚀 AttendX Local Server running on: http://localhost:${PORT}`);
    console.log(`📡 Network access on your LAN: http://<YOUR-IP>:${PORT}`);
    console.log(`💾 Database Engine: ${getDbKind().toUpperCase()}`);
    console.log(`📸 Evidence Uploads: ${UPLOADS_DIR}`);
    console.log(`======================================================\n`);
  });
}

export default app;

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  start().catch((err) => {
    console.error('Fatal server startup error:', err);
    process.exit(1);
  });
}
