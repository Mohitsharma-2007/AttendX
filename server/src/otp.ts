import nodemailer from 'nodemailer';
import crypto from 'node:crypto';
import { getMongoDb, isMongoActive, execute, getOne } from './db.js';

const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';

// Configure Gmail SMTP transporter
export const transporter = nodemailer.createTransport({
  service: 'gmail',
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

export interface OtpRecord {
  email: string;
  code: string;
  purpose: 'login' | 'signup' | 'password_reset' | 'general';
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Generate a 6-digit numeric OTP and send via Gmail SMTP
 */
export async function generateAndSendOtp(
  email: string,
  purpose: 'login' | 'signup' | 'password_reset' | 'general' = 'login'
): Promise<{ success: boolean; message: string }> {
  const targetEmail = email.trim().toLowerCase();
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes valid

  // 1. Store in MongoDB if active, or local DB fallback
  const mongo = getMongoDb();
  if (isMongoActive() && mongo) {
    await mongo.collection('otps').deleteMany({ email: targetEmail, purpose });
    await mongo.collection('otps').insertOne({
      email: targetEmail,
      code,
      purpose,
      expiresAt,
      createdAt: new Date(),
    });
  } else {
    // Local SQLite fallback
    await execute('DELETE FROM password_resets WHERE email = ? AND reason = ?', [targetEmail, `otp_${purpose}`]);
    await execute(
      `INSERT INTO password_resets (id, email, temp_password, reason, status, created_at)
       VALUES (?, ?, ?, ?, 'active', ?)`,
      [crypto.randomUUID(), targetEmail, code, `otp_${purpose}`, new Date().toISOString()]
    );
  }

  // 2. Beautiful responsive dark-mode HTML template with AttendX branding
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b1311; color: #f1f5f9; margin: 0; padding: 24px; }
        .card { max-width: 460px; margin: 0 auto; background: #131d1b; border: 1px solid #223733; border-radius: 14px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        .logo { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; font-weight: 800; font-size: 20px; color: #10b981; letter-spacing: 0.5px; }
        .logo span { color: #f1f5f9; }
        h1 { font-size: 22px; font-weight: 700; margin: 0 0 10px; color: #ffffff; }
        p { font-size: 14px; color: #94a3b8; line-height: 1.5; margin: 0 0 20px; }
        .otp-box { background: linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(59, 130, 246, 0.12)); border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 10px; padding: 18px; text-align: center; margin: 24px 0; }
        .otp-code { font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #34d399; font-family: monospace; }
        .expiry { font-size: 12px; color: #64748b; margin-top: 6px; }
        .footer { border-top: 1px solid #1e293b; padding-top: 16px; margin-top: 24px; font-size: 12px; color: #64748b; text-align: center; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo">
          <span>Attend</span>X
        </div>
        <h1>Verification Code</h1>
        <p>Use the one-time security code below to complete your authentication for <strong>${targetEmail}</strong>.</p>
        <div class="otp-box">
          <div class="otp-code">${code}</div>
          <div class="expiry">Valid for 5 minutes • Do not share this code</div>
        </div>
        <p style="font-size: 13px; color: #64748b;">If you didn't request this verification code, please ignore this email.</p>
        <div class="footer">
          AttendX Institutional Attendance & Presence Infrastructure
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: `"AttendX Security" <${SMTP_USER}>`,
      to: targetEmail,
      subject: `Your AttendX Verification Code: ${code}`,
      html: htmlContent,
      text: `Your AttendX verification code is: ${code}. Valid for 5 minutes.`,
    });
    console.log(` Email OTP successfully dispatched to ${targetEmail}`);
    return { success: true, message: 'Verification code sent to your email' };
  } catch (err) {
    console.error('❌ Failed to send SMTP email:', err);
    return {
      success: false,
      message: `Failed to dispatch email: ${(err as Error).message}`,
    };
  }
}

/**
 * Verify an OTP entered by the user
 */
export async function verifyOtpCode(
  email: string,
  code: string,
  purpose: 'login' | 'signup' | 'password_reset' | 'general' = 'login'
): Promise<boolean> {
  const targetEmail = email.trim().toLowerCase();
  const targetCode = code.trim();

  const mongo = getMongoDb();
  if (isMongoActive() && mongo) {
    const record = await mongo.collection('otps').findOne({
      email: targetEmail,
      code: targetCode,
      purpose,
      expiresAt: { $gt: new Date() },
    });
    if (record) {
      await mongo.collection('otps').deleteOne({ _id: record._id });
      return true;
    }
  } else {
    const row = await getOne(
      `SELECT * FROM password_resets WHERE email = ? AND temp_password = ? AND reason = ? AND status = 'active'`,
      [targetEmail, targetCode, `otp_${purpose}`]
    );
    if (row) {
      await execute(`UPDATE password_resets SET status = 'used' WHERE id = ?`, [row.id]);
      return true;
    }
  }

  return false;
}
