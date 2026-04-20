import { useState, useMemo } from 'react';
import type { PresaleCode, PresaleCodeStatus } from '../../lib/domain';
import { usePlatform } from '../../lib/platform';
import RoleGate from '../../components/ui/RoleGate';

const STATUS_LABELS: Record<PresaleCodeStatus, string> = {
  active: 'Active',
  exhausted: 'Exhausted',
  expired: 'Expired',
  disabled: 'Disabled',
};

const STATUS_BADGE: Record<PresaleCodeStatus, string> = {
  active: 'badge-green',
  exhausted: 'badge-amber',
  expired: 'badge-red',
  disabled: 'badge-red',
};

const EMPTY_FORM = {
  label: '',
  code: '',
  maxUses: 0,
  allowedTierIds: [] as string[],
  validFrom: '',
  validUntil: '',
};

export default function PresaleCodesPage() {
  const { state, dispatch, newId, nowStr } = usePlatform();
  const [selectedEventId, setSelectedEventId] = useState(state.events[0]?.id ?? '');
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [copied, setCopied] = useState<string | null>(null);

  const tiers = state.ticketTiers.filter((t) => t.eventId === selectedEventId);
  const codes = useMemo(
    () => state.presaleCodes.filter((c) => c.eventId === selectedEventId),
    [state.presaleCodes, selectedEventId]
  );

  function openNew() {
    setForm(EMPTY_FORM);
    setEditingId('new');
  }

  function openEdit(code: PresaleCode) {
    setForm({
      label: code.label,
      code: code.code,
      maxUses: code.maxUses,
      allowedTierIds: [...code.allowedTierIds],
      validFrom: code.validFrom ?? '',
      validUntil: code.validUntil ?? '',
    });
    setEditingId(code.id);
  }

  function cancel() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function save() {
    const payload: PresaleCode = {
      id: editingId === 'new' ? newId('code') : editingId!,
      eventId: selectedEventId,
      label: form.label,
      code: form.code.toUpperCase().trim(),
      maxUses: form.maxUses,
      usedCount: editingId === 'new' ? 0 : (state.presaleCodes.find((c) => c.id === editingId)?.usedCount ?? 0),
      allowedTierIds: form.allowedTierIds,
      status: 'active',
      validFrom: form.validFrom || undefined,
      validUntil: form.validUntil || undefined,
      createdAt: editingId === 'new' ? nowStr() : (state.presaleCodes.find((c) => c.id === editingId)?.createdAt ?? nowStr()),
    };
    dispatch({ type: 'UPSERT_PRESALE_CODE', payload });
    cancel();
  }

  function deleteCode(id: string) {
    dispatch({ type: 'DELETE_PRESALE_CODE', id });
  }

  function toggleTier(tierId: string) {
    setForm((f) => ({
      ...f,
      allowedTierIds: f.allowedTierIds.includes(tierId)
        ? f.allowedTierIds.filter((t) => t !== tierId)
        : [...f.allowedTierIds, tierId],
    }));
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  }

  const canSave = form.label.trim().length > 0 && form.code.trim().length >= 3;

  return (
    <div className="app-page">
      <section className="app-page-header">
        <div>
          <p className="app-kicker">High-demand sales</p>
          <h2>Presale Codes</h2>
          <p>Issue access codes to fan clubs, press, and priority groups. Codes can be limited by tier, usage count, and validity window.</p>
        </div>
        <RoleGate permission="check_in:write">
          <button
            className="app-button app-button-primary"
            onClick={openNew}
            disabled={!selectedEventId || editingId !== null}
          >
            + New code
          </button>
        </RoleGate>
      </section>

      <div className="app-filter-bar" style={{ marginBottom: 24 }}>
        <select className="app-select" value={selectedEventId} onChange={(e) => { setSelectedEventId(e.target.value); cancel(); }}>
          <option value="">Select event…</option>
          {state.events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
        </select>
        {selectedEventId && (
          <span className="app-muted-sm">{codes.length} code{codes.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {!selectedEventId ? (
        <div className="app-empty-state">Select an event to manage its presale codes.</div>
      ) : (
        <>
          {editingId !== null && (
            <article className="app-panel" style={{ marginBottom: 24 }}>
              <div className="app-panel-header">
                <h3>{editingId === 'new' ? 'New presale code' : 'Edit code'}</h3>
              </div>
              <div className="app-form" style={{ marginTop: 16 }}>
                <div className="form-row">
                  <div className="form-field">
                    <label>Label <span className="form-hint">internal name</span></label>
                    <input
                      value={form.label}
                      onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                      placeholder="Fan Club Wave 1"
                    />
                  </div>
                  <div className="form-field">
                    <label>Code <span className="form-hint">what buyers type</span></label>
                    <input
                      value={form.code}
                      onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                      placeholder="FANCLUB26"
                      className="app-mono"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <label>Max uses <span className="form-hint">0 = unlimited</span></label>
                    <input
                      type="number"
                      min={0}
                      value={form.maxUses}
                      onChange={(e) => setForm((f) => ({ ...f, maxUses: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="form-field">
                    <label>Valid from <span className="form-hint">optional</span></label>
                    <input
                      type="datetime-local"
                      value={form.validFrom}
                      onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
                    />
                  </div>
                  <div className="form-field">
                    <label>Valid until <span className="form-hint">optional</span></label>
                    <input
                      type="datetime-local"
                      value={form.validUntil}
                      onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="form-field">
                  <label>Allowed tiers <span className="form-hint">leave all unchecked = all tiers</span></label>
                  <div className="access-rule-tier-grid">
                    {tiers.length === 0 ? (
                      <span className="app-muted-sm">No tiers defined for this event.</span>
                    ) : tiers.map((tier) => (
                      <label key={tier.id} className="access-rule-tier-check">
                        <input
                          type="checkbox"
                          checked={form.allowedTierIds.includes(tier.id)}
                          onChange={() => toggleTier(tier.id)}
                        />
                        <span>{tier.name}</span>
                        <span className="access-rule-tier-kind">{tier.kind.replace(/_/g, ' ')}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="form-actions">
                  <button className="app-button app-button-primary" onClick={save} disabled={!canSave}>
                    Save code
                  </button>
                  <button className="app-button" onClick={cancel}>Cancel</button>
                </div>
              </div>
            </article>
          )}

          {codes.length === 0 && editingId === null ? (
            <div className="app-empty-state">
              <p>No presale codes yet for this event.</p>
              <button className="app-button" onClick={openNew}>Create first code</button>
            </div>
          ) : (
            <article className="app-panel">
              <div className="app-panel-header">
                <h3>Codes</h3>
              </div>
              <div className="app-list">
                {codes.map((code) => {
                  const usePct = code.maxUses > 0 ? code.usedCount / code.maxUses : null;
                  const tierNames = code.allowedTierIds.length === 0
                    ? 'All tiers'
                    : code.allowedTierIds.map((tid) => tiers.find((t) => t.id === tid)?.name ?? tid).join(', ');
                  return (
                    <div key={code.id} className="app-list-row">
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                          <strong>{code.label}</strong>
                          <span className={`badge ${STATUS_BADGE[code.status]}`}>{STATUS_LABELS[code.status]}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <code className="app-mono presale-code-pill">{code.code}</code>
                          <button
                            className="app-action-btn"
                            onClick={() => copyCode(code.code)}
                            style={{ fontSize: '0.74rem', padding: '3px 8px' }}
                          >
                            {copied === code.code ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                        <p style={{ marginTop: 4, fontSize: '0.82rem', color: 'rgba(220,232,239,0.55)' }}>
                          {tierNames} ·
                          {' '}
                          {code.maxUses === 0 ? 'Unlimited uses' : `${code.usedCount} / ${code.maxUses} used`}
                          {code.validUntil && ` · Expires ${code.validUntil}`}
                        </p>
                        {usePct !== null && (
                          <div className="tier-progress" style={{ marginTop: 6, maxWidth: 200 }}>
                            <div className="tier-progress-bar" style={{ width: `${Math.min(100, Math.round(usePct * 100))}%` }} />
                          </div>
                        )}
                      </div>
                      <RoleGate permission="check_in:write">
                        <div className="app-row-actions">
                          <button
                            className="app-action-btn"
                            onClick={() => openEdit(code)}
                            disabled={editingId !== null}
                          >
                            Edit
                          </button>
                          <button
                            className="app-action-btn app-action-danger"
                            onClick={() => deleteCode(code.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </RoleGate>
                    </div>
                  );
                })}
              </div>
            </article>
          )}
        </>
      )}
    </div>
  );
}
