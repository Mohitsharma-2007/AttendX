import { useState, useEffect } from 'react';
import { Server, Database, CloudUpload, Download, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './ui';
import { getLocalServerUrl, setLocalServerUrl } from '../lib/supabase';

export function ServerAndSyncSettings() {
  const [serverUrl, setServerUrlState] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Supabase migration state
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [serviceKey, setServiceKey] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [syncError, setSyncError] = useState('');

  useEffect(() => {
    setServerUrlState(getLocalServerUrl());
  }, []);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${serverUrl.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const json = await res.json();
        setTestResult({
          ok: true,
          message: `Connected! Database: ${(json.database || 'active').toUpperCase()} (Server v${json.status})`,
        });
        setLocalServerUrl(serverUrl);
      } else {
        setTestResult({ ok: false, message: `Server responded with status ${res.status}` });
      }
    } catch (err) {
      setTestResult({
        ok: false,
        message: `Connection failed: ${(err as Error).message}. Ensure AttendX local server is running.`,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleStartSync = async () => {
    if (!supabaseUrl || !serviceKey) {
      setSyncError('Please provide both Supabase URL and Service Role Key');
      return;
    }
    setSyncing(true);
    setSyncError('');
    setSyncResult(null);

    try {
      const res = await fetch(`${getLocalServerUrl()}/api/sync/to-supabase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supabaseUrl, serviceRoleKey: serviceKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSyncError(data.error || 'Migration failed');
      } else {
        setSyncResult(data);
      }
    } catch (err) {
      setSyncError((err as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  const handleExportBackup = () => {
    window.open(`${getLocalServerUrl()}/api/sync/export-json`, '_blank');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1.5rem' }}>
      {/* Local Server Config */}
      <section className="panel">
        <div className="panel-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Server size={20} />
            <h2>Local Server & Network Access</h2>
          </div>
        </div>
        <p style={{ color: 'var(--text-muted, #94a3b8)', marginBottom: '1rem', fontSize: '0.9rem' }}>
          Connect this web application or mobile device to your laptop's local database server.
          Works on LAN (Wi-Fi) without cloud dependencies.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="input"
            value={serverUrl}
            onChange={(e) => setServerUrlState(e.target.value)}
            placeholder="http://localhost:3001 or http://192.168.1.50:3001"
            style={{ flex: 1, minWidth: '280px' }}
          />
          <Button onClick={handleTestConnection} disabled={testing}>
            <RefreshCw size={16} className={testing ? 'spin' : ''} />
            {testing ? 'Testing...' : 'Test & Save'}
          </Button>
        </div>
        {testResult && (
          <div
            style={{
              marginTop: '0.75rem',
              padding: '0.6rem 0.9rem',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.88rem',
              backgroundColor: testResult.ok ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: testResult.ok ? '#22c55e' : '#ef4444',
            }}
          >
            {testResult.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {testResult.message}
          </div>
        )}
      </section>

      {/* 1-Click Migration to Supabase */}
      <section className="panel">
        <div className="panel-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <CloudUpload size={20} />
            <h2>1-Click Migration to Supabase</h2>
          </div>
        </div>
        <p style={{ color: 'var(--text-muted, #94a3b8)', marginBottom: '1rem', fontSize: '0.9rem' }}>
          Push all locally collected attendance records, profiles, batches, and photo evidence from this laptop
          directly into your cloud Supabase database and storage in one linear operation.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <input
            type="text"
            className="input"
            value={supabaseUrl}
            onChange={(e) => setSupabaseUrl(e.target.value)}
            placeholder="Target Supabase URL (e.g., https://your-ref.supabase.co)"
          />
          <input
            type="password"
            className="input"
            value={serviceKey}
            onChange={(e) => setServiceKey(e.target.value)}
            placeholder="Supabase Service Role Key (secret)"
          />
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <Button onClick={handleStartSync} disabled={syncing}>
              <Database size={16} />
              {syncing ? 'Migrating Data...' : 'Migrate Everything to Supabase'}
            </Button>
            <Button variant="secondary" onClick={handleExportBackup}>
              <Download size={16} />
              Export Local Backup (JSON)
            </Button>
          </div>
        </div>

        {syncError && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem',
              borderRadius: '6px',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <AlertCircle size={16} />
            {syncError}
          </div>
        )}

        {syncResult && (
          <div
            style={{
              marginTop: '1rem',
              padding: '1rem',
              borderRadius: '6px',
              backgroundColor: 'rgba(34, 197, 94, 0.12)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#22c55e', fontWeight: 600 }}>
              <CheckCircle2 size={18} />
              {syncResult.message}
            </div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted, #94a3b8)' }}>
              Evidence files uploaded: <strong>{syncResult.uploadedEvidenceCount}</strong>
            </div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
              <strong>Table counts:</strong>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                {Object.entries(syncResult.recordsMigrated || {}).map(([tbl, cnt]) => (
                  <span key={tbl} className="status status-present">
                    {tbl}: {String(cnt)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
