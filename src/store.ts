import { create } from 'zustand'
import type { Profile, Role, Session } from './types'
import { supabase } from './lib/supabase'

const emptyProfiles: Record<Role, Profile> = {
  student: { id: '', full_name: '', role: 'student', identifier: '', email: '', department: '' },
  faculty: { id: '', full_name: '', role: 'faculty', identifier: '', email: '', department: '' },
  admin: { id: '', full_name: '', role: 'admin', identifier: '', email: '', department: '' }
}

interface AppState {
  role: Role
  profile: Profile
  authenticated: boolean
  activeSession: Session | null
  authLoading: boolean
  signIn: (email: string, password: string, expectedRole: Role) => Promise<string | null>
  bootstrap: () => Promise<void>
  signOut: () => Promise<void>
  setMustChangePassword: (value: boolean) => void
  setSession: (session: Session | null) => void
}

function normalizeProfile(row: any): Profile {
  return { id: row.id, full_name: row.full_name, role: row.role, identifier: row.identifier, email: row.email, department: row.department ?? '', avatar: row.avatar_path, must_change_password: row.must_change_password, approval_status: row.approval_status }
}

export const useAppStore = create<AppState>((set) => ({
  role: 'student', profile: emptyProfiles.student, authenticated: false, authLoading: true, activeSession: null,
  signIn: async (email, password, expectedRole) => {
    if (!supabase) {
      set({ role: expectedRole, profile: emptyProfiles[expectedRole], authenticated: true, authLoading: false })
      return null
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    if (error || !data.user) return error?.message ?? 'Sign in failed'
    const { data: row, error: profileError } = await supabase.from('profiles').select('*').eq('id', data.user.id).single()
    if (profileError || !row) { await supabase.auth.signOut(); return 'Your AttendX profile is not configured. Contact an administrator.' }
    if (!row.is_active) { await supabase.auth.signOut(); return 'This account has been deactivated.' }
    if (row.role !== expectedRole) { await supabase.auth.signOut(); return 'Invalid login credentials for this workspace.' }
    set({ role: row.role, profile: normalizeProfile(row), authenticated: true, authLoading: false })
    return null
  },
  bootstrap: async () => {
    if (!supabase) { set({ authLoading: false }); return }
    const { data } = await supabase.auth.getSession()
    if (!data.session?.user) { set({ authenticated: false, authLoading: false }); return }
    const { data: row } = await supabase.from('profiles').select('*').eq('id', data.session.user.id).maybeSingle()
    if (!row?.is_active) { await supabase.auth.signOut(); set({ authenticated: false, authLoading: false }); return }
    set({ role: row.role, profile: normalizeProfile(row), authenticated: true, authLoading: false })
  },
  signOut: async () => { if (supabase) await supabase.auth.signOut(); set({ authenticated: false, authLoading: false, activeSession: null }) },
  setMustChangePassword: (value) => set((state) => ({ profile: { ...state.profile, must_change_password: value } })),
  setSession: (activeSession) => set({ activeSession })
}))
