import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import { query, execute, getOne, getDbKind, getMongoDb, isMongoActive } from './db.js';

const ALLOWED_TABLES = new Set([
  'profiles',
  'batches',
  'classes',
  'class_schedules',
  'enrollments',
  'batch_members',
  'batch_faculty',
  'attendance_sessions',
  'qr_tokens',
  'devices',
  'attendance_records',
  'join_tokens',
  'password_resets',
  'face_profiles',
  'audit_logs',
  'system_settings',
]);

function parseFilterValue(valStr: string): { op: string; value: any } {
  if (valStr.startsWith('eq.')) return { op: '$eq', value: valStr.slice(3) };
  if (valStr.startsWith('neq.')) return { op: '$ne', value: valStr.slice(4) };
  if (valStr.startsWith('gt.')) return { op: '$gt', value: valStr.slice(3) };
  if (valStr.startsWith('gte.')) return { op: '$gte', value: valStr.slice(4) };
  if (valStr.startsWith('lt.')) return { op: '$lt', value: valStr.slice(3) };
  if (valStr.startsWith('lte.')) return { op: '$lte', value: valStr.slice(4) };
  // Raw value — treat as equality (for LocalQueryBuilder compatibility)
  return { op: '$eq', value: valStr };
}

export async function handleQuery(req: Request, res: Response) {
  try {
    const table = req.params.table as string;
    if (!ALLOWED_TABLES.has(table)) {
      res.status(400).json({ error: `Table '${table}' not permitted` });
      return;
    }

    const { select, order, limit, count, ...filters } = req.query;

    // MongoDB path
    if (isMongoActive()) {
      const mongo = getMongoDb()!;
      const mongoFilter: Record<string, any> = {};

      for (const [key, val] of Object.entries(filters)) {
        const valStr = String(val);
        // Handle !neq and !in custom suffixes from LocalQueryBuilder
        if (key.endsWith('!neq')) {
          const col = key.replace(/!neq$/, '');
          mongoFilter[col] = { $ne: valStr };
        } else if (key.endsWith('!in')) {
          const col = key.replace(/!in$/, '');
          mongoFilter[col] = { $in: valStr.split(',') };
        } else {
          const { op, value } = parseFilterValue(valStr);
          if (op === '$eq') {
            mongoFilter[key] = value;
          } else {
            mongoFilter[key] = { [op]: value };
          }
        }
      }

      let cursor = mongo.collection(table).find(mongoFilter);

      if (order) {
        const parts = String(order).split('.');
        const col = parts[0];
        const dir = parts[1]?.toUpperCase() === 'DESC' ? -1 : 1;
        cursor = cursor.sort({ [col]: dir });
      }

      if (limit) {
        cursor = cursor.limit(Number(limit) || 100);
      }

      const docs = await cursor.toArray();
      const rows = docs.map(doc => {
        const { _id, ...rest } = doc as any;
        if (!rest.id && _id) rest.id = String(_id);
        return rest;
      });

      if (count === 'exact') {
        res.setHeader('content-range', `0-${rows.length}/${rows.length}`);
      }
      res.json(rows);
      return;
    }

    // SQL path (SQLite / PostgreSQL)
    let sql = `SELECT * FROM ${table}`;
    const whereClauses: string[] = [];
    const params: any[] = [];

    for (const [key, val] of Object.entries(filters)) {
      const valStr = String(val);
      // Handle !neq and !in custom suffixes from LocalQueryBuilder
      if (key.endsWith('!neq')) {
        const col = key.replace(/!neq$/, '');
        whereClauses.push(`${col} != ?`);
        params.push(valStr);
      } else if (key.endsWith('!in')) {
        const col = key.replace(/!in$/, '');
        const values = valStr.split(',');
        whereClauses.push(`${col} IN (${values.map(() => '?').join(',')})`);
        params.push(...values);
      } else if (valStr.startsWith('eq.')) {
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
        // Raw value — treat as equality
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

    if (isMongoActive()) {
      const mongo = getMongoDb()!;
      for (const item of items) {
        const record = { ...item };
        if (!record.id) record.id = crypto.randomUUID();
        try {
          await mongo.collection(table).insertOne(record);
        } catch (err: any) {
          if (err.code !== 11000) throw err; // Ignore duplicate key
        }
        inserted.push(record);
      }
    } else {
      for (const item of items) {
        const record = { ...item };
        if (!record.id) record.id = crypto.randomUUID();

        const keys = Object.keys(record);
        const placeholders = keys.map(() => '?').join(', ');
        const values = keys.map((k) => record[k]);

        const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
        await execute(sql, values);
        inserted.push(record);
      }
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

    if (isMongoActive()) {
      const mongo = getMongoDb()!;
      const mongoFilter: Record<string, any> = {};
      for (const [key, val] of Object.entries(filters)) {
        const valStr = String(val);
        mongoFilter[key] = valStr;
      }
      const { id, ...setFields } = updates;
      if (Object.keys(setFields).length === 0) {
        res.json({ success: true, message: 'Nothing to update' });
        return;
      }
      await mongo.collection(table).updateMany(mongoFilter, { $set: setFields });
      res.json({ success: true });
      return;
    }

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
      // Support both raw values and eq. prefixed values
      if (valStr.startsWith('eq.')) {
        whereClauses.push(`${key} = ?`);
        params.push(valStr.slice(3));
      } else {
        whereClauses.push(`${key} = ?`);
        params.push(valStr);
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

    if (isMongoActive()) {
      const mongo = getMongoDb()!;
      const mongoFilter: Record<string, any> = {};
      for (const [key, val] of Object.entries(filters)) {
        mongoFilter[key] = String(val);
      }
      if (Object.keys(mongoFilter).length === 0) {
        res.status(400).json({ error: 'Delete requires at least one filter' });
        return;
      }
      await mongo.collection(table).deleteMany(mongoFilter);
      res.json({ success: true });
      return;
    }

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
