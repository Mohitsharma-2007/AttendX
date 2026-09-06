// AttendX API client — talks to the AttendX server (Express + MongoDB/SQLite).
// Every data view in the app goes through this Supabase-compatible query
// builder, but nothing here connects to Supabase any more.

export function getLocalServerUrl(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('attendx_server_url');
    if (saved) return saved.replace(/\/$/, '');

    const envUrl = import.meta.env.VITE_LOCAL_SERVER_URL;
    if (envUrl && !envUrl.includes('localhost')) return envUrl.replace(/\/$/, '');

    // Default to port 3001 if on localhost / 127.0.0.1
    const hostname = window.location.hostname || 'localhost';
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:3001';
    }
    // On Vercel / cloud web deployment, API routes are on the same origin
    return window.location.origin;
  }
  return 'http://localhost:3001';
}

export function setLocalServerUrl(url: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('attendx_server_url', url.replace(/\/$/, ''));
  }
}

export const DEMO_PROFILES: Record<string, any> = {
  'admin@attendx.edu': {
    id: 'demo-admin-001',
    email: 'admin@attendx.edu',
    full_name: 'System Administrator',
    role: 'admin',
    identifier: 'ADM-001',
    department: 'Administration',
    approval_status: 'approved',
    is_active: 1,
    must_change_password: false,
  },
  'faculty@attendx.edu': {
    id: 'demo-fac-001',
    email: 'faculty@attendx.edu',
    full_name: 'Prof. Robert Vance',
    role: 'faculty',
    identifier: 'FAC-001',
    department: 'Computer Science',
    approval_status: 'approved',
    is_active: 1,
    must_change_password: false,
  },
  'student@attendx.edu': {
    id: 'demo-stu-001',
    email: 'student@attendx.edu',
    full_name: 'Alex Mercer',
    role: 'student',
    identifier: 'STU-001',
    department: 'Computer Science',
    approval_status: 'approved',
    is_active: 1,
    must_change_password: false,
  },
};

const DEMO_BATCH = {
  id: 'demo-batch-001',
  name: 'Computer Science 2026',
  code: 'CS-2026',
  department: 'Computer Science',
  academic_year: '2025-2026',
  created_by: 'demo-admin-001',
};

const DEMO_CLASS = {
  id: 'demo-class-001',
  name: 'Advanced Distributed Systems',
  code: 'CS401',
  batch_id: 'demo-batch-001',
  geofence_lat: 28.6139,
  geofence_lng: 77.209,
  geofence_radius_m: 100,
  is_active: 1,
  publication_status: 'published',
  class_schedules: [
    { id: 'demo-schedule-001', class_id: 'demo-class-001', session_date: new Date().toISOString().split('T')[0], start_time: '09:00', end_time: '10:00', room: 'TBA' },
  ],
};

const DEMO_ENROLLMENT = { id: 'demo-enroll-001', batch_id: DEMO_BATCH.id, class_id: DEMO_CLASS.id, student_id: 'demo-stu-001', status: 'active' };

class LocalQueryBuilder implements PromiseLike<any> {
  private table: string;
  private action: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private queryParams: Record<string, string> = {};
  private payload: any = null;
  private isSingle = false;
  private isMaybeSingle = false;

  constructor(table: string) {
    this.table = table;
  }

  select(fields = '*', options?: { count?: string; head?: boolean }) {
    this.action = 'select';
    this.queryParams['select'] = fields;
    if (options?.count) this.queryParams['count'] = options.count;
    if (options?.head) this.queryParams['head'] = 'true';
    return this;
  }

  insert(data: any) {
    this.action = 'insert';
    this.payload = data;
    return this;
  }

  update(data: any) {
    this.action = 'update';
    this.payload = data;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  eq(column: string, value: any) {
    // Send raw value — data.ts accepts both raw and eq.-prefixed values
    this.queryParams[column] = String(value);
    return this;
  }

  neq(column: string, value: any) {
    this.queryParams[`${column}!neq`] = String(value);
    return this;
  }

  in(column: string, values: any[]) {
    this.queryParams[`${column}!in`] = values.join(',');
    return this;
  }

  gt(col: string, val: any) {
    this.queryParams[col] = `gt.${val}`;
    return this;
  }

  gte(col: string, val: any) {
    this.queryParams[col] = `gte.${val}`;
    return this;
  }

  lt(col: string, val: any) {
    this.queryParams[col] = `lt.${val}`;
    return this;
  }

  lte(col: string, val: any) {
    this.queryParams[col] = `lte.${val}`;
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.queryParams['order'] = `${column}.${options?.ascending ? 'asc' : 'desc'}`;
    return this;
  }

  limit(count: number) {
    this.queryParams['limit'] = String(count);
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  maybeSingle() {
    this.isMaybeSingle = true;
    return this;
  }

  async execute(): Promise<{ data: any; error: any; count?: number }> {
    const baseUrl = getLocalServerUrl();
    const token = typeof window !== 'undefined' ? localStorage.getItem('attendx_auth_token') : null;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const filterParams = new URLSearchParams();
    for (const [key, val] of Object.entries(this.queryParams)) {
      if (key === 'select' || key === 'head') continue;
      filterParams.set(key, val);
    }
    const qs = filterParams.toString();
    const url = `${baseUrl}/api/data/${this.table}${qs ? '?' + qs : ''}`;

    try {
      let res: Response;
      if (this.action === 'select') {
        res = await fetch(url, { method: 'GET', headers });
      } else if (this.action === 'insert') {
        res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(this.payload) });
      } else if (this.action === 'update') {
        res = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify(this.payload) });
      } else {
        res = await fetch(url, { method: 'DELETE', headers });
      }

      if (res.ok) {
        const json = await res.json();
        let data = json;
        let count: number | undefined;

        if (this.isSingle) {
          data = Array.isArray(json) ? json[0] || null : json;
          if (!data) return { data: null, error: { message: 'Row not found' } };
        } else if (this.isMaybeSingle) {
          data = Array.isArray(json) ? json[0] || null : json;
        } else if (!Array.isArray(json) && this.queryParams['count'] === 'exact') {
          // head:true count responses come back as { count: N }
          count = Number(json?.count || 0);
          data = [];
        }

        return { data, error: null, count };
      }

      // Non-OK response — surface the server error message
      const errBody = await res.json().catch(() => ({}));
      return { data: null, error: { message: errBody.error || `Request failed (${res.status})` } };
    } catch {
      // Server unreachable — fall through to demo data for offline preview
    }

    // Fallback Demo Data Engine for offline / standalone preview
    if (this.action !== 'select') {
      return { data: null, error: { message: 'AttendX server is unreachable. Start the server and try again.' } };
    }

    if (this.table === 'profiles') {
      const storedProfile = typeof window !== 'undefined' ? localStorage.getItem('attendx_profile') : null;
      if (storedProfile) {
        try {
          const prof = JSON.parse(storedProfile);
          if (this.queryParams['id'] && prof.id === this.queryParams['id']) {
            return { data: prof, error: null };
          }
          if (this.queryParams['email'] && prof.email === this.queryParams['email']) {
            return { data: prof, error: null };
          }
          if (!this.queryParams['id'] && !this.queryParams['email']) {
            return { data: [prof], error: null };
          }
        } catch {}
      }

      const idMatch = Object.values(DEMO_PROFILES).find((p) => p.id === this.queryParams['id']);
      if (idMatch) return { data: idMatch, error: null };
      const emailMatch = Object.values(DEMO_PROFILES).find((p) => p.email === this.queryParams['email']);
      if (emailMatch) return { data: emailMatch, error: null };

      if (this.isSingle) return { data: null, error: { message: 'Row not found' } };
      return { data: Object.values(DEMO_PROFILES), error: null };
    }

    if (this.table === 'batches') {
      return { data: this.isSingle ? DEMO_BATCH : [DEMO_BATCH], error: null };
    }

    if (this.table === 'classes') {
      return { data: this.isSingle ? DEMO_CLASS : [DEMO_CLASS], error: null };
    }

    if (this.table === 'batch_members' || this.table === 'enrollments') {
      return { data: this.isSingle ? DEMO_ENROLLMENT : [DEMO_ENROLLMENT], error: null };
    }

    if (this.table === 'student_attendance_summary') {
      return {
        data: [
          {
            class_id: DEMO_CLASS.id,
            class_code: DEMO_CLASS.code,
            class_name: DEMO_CLASS.name,
            completed_sessions: 8,
            sessions_present: 7,
            attendance_percentage: 87.5,
          },
        ],
        error: null,
      };
    }

    if (this.table === 'faculty_assignments') {
      return { data: [{ faculty_id: 'demo-fac-001', batch_id: DEMO_BATCH.id, is_active: 1, batches: DEMO_BATCH }], error: null };
    }

    if (this.table === 'system_settings') {
      return {
        data: [
          { key: 'web_attendance_enabled', value: 'true', description: 'Allow attendance marking from web browsers' },
          { key: 'identity_document_required', value: 'false', description: 'Require ID card captures during signup' },
        ],
        error: null,
      };
    }

    return { data: this.isSingle ? null : [], error: null };
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

function createApiClient() {
  return {
    from: (table: string) => new LocalQueryBuilder(table),

    auth: {
      signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
        const normEmail = email.trim().toLowerCase();
        try {
          const res = await fetch(`${getLocalServerUrl()}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: normEmail, password }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.access_token) {
            if (typeof window !== 'undefined') {
              localStorage.setItem('attendx_auth_token', data.access_token);
              localStorage.setItem('attendx_user', JSON.stringify(data.user));
              localStorage.setItem('attendx_profile', JSON.stringify(data.profile));
            }
            return { data: { user: data.user, session: { access_token: data.access_token, user: data.user } }, error: null };
          }
          if (data.error) {
            return { data: { user: null, session: null }, error: { message: data.error } };
          }
        } catch {
          // Network failed or local server not running -> check built-in demo fallback
        }

        const demo = DEMO_PROFILES[normEmail];
        const passMap: Record<string, string> = {
          'admin@attendx.edu': 'Admin@123456',
          'faculty@attendx.edu': 'Faculty@123456',
          'student@attendx.edu': 'Student@123456',
        };

        if (demo && passMap[normEmail] === password) {
          const demoUser = { id: demo.id, email: demo.email, role: demo.role };
          if (typeof window !== 'undefined') {
            localStorage.setItem('attendx_auth_token', 'demo_token_' + demo.role);
            localStorage.setItem('attendx_user', JSON.stringify(demoUser));
            localStorage.setItem('attendx_profile', JSON.stringify(demo));
          }
          return {
            data: { user: demoUser, session: { access_token: 'demo_token_' + demo.role, user: demoUser } },
            error: null,
          };
        }

        return {
          data: { user: null, session: null },
          error: { message: 'Invalid credentials. For demo access use admin@attendx.edu / Admin@123456, faculty@attendx.edu / Faculty@123456, or student@attendx.edu / Student@123456.' },
        };
      },

      getSession: async () => {
        if (typeof window === 'undefined') return { data: { session: null }, error: null };
        const token = localStorage.getItem('attendx_auth_token');
        const userStr = localStorage.getItem('attendx_user');
        if (!token || !userStr) return { data: { session: null }, error: null };
        try {
          const user = JSON.parse(userStr);
          return { data: { session: { access_token: token, user } }, error: null };
        } catch {
          return { data: { session: null }, error: null };
        }
      },

      signOut: async () => {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('attendx_auth_token');
          localStorage.removeItem('attendx_user');
          localStorage.removeItem('attendx_profile');
        }
        return { error: null };
      },
    },

    functions: {
      invoke: async (functionName: string, options?: { body?: any }) => {
        const baseUrl = getLocalServerUrl();
        const token = typeof window !== 'undefined' ? localStorage.getItem('attendx_auth_token') : null;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        try {
          const res = await fetch(`${baseUrl}/api/functions/${functionName}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(options?.body || {}),
          });
          const json = await res.json();
          if (!res.ok) {
            return { data: null, error: { message: json.error || 'Function invocation failed' } };
          }
          return { data: json, error: null };
        } catch (err) {
          return { data: null, error: { message: (err as Error).message } };
        }
      },
    },
  };
}

const localClient = createApiClient();

// AttendX Data & Auth Client (kept as named exports for existing imports)
export const apiClient = localClient;
export const supabase = localClient; // legacy alias, points at the AttendX API
export const isSupabaseConfigured = false;
export const isLocalServerActive = true;
