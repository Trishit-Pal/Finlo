import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Lock, User as UserIcon, Calendar, MapPin } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

export const ProfileBootstrap: React.FC = () => {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [username, setUsername] = useState(user?.profile?.username || '');
  const [dateOfBirth, setDateOfBirth] = useState(user?.profile?.date_of_birth || '');
  const [city, setCity] = useState(user?.profile?.city || user?.city || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const usernameLocked = user?.profile?.is_username_editable === false;
  const dobLocked = user?.profile?.is_date_of_birth_editable === false;

  const canSubmit = useMemo(() => {
    const hasUsername = usernameLocked ? !!user?.profile?.username : username.trim().length >= 3;
    const hasDob = dobLocked ? !!user?.profile?.date_of_birth : !!dateOfBirth;
    return hasUsername && hasDob;
  }, [usernameLocked, dobLocked, user?.profile?.username, user?.profile?.date_of_birth, username, dateOfBirth]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    setError('');
    try {
      await api.patch('/auth/me', {
        profile: {
          username: usernameLocked ? user?.profile?.username : username.trim(),
          date_of_birth: dobLocked ? user?.profile?.date_of_birth : dateOfBirth,
          city: city || null,
        },
      });
      await refreshUser();
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.detail || 'Unable to save profile details.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg glass-panel p-7 sm:p-8">
        <h1 className="text-2xl font-bold text-foreground">Complete Your Profile</h1>
        <p className="text-sm text-muted mt-1">
          We need a username and date of birth to initialize your secure Finlo profile.
        </p>

        <div className="mt-4 p-3 rounded-xl text-xs text-muted" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.18)' }}>
          Username and date of birth become locked after first set/import for integrity and auditability.
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl text-sm" style={{ background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.25)', color: '#fb7185' }}>
            {error}
          </div>
        )}

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="label-text flex items-center gap-1.5"><UserIcon size={12} /> Username</label>
            <div className="relative">
              <input
                className="input-field pr-10"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                minLength={3}
                disabled={usernameLocked}
                placeholder="Your username"
                required={!usernameLocked}
              />
              {usernameLocked && <Lock size={14} className="absolute right-3 top-3 text-muted" />}
            </div>
          </div>

          <div>
            <label className="label-text flex items-center gap-1.5"><Calendar size={12} /> Date of Birth</label>
            <div className="relative">
              <input
                className="input-field pr-10"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                disabled={dobLocked}
                required={!dobLocked}
              />
              {dobLocked && <Lock size={14} className="absolute right-3 top-3 text-muted" />}
            </div>
          </div>

          <div>
            <label className="label-text flex items-center gap-1.5"><MapPin size={12} /> City (optional)</label>
            <input
              className="input-field"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Your city"
            />
          </div>

          <button className="btn-primary w-full flex items-center justify-center gap-2" type="submit" disabled={saving || !canSubmit}>
            {saving ? 'Saving...' : 'Continue to Dashboard'}
            {!saving && <CheckCircle2 size={15} />}
          </button>
        </form>
      </div>
    </div>
  );
};

