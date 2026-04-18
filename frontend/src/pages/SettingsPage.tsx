import React, { useState } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import type { ThemeMode } from '../types';
import {
  User, Bell, Shield, Palette, Save, Check,
  Mail, LogOut, Phone, MapPin, Globe,
  Calendar, AlertCircle, IndianRupee, Lock,
  Monitor, Sun, Moon, Database, Trash2, Download,
  Eye, Info, Tag, Sparkles, Plus, X, Archive, Edit3,
  Link2, FileSpreadsheet, CheckCircle2, XCircle
} from 'lucide-react';

type Section = 'profile' | 'security' | 'notifications' | 'categories' | 'data' | 'integrations' | 'display' | 'privacy' | 'about';

type IngestionOption = {
  key: string;
  label: string;
  status: 'implemented' | 'partial' | 'blocked' | 'gated';
  reason: string;
  requires_consent: boolean;
  feature_flag?: string | null;
};

type UserConsent = {
  id: string;
  consent_type: 'statement_import' | 'aggregator_link' | 'email_parse' | 'sms_parse';
  scope: string;
  status: 'granted' | 'revoked';
  metadata?: Record<string, unknown> | null;
  granted_at?: string | null;
  revoked_at?: string | null;
};

const COUNTRIES = [
  'India', 'United States', 'United Kingdom', 'Canada', 'Australia',
  'Germany', 'France', 'Japan', 'Singapore', 'Brazil', 'South Africa',
  'UAE', 'Netherlands', 'Sweden', 'Switzerland', 'New Zealand', 'Other',
];

const SECTIONS: { id: Section; label: string; icon: any }[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'categories', label: 'Categories', icon: Tag },
  { id: 'data', label: 'Data & Backup', icon: Database },
  { id: 'integrations', label: 'Integrations', icon: Link2 },
  { id: 'display', label: 'Display', icon: Palette },
  { id: 'privacy', label: 'Privacy', icon: Eye },
  { id: 'about', label: 'About', icon: Info },
];

export const SettingsPage: React.FC = () => {
  const { user, logout, refreshUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const [section, setSection] = useState<Section>('profile');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});

  const [profile, setProfile] = useState({
    full_name: user?.full_name || '',
    email: user?.email || '',
    username: user?.profile?.username || '',
    date_of_birth: user?.profile?.date_of_birth || '',
    city: user?.city || user?.profile?.city || '',
    address: user?.profile?.address || '',
    country: user?.profile?.country || '',
    monthly_budget_inr: user?.profile?.monthly_budget_inr || '',
    mobile_number: user?.profile?.mobile_number || '',
  });

  const [prefs, setPrefs] = useState({
    monthly_income: user?.settings?.monthly_income || '',
    currency: user?.settings?.currency || user?.currency || 'INR',
    budget_alerts: user?.settings?.budget_alerts !== false,
    bill_reminders: user?.settings?.bill_reminders !== false,
    coach_tips: user?.settings?.coach_tips !== false,
    quiet_hours_start: user?.settings?.quiet_hours_start || '22:00',
    quiet_hours_end: user?.settings?.quiet_hours_end || '08:00',
    cloud_ai_opt_in: user?.settings?.cloud_ai_opt_in || false,
  });

  const [pinForm, setPinForm] = useState({ current: '', newPin: '', confirm: '' });
  const [pinError, setPinError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [exporting, setExporting] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string; icon?: string; color?: string; is_archived: boolean; is_default: boolean }[]>([]);
  const [catLoading, setCatLoading] = useState(false);
  const [showCatForm, setShowCatForm] = useState(false);
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [catForm, setCatForm] = useState({ name: '', icon: '', color: '#6366f1' });
  const [showArchived, setShowArchived] = useState(false);
  const [integrationOptions, setIntegrationOptions] = useState<IngestionOption[]>([]);
  const [integrationNotes, setIntegrationNotes] = useState<string[]>([]);
  const [consents, setConsents] = useState<UserConsent[]>([]);
  const [integrationsLoading, setIntegrationsLoading] = useState(false);

  const usernameLocked = user?.profile?.is_username_editable === false;
  const dobLocked = user?.profile?.is_date_of_birth_editable === false;
  const usernameSource = user?.profile?.username_source || 'manual';
  const dobSource = user?.profile?.date_of_birth_source || 'manual';

  const validateProfile = (): boolean => {
    const errs: Record<string, string> = {};
    if (!profile.full_name) errs.full_name = 'Full name is required';
    if (!usernameLocked && (!profile.username || profile.username.trim().length < 3)) {
      errs.username = 'Username must be at least 3 characters';
    }
    if (!profile.date_of_birth && !dobLocked) errs.date_of_birth = 'Date of birth is required';
    if (!profile.city) errs.city = 'City is required';
    setProfileErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (section === 'profile' && !validateProfile()) return;
    setSaving(true);
    setSaveError('');
    try {
      await api.patch('/auth/me', {
        full_name: profile.full_name,
        profile: {
          username: profile.username?.trim() || null,
          date_of_birth: profile.date_of_birth || null,
          city: profile.city || null,
          address: profile.address || null,
          country: profile.country,
          monthly_budget_inr: Number(profile.monthly_budget_inr) || null,
          mobile_number: profile.mobile_number,
        },
        settings: {
          monthly_income: prefs.monthly_income,
          currency: prefs.currency,
          budget_alerts: prefs.budget_alerts,
          bill_reminders: prefs.bill_reminders,
          coach_tips: prefs.coach_tips,
          quiet_hours_start: prefs.quiet_hours_start,
          quiet_hours_end: prefs.quiet_hours_end,
          cloud_ai_opt_in: prefs.cloud_ai_opt_in,
        },
      }, {
        headers: {
          'X-Profile-Source': 'manual',
        },
      });
      await refreshUser();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setSaveError(e?.response?.data?.message || e?.response?.data?.detail || 'Failed to save settings');
      console.error(e);
    }
    finally { setSaving(false); }
  };

  const handleSetPin = () => {
    if (pinForm.newPin.length < 4 || pinForm.newPin.length > 6) {
      setPinError('PIN must be 4-6 digits');
      return;
    }
    if (pinForm.newPin !== pinForm.confirm) {
      setPinError('PINs do not match');
      return;
    }
    let h = 0;
    for (let i = 0; i < pinForm.newPin.length; i++) h = ((h << 5) - h + pinForm.newPin.charCodeAt(i)) | 0;
    localStorage.setItem('finlo_pin_hash', String(h));
    setPinForm({ current: '', newPin: '', confirm: '' });
    setPinError('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleClearPin = () => {
    localStorage.removeItem('finlo_pin_hash');
    sessionStorage.removeItem('finlo_locked');
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const fetchCategories = async () => {
    setCatLoading(true);
    try {
      const res = await api.get(`/categories?include_archived=${showArchived}`);
      setCategories(res.data || []);
    } catch (e) { console.error(e); }
    finally { setCatLoading(false); }
  };

  React.useEffect(() => {
    if (section === 'categories') fetchCategories();
  }, [section, showArchived]);

  const loadIntegrations = async () => {
    setIntegrationsLoading(true);
    try {
      const [optionsRes, consentRes] = await Promise.all([
        api.get('/integrations/transaction-ingestion/options'),
        api.get('/integrations/consents'),
      ]);
      setIntegrationOptions(optionsRes.data?.options || []);
      setIntegrationNotes(optionsRes.data?.security_notes || []);
      setConsents(consentRes.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIntegrationsLoading(false);
    }
  };

  React.useEffect(() => {
    if (section === 'integrations') loadIntegrations();
  }, [section]);

  const isConsentGranted = (consentType: UserConsent['consent_type']) =>
    consents.some((c) => c.consent_type === consentType && c.status === 'granted');

  const setConsent = async (consentType: UserConsent['consent_type'], nextGranted: boolean) => {
    try {
      await api.post('/integrations/consents', {
        consent_type: consentType,
        scope: 'transactions',
        status: nextGranted ? 'granted' : 'revoked',
        metadata: { source: 'settings' },
      });
      await loadIntegrations();
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateCategory = async () => {
    if (!catForm.name.trim()) return;
    try {
      if (editingCat) {
        await api.patch(`/categories/${editingCat}`, { name: catForm.name, icon: catForm.icon || null, color: catForm.color });
      } else {
        await api.post('/categories', { name: catForm.name, icon: catForm.icon || null, color: catForm.color });
      }
      setShowCatForm(false);
      setEditingCat(null);
      setCatForm({ name: '', icon: '', color: '#6366f1' });
      fetchCategories();
    } catch (e) { console.error(e); }
  };

  const handleArchiveCategory = async (id: string, archive: boolean) => {
    await api.patch(`/categories/${id}`, { is_archived: archive });
    fetchCategories();
  };

  const handleDeleteCategory = async (id: string) => {
    await api.delete(`/categories/${id}`);
    fetchCategories();
  };

  const handleExportData = async () => {
    setExporting(true);
    try {
      const res = await api.get('/auth/me/export');
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `finlo-data-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) { console.error(e); }
    finally { setExporting(false); }
  };

  const handleDeleteAccount = async () => {
    try {
      await api.delete('/auth/me');
      logout();
    } catch (e) { console.error(e); }
  };

  const hasPin = !!localStorage.getItem('finlo_pin_hash');

  const Toggle = ({ checked, onChange, id }: { checked: boolean; onChange: (v: boolean) => void; id: string }) => (
    <label htmlFor={id} className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" id={id} className="sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
      <div className="w-10 h-5 rounded-full transition-all duration-200 relative" style={{ background: checked ? '#6366f1' : 'rgba(255,255,255,0.1)', boxShadow: checked ? '0 0 12px rgba(99,102,241,0.4)' : 'none' }}>
        <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200" style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }} />
      </div>
    </label>
  );

  const FieldError = ({ field }: { field: string }) => {
    if (!profileErrors[field]) return null;
    return <p className="flex items-center gap-1 text-xs mt-1.5" style={{ color: '#fb7185' }}><AlertCircle size={11} />{profileErrors[field]}</p>;
  };

  const RequiredStar = () => <span style={{ color: '#fb7185' }} className="ml-0.5">*</span>;

  const showSaveBtn = ['profile', 'notifications', 'display', 'privacy'].includes(section);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm mt-0.5 text-muted">Manage your account, security, and preferences</p>
      </div>
      {saveError && (
        <div className="p-3 rounded-xl text-sm" style={{ background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.24)', color: '#fb7185' }}>
          {saveError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="md:col-span-1 space-y-1">
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => setSection(s.id)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium w-full text-left transition-all ${section === s.id ? 'text-foreground' : 'text-muted hover:text-foreground'}`}
              style={{ background: section === s.id ? 'rgba(99,102,241,0.1)' : 'transparent', border: section === s.id ? '1px solid rgba(99,102,241,0.15)' : '1px solid transparent' }}
            >
              <s.icon size={15} style={{ color: section === s.id ? '#818cf8' : undefined }} />
              {s.label}
            </button>
          ))}
          <div className="pt-3 mt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button onClick={logout} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium w-full text-left text-muted hover:text-danger hover:bg-danger/10 transition-all">
              <LogOut size={15} /> Sign Out
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="md:col-span-3">
          <div className="glass-panel p-6 space-y-6">

            {/* Profile */}
            {section === 'profile' && (
              <div className="space-y-5 animate-fade-in">
                <div className="flex items-center gap-3 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-base font-bold" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' }}>
                    {(user?.full_name || user?.email || 'U').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-foreground">{user?.full_name || 'Your Name'}</p>
                    <p className="text-xs text-muted">{user?.email}</p>
                  </div>
                </div>
                <div className="p-3 rounded-xl flex items-start gap-2.5 text-xs" style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.12)' }}>
                  <AlertCircle size={14} style={{ color: '#818cf8' }} className="flex-shrink-0 mt-0.5" />
                  <span className="text-muted">
                    Fields marked with <span style={{ color: '#fb7185' }}>*</span> are required. Username and date of birth are locked after first set/import.
                  </span>
                </div>
                <div>
                  <label className="label-text flex items-center gap-1.5"><User size={11} />Full Name<RequiredStar /></label>
                  <input value={profile.full_name} onChange={e => setProfile(p => ({ ...p, full_name: e.target.value }))} placeholder="Your full name" className="input-field" />
                  <FieldError field="full_name" />
                </div>
                <div>
                  <label className="label-text flex items-center gap-1.5">
                    <User size={11} />
                    Username
                    <RequiredStar />
                  </label>
                  <div className="relative">
                    <input
                      value={profile.username}
                      onChange={e => setProfile(p => ({ ...p, username: e.target.value }))}
                      placeholder="Your username"
                      className={`input-field ${usernameLocked ? 'opacity-60 cursor-not-allowed pr-10' : ''}`}
                      disabled={usernameLocked}
                    />
                    {usernameLocked && <Lock size={13} className="absolute right-3 top-3 text-muted" />}
                  </div>
                  <p className="text-xs text-muted mt-1">Source: {usernameSource}</p>
                  <FieldError field="username" />
                </div>
                <div>
                  <label className="label-text flex items-center gap-1.5"><Mail size={11} />Email Address</label>
                  <input value={profile.email} readOnly className="input-field opacity-50 cursor-not-allowed" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label-text flex items-center gap-1.5"><Calendar size={11} />Date of Birth<RequiredStar /></label>
                    <div className="relative">
                      <input
                        type="date"
                        value={profile.date_of_birth}
                        onChange={e => setProfile(p => ({ ...p, date_of_birth: e.target.value }))}
                        className={`input-field ${dobLocked ? 'opacity-60 cursor-not-allowed pr-10' : ''}`}
                        disabled={dobLocked}
                      />
                      {dobLocked && <Lock size={13} className="absolute right-3 top-3 text-muted" />}
                    </div>
                    <p className="text-xs text-muted mt-1">Source: {dobSource}</p>
                    <FieldError field="date_of_birth" />
                  </div>
                  <div>
                    <label className="label-text flex items-center gap-1.5"><MapPin size={11} />City<RequiredStar /></label>
                    <input value={profile.city} onChange={e => { setProfile(p => ({ ...p, city: e.target.value })); setProfileErrors(pe => ({ ...pe, city: '' })); }} placeholder="Your city" className="input-field" />
                    <FieldError field="city" />
                  </div>
                </div>
                <div>
                  <label className="label-text flex items-center gap-1.5"><Phone size={11} />Mobile Number</label>
                  <input type="tel" value={profile.mobile_number} readOnly disabled placeholder="+91 98765 43210" className="input-field opacity-50 cursor-not-allowed" />
                </div>
                <div>
                  <label className="label-text flex items-center gap-1.5"><Globe size={11} />Country</label>
                  <select value={profile.country} onChange={e => setProfile(p => ({ ...p, country: e.target.value }))} className="input-field">
                    <option value="">Select</option>
                    {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label-text flex items-center gap-1.5"><IndianRupee size={11} />Monthly Income (optional, encrypted)</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-sm font-medium text-muted">₹</span>
                    <input type="number" min={0} value={prefs.monthly_income} onChange={e => setPrefs(p => ({ ...p, monthly_income: e.target.value }))} placeholder="e.g. 50000" className="input-field pl-8" />
                  </div>
                </div>
                <div>
                  <label className="label-text">Default Currency</label>
                  <select value={prefs.currency} onChange={e => setPrefs(p => ({ ...p, currency: e.target.value }))} className="input-field">
                    {['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'SGD'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* Security */}
            {section === 'security' && (
              <div className="space-y-5 animate-fade-in">
                <div className="p-4 rounded-xl flex items-start gap-3" style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.12)' }}>
                  <Shield size={16} style={{ color: '#818cf8' }} className="flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Session PIN Lock</p>
                    <p className="text-xs text-muted mt-1">After 5 minutes of inactivity, the app locks and requires your PIN.</p>
                  </div>
                </div>
                {hasPin ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div className="flex items-center gap-3">
                        <Lock size={14} style={{ color: '#22c55e' }} />
                        <div>
                          <p className="text-sm font-medium text-foreground">PIN Lock Active</p>
                          <p className="text-xs text-muted">Your session is protected with a PIN</p>
                        </div>
                      </div>
                      <span className="badge-success text-xs">Enabled</span>
                    </div>
                    <button onClick={handleClearPin} className="text-sm text-danger hover:underline">Remove PIN Lock</button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="label-text">New PIN (4-6 digits)</label>
                      <input type="password" inputMode="numeric" maxLength={6} value={pinForm.newPin} onChange={e => setPinForm(f => ({ ...f, newPin: e.target.value.replace(/\D/g, '') }))} className="input-field" placeholder="Enter PIN" />
                    </div>
                    <div>
                      <label className="label-text">Confirm PIN</label>
                      <input type="password" inputMode="numeric" maxLength={6} value={pinForm.confirm} onChange={e => setPinForm(f => ({ ...f, confirm: e.target.value.replace(/\D/g, '') }))} className="input-field" placeholder="Confirm PIN" />
                    </div>
                    {pinError && <p className="text-xs" style={{ color: '#fb7185' }}>{pinError}</p>}
                    <button onClick={handleSetPin} className="btn-primary text-sm">Set PIN</button>
                  </div>
                )}
                <div className="pt-4 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <h4 className="text-sm font-medium text-foreground">Security Status</h4>
                  {[
                    { label: 'Data Encryption', desc: 'AES-256 at rest, TLS 1.3 in transit', status: 'Active' },
                    { label: 'JWT Authentication', desc: 'Signed tokens with auto-refresh', status: 'Active' },
                    { label: 'E2E Encryption', desc: 'Financial fields encrypted end-to-end', status: 'Active' },
                  ].map(({ label, desc, status }) => (
                    <div key={label} className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div>
                        <p className="text-sm font-medium text-foreground">{label}</p>
                        <p className="text-xs text-muted mt-0.5">{desc}</p>
                      </div>
                      <span className="badge-success text-xs">{status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notifications */}
            {section === 'notifications' && (
              <div className="space-y-5 animate-fade-in">
                {[
                  { id: 'budget-alerts', label: 'Budget Alerts', desc: 'Notify at 80% and 100% of budget limits', value: prefs.budget_alerts, onChange: (v: boolean) => setPrefs(p => ({ ...p, budget_alerts: v })) },
                  { id: 'bill-reminders', label: 'Bill Reminders', desc: 'Reminders before bill due dates', value: prefs.bill_reminders, onChange: (v: boolean) => setPrefs(p => ({ ...p, bill_reminders: v })) },
                  { id: 'coach-tips', label: 'AI Coach Tips', desc: 'Personalized spending suggestions', value: prefs.coach_tips, onChange: (v: boolean) => setPrefs(p => ({ ...p, coach_tips: v })) },
                ].map(({ id, label, desc, value, onChange }) => (
                  <div key={id} className="flex items-center justify-between p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="flex items-start gap-3">
                      <Bell size={14} className="mt-0.5" style={{ color: '#818cf8' }} />
                      <div>
                        <p className="text-sm font-medium text-foreground">{label}</p>
                        <p className="text-xs text-muted mt-0.5">{desc}</p>
                      </div>
                    </div>
                    <Toggle id={id} checked={value} onChange={onChange} />
                  </div>
                ))}
                <div className="pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <h4 className="text-sm font-medium text-foreground mb-3">Quiet Hours</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label-text">Start</label>
                      <input type="time" value={prefs.quiet_hours_start} onChange={e => setPrefs(p => ({ ...p, quiet_hours_start: e.target.value }))} className="input-field" />
                    </div>
                    <div>
                      <label className="label-text">End</label>
                      <input type="time" value={prefs.quiet_hours_end} onChange={e => setPrefs(p => ({ ...p, quiet_hours_end: e.target.value }))} className="input-field" />
                    </div>
                  </div>
                  <p className="text-xs text-muted mt-2">No notifications during quiet hours</p>
                </div>
              </div>
            )}

            {/* Categories */}
            {section === 'categories' && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted">Manage your expense categories. Default categories can be archived but not deleted.</p>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
                      <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="rounded" />
                      Show archived
                    </label>
                    <button onClick={() => { setShowCatForm(true); setEditingCat(null); setCatForm({ name: '', icon: '', color: '#6366f1' }); }} className="btn-primary text-xs flex items-center gap-1.5 px-3 py-1.5">
                      <Plus size={13} /> Add
                    </button>
                  </div>
                </div>

                {/* Category Form Modal */}
                {showCatForm && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={e => { if (e.target === e.currentTarget) setShowCatForm(false); }}>
                    <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-base font-semibold text-foreground">{editingCat ? 'Edit Category' : 'New Category'}</h3>
                        <button onClick={() => setShowCatForm(false)} className="p-1.5 rounded-lg text-muted hover:text-foreground"><X size={16} /></button>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <label className="label-text">Name</label>
                          <input value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} className="input-field" placeholder="Category name" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="label-text">Icon (Lucide name)</label>
                            <input value={catForm.icon} onChange={e => setCatForm(f => ({ ...f, icon: e.target.value }))} className="input-field" placeholder="e.g. coffee, car" />
                          </div>
                          <div>
                            <label className="label-text">Color</label>
                            <div className="flex items-center gap-2">
                              <input type="color" value={catForm.color} onChange={e => setCatForm(f => ({ ...f, color: e.target.value }))} className="w-8 h-8 rounded cursor-pointer border-0" />
                              <input value={catForm.color} onChange={e => setCatForm(f => ({ ...f, color: e.target.value }))} className="input-field flex-1" placeholder="#6366f1" />
                            </div>
                          </div>
                        </div>
                        <button onClick={handleCreateCategory} className="btn-primary w-full">{editingCat ? 'Save Changes' : 'Create Category'}</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Category List */}
                {catLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <div key={i} className="skeleton h-12 rounded-xl" />)}
                  </div>
                ) : categories.length === 0 ? (
                  <div className="text-center py-8">
                    <Tag size={24} className="mx-auto mb-2 text-muted opacity-30" />
                    <p className="text-sm text-muted">No categories yet.</p>
                    <button onClick={() => api.post('/categories/init').then(() => fetchCategories())} className="btn-primary text-xs mt-3">Initialize Defaults</button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {categories.map(cat => (
                      <div key={cat.id} className={`flex items-center justify-between p-3 rounded-xl group ${cat.is_archived ? 'opacity-50' : ''}`} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${cat.color || '#6b7280'}20`, border: `1px solid ${cat.color || '#6b7280'}40` }}>
                            <Tag size={12} style={{ color: cat.color || '#6b7280' }} />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{cat.name}</p>
                            <p className="text-xs text-muted">{cat.is_default ? 'Default' : 'Custom'}{cat.is_archived ? ' · Archived' : ''}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setEditingCat(cat.id); setCatForm({ name: cat.name, icon: cat.icon || '', color: cat.color || '#6366f1' }); setShowCatForm(true); }} className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-white/5">
                            <Edit3 size={12} />
                          </button>
                          {cat.is_archived ? (
                            <button onClick={() => handleArchiveCategory(cat.id, false)} className="p-1.5 rounded-lg text-muted hover:text-success hover:bg-success/10" title="Restore">
                              <Archive size={12} />
                            </button>
                          ) : (
                            <button onClick={() => handleArchiveCategory(cat.id, true)} className="p-1.5 rounded-lg text-muted hover:text-warning hover:bg-warning/10" title="Archive">
                              <Archive size={12} />
                            </button>
                          )}
                          {!cat.is_default && (
                            <button onClick={() => handleDeleteCategory(cat.id)} className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-danger/10">
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Data & Backup */}
            {section === 'data' && (
              <div className="space-y-4 animate-fade-in">
                {/* Export */}
                <div className="flex items-center justify-between p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="flex items-start gap-3">
                    <Download size={14} className="mt-0.5" style={{ color: '#818cf8' }} />
                    <div>
                      <p className="text-sm font-medium text-foreground">Export All Data</p>
                      <p className="text-xs text-muted mt-0.5">Download all your data as JSON</p>
                    </div>
                  </div>
                  <button onClick={handleExportData} disabled={exporting} className="text-xs px-3 py-1.5 rounded-lg transition-all text-primary border border-primary/20 hover:bg-primary/10">
                    {exporting ? 'Exporting...' : 'Export'}
                  </button>
                </div>
                {/* Delete Account */}
                <div className="flex items-center justify-between p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(239,68,68,0.15)' }}>
                  <div className="flex items-start gap-3">
                    <Trash2 size={14} className="mt-0.5" style={{ color: '#ef4444' }} />
                    <div>
                      <p className="text-sm font-medium text-foreground">Delete Account</p>
                      <p className="text-xs text-muted mt-0.5">Permanently delete your account and all data</p>
                    </div>
                  </div>
                  <button onClick={() => setShowDeleteConfirm(true)} className="text-xs px-3 py-1.5 rounded-lg transition-all text-danger border border-danger/20 hover:bg-danger/10">
                    Delete
                  </button>
                </div>
                {/* Delete Confirmation Modal */}
                {showDeleteConfirm && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={e => { if (e.target === e.currentTarget) setShowDeleteConfirm(false); }}>
                    <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid rgba(239,68,68,0.2)' }}>
                      <h3 className="text-base font-semibold text-foreground mb-2">Delete Account</h3>
                      <p className="text-sm text-muted mb-4">This action is permanent and cannot be undone. All your data will be deleted.</p>
                      <p className="text-xs text-muted mb-2">Type <strong className="text-danger">DELETE</strong> to confirm:</p>
                      <input value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} className="input-field mb-3" placeholder="DELETE" autoFocus />
                      <div className="flex gap-2">
                        <button onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }} className="btn-secondary flex-1">Cancel</button>
                        <button onClick={handleDeleteAccount} disabled={deleteConfirmText !== 'DELETE'} className="flex-1 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-30" style={{ background: deleteConfirmText === 'DELETE' ? 'rgba(239,68,68,0.15)' : 'transparent', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                          Delete Forever
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Integrations */}
            {section === 'integrations' && (
              <div className="space-y-4 animate-fade-in">
                <div className="p-4 rounded-xl" style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.14)' }}>
                  <p className="text-sm font-medium text-foreground">Transaction ingestion permissions</p>
                  <p className="text-xs text-muted mt-1">
                    Enable only the flows you want. Finlo records explicit consent and does not store CVV or full card details.
                  </p>
                </div>

                {integrationsLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((idx) => <div key={idx} className="skeleton h-14 rounded-xl" />)}
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      {integrationOptions.map((option) => {
                        const color = option.status === 'implemented'
                          ? '#34d399'
                          : option.status === 'partial'
                            ? '#fbbf24'
                            : option.status === 'gated'
                              ? '#818cf8'
                              : '#fb7185';
                        return (
                          <div key={option.key} className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-medium text-foreground">{option.label}</p>
                                <p className="text-xs text-muted mt-1">{option.reason}</p>
                              </div>
                              <span className="text-xs px-2.5 py-1 rounded-full" style={{ color, background: `${color}20`, border: `1px solid ${color}40` }}>
                                {option.status}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="pt-3 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <p className="text-sm font-medium text-foreground">Consent controls</p>
                      {[
                        { key: 'statement_import', label: 'Statement import (CSV/PDF)' },
                        { key: 'aggregator_link', label: 'Bank aggregator linking' },
                        { key: 'email_parse', label: 'Email statement parsing' },
                        { key: 'sms_parse', label: 'SMS parsing (mobile)' },
                      ].map(({ key, label }) => {
                        const granted = isConsentGranted(key as UserConsent['consent_type']);
                        return (
                          <div key={key} className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <div className="flex items-center gap-2">
                              {granted ? <CheckCircle2 size={14} className="text-success" /> : <XCircle size={14} className="text-muted" />}
                              <span className="text-sm text-foreground">{label}</span>
                            </div>
                            <button
                              onClick={() => setConsent(key as UserConsent['consent_type'], !granted)}
                              className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${granted ? 'text-warning border-warning/30 hover:bg-warning/10' : 'text-success border-success/30 hover:bg-success/10'}`}
                            >
                              {granted ? 'Revoke' : 'Grant'}
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {integrationNotes.length > 0 && (
                      <div className="pt-3 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        {integrationNotes.map((note) => (
                          <div key={note} className="text-xs text-muted p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)' }}>
                            {note}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="p-3 rounded-xl flex items-start gap-3" style={{ background: 'rgba(20,184,166,0.08)', border: '1px solid rgba(20,184,166,0.2)' }}>
                      <FileSpreadsheet size={15} style={{ color: '#14b8a6' }} className="mt-0.5" />
                      <p className="text-xs text-muted">
                        Statement import requires <strong className="text-foreground">statement import consent</strong>. Go to Transactions to upload CSV once granted.
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Display */}
            {section === 'display' && (
              <div className="space-y-5 animate-fade-in">
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-3">Theme</h4>
                  <div className="grid grid-cols-3 gap-3">
                    {([
                      { mode: 'light' as ThemeMode, icon: Sun, label: 'Light' },
                      { mode: 'dark' as ThemeMode, icon: Moon, label: 'Dark' },
                      { mode: 'system' as ThemeMode, icon: Monitor, label: 'System' },
                    ]).map(({ mode, icon: Icon, label }) => (
                      <button key={mode} onClick={() => setTheme(mode)}
                        className={`p-4 rounded-xl text-center transition-all ${theme === mode ? 'ring-2 ring-primary/40' : ''}`}
                        style={{ background: theme === mode ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.025)', border: `1px solid ${theme === mode ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)'}` }}
                      >
                        <Icon size={20} className="mx-auto mb-2" style={{ color: theme === mode ? '#818cf8' : '#888899' }} />
                        <p className="text-xs font-medium" style={{ color: theme === mode ? '#818cf8' : '#888899' }}>{label}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-3">Number Format</h4>
                  <p className="text-sm text-muted">Currency format follows your selected currency (INR uses Indian numbering: 1,00,000)</p>
                </div>
              </div>
            )}

            {/* Privacy */}
            {section === 'privacy' && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center justify-between p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="flex items-start gap-3">
                    <Sparkles size={14} className="mt-0.5" style={{ color: '#818cf8' }} />
                    <div>
                      <p className="text-sm font-medium text-foreground">Cloud AI Summary</p>
                      <p className="text-xs text-muted mt-0.5">Send anonymised category totals for AI-generated spending summary. No merchant names or personal data.</p>
                    </div>
                  </div>
                  <Toggle id="cloud-ai" checked={prefs.cloud_ai_opt_in} onChange={v => setPrefs(p => ({ ...p, cloud_ai_opt_in: v }))} />
                </div>
                {[
                  { label: 'Data Anonymization', desc: 'Personal identifiers stripped before any AI processing' },
                  { label: 'Bill Image Policy', desc: 'Bill images processed on-device only, never stored on servers' },
                  { label: 'No Clipboard Access', desc: 'Financial input fields do not allow clipboard paste for security' },
                ].map(({ label, desc }) => (
                  <div key={label} className="flex items-center justify-between p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div>
                      <p className="text-sm font-medium text-foreground">{label}</p>
                      <p className="text-xs text-muted mt-0.5">{desc}</p>
                    </div>
                    <span className="badge-success text-xs">Active</span>
                  </div>
                ))}
              </div>
            )}

            {/* About */}
            {section === 'about' && (
              <div className="space-y-4 animate-fade-in">
                <div className="text-center py-4">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', boxShadow: '0 8px 24px rgba(99,102,241,0.3)' }}>
                    <IndianRupee size={28} className="text-white" />
                  </div>
                  <h2 className="text-lg font-bold text-foreground">Finlo</h2>
                  <p className="text-xs text-muted mt-1">Personal Expense Tracker</p>
                  <p className="text-xs text-muted mt-0.5">Version 2.0.0</p>
                </div>
                {[
                  { label: 'Version', value: '2.0.0' },
                  { label: 'Build', value: 'Web App (React + TypeScript)' },
                  { label: 'Backend', value: 'Supabase + FastAPI' },
                  { label: 'Encryption', value: 'AES-256, TLS 1.3, pgcrypto' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className="text-sm text-muted">{label}</span>
                    <span className="text-sm text-foreground">{value}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Save Button */}
            {showSaveBtn && (
              <div className="flex justify-end pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2 text-sm">
                  {saved ? <><Check size={14} /> Saved!</> : saving ? <>Saving...</> : <><Save size={14} /> Save Changes</>}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
