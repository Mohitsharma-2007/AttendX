import { Capacitor } from '@capacitor/core'
import type { LucideIcon } from 'lucide-react'
import { Bell, BookOpen, CalendarDays, ChevronDown, CircleUserRound, ClipboardCheck, Grid2X2, History, KeyRound, LifeBuoy, LogOut, Menu, QrCode, Server, Settings, ShieldCheck, Smartphone, Users, X, Database } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { Role } from '../types'
import { useAppStore } from '../store'
import { Initials, Logo, Button } from './ui'
import { getLocalServerUrl, setLocalServerUrl } from '../lib/apiClient'
import { UpdateBanner } from './UpdateBanner'

export type ViewKey = 'home' | 'mark' | 'history' | 'classes' | 'session' | 'people' | 'passwords' | 'review' | 'settings' | 'invites' | 'profile' | 'queries'
type Nav = { key: ViewKey; label: string; icon: LucideIcon }
const navByRole: Record<Role, Nav[]> = {
  student: [{ key: 'home', label: 'Overview', icon: Grid2X2 }, { key: 'mark', label: 'Mark attendance', icon: QrCode }, { key: 'classes', label: 'My classes', icon: BookOpen }, { key: 'queries', label: 'Attendance help', icon: LifeBuoy }, { key: 'history', label: 'History', icon: History }],
  faculty: [{ key: 'home', label: 'Overview', icon: Grid2X2 }, { key: 'session', label: 'Live session', icon: QrCode }, { key: 'classes', label: 'My classes', icon: BookOpen }, { key: 'history', label: 'Attendance', icon: ClipboardCheck }],
  admin: [{ key: 'home', label: 'Overview', icon: Grid2X2 }, { key: 'people', label: 'People', icon: Users }, { key: 'passwords', label: 'Password requests', icon: KeyRound }, { key: 'classes', label: 'Classes', icon: CalendarDays }, { key: 'review', label: 'Review queue', icon: ShieldCheck }, { key: 'queries', label: 'Attendance queries', icon: LifeBuoy }, { key: 'history', label: 'Records', icon: ClipboardCheck }, { key: 'settings', label: 'Settings', icon: Settings }]
}

export function Shell({ view, setView, children }: { view: ViewKey; setView: (view: ViewKey) => void; children: ReactNode }) {
  const { role, profile, signOut } = useAppStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const [serverModalOpen, setServerModalOpen] = useState(false)
  const [serverInput, setServerInput] = useState(getLocalServerUrl())
  const nav = navByRole[role]
  const select = (key: ViewKey) => { setView(key); setMenuOpen(false) }

  const saveServer = () => {
    setLocalServerUrl(serverInput)
    setServerModalOpen(false)
    window.location.reload()
  }

  const isNative = Capacitor.isNativePlatform()

  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-head"><Logo /><button className="icon-button sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Close navigation"><X /></button></div>
      <nav className="main-nav" aria-label="Main navigation">
        <p className="nav-eyebrow">Workspace</p>
        {nav.map(({ key, label, icon: Icon }) => <button key={key} className={view === key ? 'active' : ''} onClick={() => select(key)}><Icon size={19}/><span>{label}</span></button>)}
      </nav>
      <div className="sidebar-foot">
        <button className="account-button" onClick={() => select('profile')}><Initials name={profile.full_name} /><span><strong>{profile.full_name}</strong><small>{profile.identifier}</small></span><ChevronDown size={16}/></button>
        <button className="signout" onClick={signOut}><LogOut size={17}/>Sign out</button>
      </div>
    </aside>
    {menuOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <main className="workspace">
      <header className="topbar">
        <button className="icon-button menu-button" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu /></button>
        <div className="topbar-brand"><Logo compact /></div>
        <span className="role-chip">{role}</span>
        <button
          className="role-chip"
          style={{ cursor: 'pointer', background: 'rgba(16, 185, 129, 0.12)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          onClick={() => setServerModalOpen(true)}
          title="Configure Server URL"
        >
          <Database size={14} />
          <span>MongoDB/Local</span>
        </button>
        <div className="topbar-actions">
          <button className="icon-button notification-button" aria-label="Notifications"><Bell size={20}/><i /></button>
          <button className="compact-profile" onClick={() => select('profile')}><Initials name={profile.full_name} size="sm"/><span>{profile.full_name.split(' ')[0]}</span></button>
        </div>
      </header>
      <div className="content"><UpdateBanner />{children}</div>
    </main>
    <nav className="mobile-nav">{nav.slice(0, 4).map(({ key, label, icon: Icon }) => <button key={key} className={view === key ? 'active' : ''} onClick={() => select(key)}><Icon size={20}/><span>{label.replace(' attendance', '')}</span></button>)}<button className={view === 'profile' ? 'active' : ''} onClick={() => select('profile')}><CircleUserRound size={20}/><span>Profile</span></button></nav>

    {serverModalOpen && (
      <div className="modal-backdrop" onClick={() => setServerModalOpen(false)}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px', padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Server size={18} /> Backend Server Connection
            </h3>
            <button className="icon-button" onClick={() => setServerModalOpen(false)}><X size={18}/></button>
          </div>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted, #94a3b8)', marginBottom: '1rem' }}>
            {isNative
              ? 'Enter your laptop\'s IP address (e.g. http://192.168.1.50:3001) so the app can communicate with your local database.'
              : 'When running AttendX on your phone or on Vercel, enter your laptop\'s IP address (e.g. http://192.168.1.50:3001) so the app can communicate with your local database.'
            }
          </p>
          <input
            type="text"
            className="input"
            value={serverInput}
            onChange={(e) => setServerInput(e.target.value)}
            placeholder="http://localhost:3001"
            style={{ width: '100%', marginBottom: '1rem' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <Button variant="secondary" onClick={() => setServerModalOpen(false)}>Cancel</Button>
            <Button onClick={saveServer}>Save & Connect</Button>
          </div>
        </div>
      </div>
    )}
  </div>
}
