import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import { query, execute, getOne } from './db.js';

const ALLOWED_TABLES = new Set([
  'profiles',
  'batches',
  'classes',
  'class_schedules',
  'enrollments',
  'attendance_sessions',
  'qr_tokens',
  'devices',
  'attendance_records',
  'join_tokens',
  'password_resets',
  'face_profiles',
  'audit_logs',
]);

export async function handleQuery(req: Request, res: Response) {
  try {
    const table = req.params.table as string;
    if (!ALLOWED_TABLES.has(table)) {
      res.status(400).json({ error: `Table '${table}' not permitted` });
      return;
    }

    const { select, order, limit, count, ...filters } = req.query;

    let sql = `SELECT * FROM ${table}`;
    const whereClauses: string[] = [];
    const params: any[] = [];

    for (const [key, val] of Object.entries(filters)) {
      const valStr = String(val);
      if (valStr.startsWith('eq.')) {
        whereClauses.push(`${key} = ?`);
        params.push(valStr.slice(3));
      } else if (valStr.startsWith('neq.')) {
        whereClauses.push(`${key} != ?`);
        params.push(valStr.slice(4));
      } else if (valStr.startsWith('gt.')) {
        whereClauses.push(`${key} > ?`);
        params.push(valStr.slice(3));
      } else if (valStr.startsWith('gte.')) {
        whereClauses.push(`${key} >= ?`);
        params.push(valStr.slice(4));
      } else if (valStr.startsWith('lt.')) {
        whereClauses.push(`${key} < ?`);
        params.push(valStr.slice(3));
      } else if (valStr.startsWith('lte.')) {
        whereClauses.push(`${key} <= ?`);
        params.push(valStr.slice(4));
      } else {
        whereClauses.push(`${key} = ?`);
        params.push(valStr);
      }
    }

    if (whereClauses.length > 0) {
      sql += ` WHERE ` + whereClauses.join(' AND ');
    }

    if (order) {
      const parts = String(order).split('.');
      const col = parts[0];
      const dir = parts[1]?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      sql += ` ORDER BY ${col} ${dir}`;
    }

    if (limit) {
      sql += ` LIMIT ${Number(limit) || 100}`;
    }

    const rows = await query(sql, params);

    // If count=exact requested, return count header
    if (count === 'exact') {
      res.setHeader('content-range', `0-${rows.length}/${rows.length}`);
    }

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export async function handleInsert(req: Request, res: Response) {
  try {
    const table = req.params.table as string;
    if (!ALLOWED_TABLES.has(table)) {
      res.status(400).json({ error: `Table '${table}' not permitted` });
      return;
    }

    const body = req.body;
    const items = Array.isArray(body) ? body : [body];
    const inserted: any[] = [];

    for (const item of items) {
      const record = { ...item };
      if (!record.id) {
        record.id = crypto.randomUUID();
      }

      const keys = Object.keys(record);
      const placeholders = keys.map(() => '?').join(', ');
      const values = keys.map((k) => record[k]);

      const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
      await execute(sql, values);
      inserted.push(record);
    }

    res.status(201).json(Array.isArray(body) ? inserted : inserted[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export async function handleUpdate(req: Request, res: Response) {
  try {
    const table = req.params.table as string;
    if (!ALLOWED_TABLES.has(table)) {
      res.status(400).json({ error: `Table '${table}' not permitted` });
      return;
    }

    const updates = req.body;
    const filters = req.query;

    const setClauses: string[] = [];
    const params: any[] = [];

    for (const [key, val] of Object.entries(updates)) {
      if (key === 'id') continue;
      setClauses.push(`${key} = ?`);
      params.push(val);
    }

    if (setClauses.length === 0) {
      res.json({ success: true, message: 'Nothing to update' });
      return;
    }

    const whereClauses: string[] = [];
    for (const [key, val] of Object.entries(filters)) {
      const valStr = String(val);
      if (valStr.startsWith('eq.')) {
        whereClauses.push(`${key} = ?`);
        params.push(valStr.slice(3));
      }
    }

    let sql = `UPDATE ${table} SET ${setClauses.join(', ')}`;
    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    await execute(sql, params);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export async function handleDelete(req: Request, res: Response) {
  try {
    const table = req.params.table as string;
    if (!ALLOWED_TABLES.has(table)) {
      res.status(400).json({ error: `Table '${table}' not permitted` });
      return;
    }

    const filters = req.query;
    const whereClauses: string[] = [];
    const params: any[] = [];

    for (const [key, val] of Object.entries(filters)) {
      const valStr = String(val);
      if (valStr.startsWith('eq.')) {
        whereClauses.push(`${key} = ?`);
        params.push(valStr.slice(3));
      } else {
        whereClauses.push(`${key} = ?`);
        params.push(valStr);
      }
    }

    if (whereClauses.length === 0) {
      res.status(400).json({ error: 'Delete requires at least one filter' });
      return;
    }

    const sql = `DELETE FROM ${table} WHERE ${whereClauses.join(' AND ')}`;
    await execute(sql, params);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}
