import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { usePlatform } from '../../lib/platform';
import { acceptInvite, bootstrapAccount, fetchBootstrapStatus, fetchInvite } from '../../services/auth-api';

function formatTime(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function LoginPage() {
  const { login, requestCode, verifyCode, authMode } = useAuth();
  const { state, refreshFromServer } = usePlatform();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite');

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [previewCode, setPreviewCode] = useState('');
  const [step, setStep] = useState<'request' | 'verify'>(authMode === 'api' ? 'request' : 'verify');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [nextAllowedAt, setNextAllowedAt] = useState('');
  const [codeExpiresAt, setCodeExpiresAt] = useState('');
  const [bootstrapRequired, setBootstrapRequired] = useState(false);
  const [checkingBootstrap, setCheckingBootstrap] = useState(authMode === 'api');
  const [inviteState, setInviteState] = useState<{
    email: string;
    name: string;
    role: string;
    scope: string;
    expiresAt: string;
    status: 'pending' | 'accepted';
  } | null>(null);
  const [bootstrapForm, setBootstrapForm] = useState({
    organizationName: '',
    organizationSlug: '',
    name: '',
    email: '',
  });

  useEffect(() => {
    if (authMode !== 'api') {
      setCheckingBootstrap(false);
      return;
    }

    fetchBootstrapStatus()
      .then((result) => setBootstrapRequired(result.required))
      .finally(() => setCheckingBootstrap(false));
  }, [authMode]);

  useEffect(() => {
    if (!inviteToken || authMode !== 'api') return;
    fetchInvite(inviteToken)
      .then((invite) => {
        setInviteState(invite);
        setEmail(invite.email);
      })
      .catch((inviteError) => {
        setError(inviteError instanceof Error ? inviteError.message : 'Unable to load invite.');
      });
  }, [inviteToken, authMode]);

  const resendHint = useMemo(() => {
    if (!nextAllowedAt) return '';
    return `You can request another code after ${formatTime(nextAllowedAt)}.`;
  }, [nextAllowedAt]);

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const result = await requestCode(email.trim());
      setPreviewCode(result.previewCode ?? '');
      setNextAllowedAt(result.nextAllowedAt ?? '');
      setCodeExpiresAt(result.expiresAt);
      setStep('verify');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to send sign-in code.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await verifyCode(email.trim(), code.trim());
      await refreshFromServer();
      navigate('/app', { replace: true });
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : 'Unable to verify sign-in code.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAcceptInvite() {
    if (!inviteToken) return;
    setSubmitting(true);
    setError('');
    try {
      const accepted = await acceptInvite(inviteToken);
      setEmail(accepted.email);
      setInviteState(null);
      searchParams.delete('invite');
      setSearchParams(searchParams, { replace: true });
      setStep('request');
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : 'Unable to accept invite.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBootstrap(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const result = await bootstrapAccount({
        organizationName: bootstrapForm.organizationName.trim(),
        organizationSlug: bootstrapForm.organizationSlug.trim(),
        name: bootstrapForm.name.trim(),
        email: bootstrapForm.email.trim(),
      });
      setBootstrapRequired(false);
      setEmail(result.user.email);
      setStep('request');
    } catch (bootstrapError) {
      setError(bootstrapError instanceof Error ? bootstrapError.message : 'Unable to bootstrap EventHub.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleBrowserLogin(memberId: string) {
    const member = state.teamMembers.find((entry) => entry.id === memberId);
    if (!member) return;
    login(member);
    navigate('/app', { replace: true });
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="app-brand-mark" />
          <h1>EventHub</h1>
          <p>Operations Platform</p>
        </div>
        <div className="login-body">
          {authMode === 'api' ? (
            <>
              {checkingBootstrap ? (
                <p className="login-prompt">Checking EventHub bootstrap status…</p>
              ) : bootstrapRequired ? (
                <>
                  <p className="login-prompt">Create the first organization and super admin to activate EventHub.</p>
                  <form className="app-form" onSubmit={handleBootstrap}>
                    <div className="form-row">
                      <div className="form-field">
                        <label>Organization name</label>
                        <input
                          required
                          value={bootstrapForm.organizationName}
                          onChange={(event) => setBootstrapForm((current) => ({ ...current, organizationName: event.target.value }))}
                          placeholder="Kapoe Events"
                        />
                      </div>
                      <div className="form-field">
                        <label>Organization slug</label>
                        <input
                          required
                          value={bootstrapForm.organizationSlug}
                          onChange={(event) => setBootstrapForm((current) => ({ ...current, organizationSlug: event.target.value.toLowerCase().replace(/\s+/g, '-') }))}
                          placeholder="kapoe-events"
                        />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-field">
                        <label>Admin name</label>
                        <input
                          required
                          value={bootstrapForm.name}
                          onChange={(event) => setBootstrapForm((current) => ({ ...current, name: event.target.value }))}
                          placeholder="Tom Omaet"
                        />
                      </div>
                      <div className="form-field">
                        <label>Admin email</label>
                        <input
                          required
                          type="email"
                          value={bootstrapForm.email}
                          onChange={(event) => setBootstrapForm((current) => ({ ...current, email: event.target.value }))}
                          placeholder="tom@example.com"
                        />
                      </div>
                    </div>
                    {error && <p className="form-error">{error}</p>}
                    <div className="form-actions">
                      <button className="app-button app-button-primary" type="submit" disabled={submitting}>
                        {submitting ? 'Creating…' : 'Create organization'}
                      </button>
                    </div>
                  </form>
                </>
              ) : inviteState ? (
                <>
                  <p className="login-prompt">
                    You’ve been invited as <strong>{inviteState.role.replace(/_/g, ' ')}</strong>. Accept the invite to activate
                    your account, then request your sign-in code.
                  </p>
                  <div className="app-panel" style={{ marginBottom: 16 }}>
                    <strong>{inviteState.name}</strong>
                    <p>{inviteState.email}</p>
                    <p className="app-muted-sm">Scope: {inviteState.scope}</p>
                    <p className="app-muted-sm">Invite expires at {new Date(inviteState.expiresAt).toLocaleString()}</p>
                  </div>
                  {error && <p className="form-error">{error}</p>}
                  <div className="form-actions">
                    <button className="app-button app-button-primary" type="button" onClick={handleAcceptInvite} disabled={submitting}>
                      {submitting ? 'Accepting…' : 'Accept invite'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="login-prompt">
                    {step === 'request'
                      ? 'Enter your EventHub email to receive a secure sign-in code.'
                      : 'Enter the 6-digit code sent to your email to continue.'}
                  </p>
                  {step === 'request' ? (
                    <form className="app-form" onSubmit={handleRequestCode}>
                      <div className="form-field">
                        <label>Email</label>
                        <input
                          type="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          placeholder="you@example.com"
                          required
                        />
                      </div>
                      {resendHint && <p className="app-muted-sm">{resendHint}</p>}
                      {error && <p className="form-error">{error}</p>}
                      <div className="form-actions">
                        <button className="app-button app-button-primary" type="submit" disabled={submitting}>
                          {submitting ? 'Sending…' : 'Send sign-in code'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <form className="app-form" onSubmit={handleVerifyCode}>
                      <div className="form-field">
                        <label>Email</label>
                        <input
                          type="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          required
                        />
                      </div>
                      <div className="form-field">
                        <label>Sign-in code</label>
                        <input
                          value={code}
                          onChange={(event) => setCode(event.target.value)}
                          placeholder="123456"
                          required
                        />
                      </div>
                      {codeExpiresAt && <p className="app-muted-sm">This code expires at {new Date(codeExpiresAt).toLocaleTimeString()}.</p>}
                      {previewCode && (
                        <p className="app-muted-sm">
                          Dev preview code: <strong>{previewCode}</strong>
                        </p>
                      )}
                      {error && <p className="form-error">{error}</p>}
                      <div className="form-actions">
                        <button className="app-button" type="button" onClick={() => setStep('request')} disabled={submitting}>
                          Back
                        </button>
                        <button className="app-button app-button-primary" type="submit" disabled={submitting}>
                          {submitting ? 'Verifying…' : 'Verify and continue'}
                        </button>
                      </div>
                    </form>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <p className="login-prompt">Select your account to continue</p>
              <div className="login-user-list">
                {state.teamMembers.map((member) => (
                  <button
                    key={member.id}
                    className="login-user-row"
                    onClick={() => handleBrowserLogin(member.id)}
                  >
                    <span className="app-user-avatar">{member.name.slice(0, 2).toUpperCase()}</span>
                    <div className="login-user-info">
                      <strong>{member.name}</strong>
                      <span>{member.role.replace(/_/g, ' ')} · {member.scope}</span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
