import { useState, useMemo } from 'react';
import type { AccessRule, TicketKind } from '../../lib/domain';
import { usePlatform } from '../../lib/platform';
import RoleGate from '../../components/ui/RoleGate';

const ALL_KINDS: TicketKind[] = ['general_admission', 'reserved_seating', 'vip', 'timed_entry'];
const KIND_LABELS: Record<TicketKind, string> = {
  general_admission: 'General Admission',
  reserved_seating:  'Reserved Seating',
  vip:               'VIP',
  timed_entry:       'Timed Entry',
};

const EMPTY_FORM = {
  gate: '',
  label: '',
  allowedTierIds: [] as string[],
  allowedKinds: [] as TicketKind[],
  requiresAccreditation: false,
  notes: '',
};

export default function AccessRulesPage() {
  const { state, dispatch, newId } = usePlatform();
  const [selectedEventId, setSelectedEventId] = useState(state.events[0]?.id ?? '');
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const event = state.events.find((e) => e.id === selectedEventId);
  const tiers = state.ticketTiers.filter((t) => t.eventId === selectedEventId);
  const rules = useMemo(
    () => state.accessRules.filter((r) => r.eventId === selectedEventId),
    [state.accessRules, selectedEventId]
  );

  // Unique gates from checkpoints + access rules
  const knownGates = useMemo(() => {
    const gates = new Set<string>();
    state.checkpoints.forEach((cp) => gates.add(cp.gate));
    state.accessRules.forEach((r) => r.eventId === selectedEventId && gates.add(r.gate));
    state.devices.filter((d) => d.eventId === selectedEventId).forEach((d) => gates.add(d.gate));
    return [...gates];
  }, [state.checkpoints, state.accessRules, state.devices, selectedEventId]);

  function openNew() {
    setForm(EMPTY_FORM);
    setEditingId('new');
  }

  function openEdit(rule: AccessRule) {
    setForm({
      gate: rule.gate,
      label: rule.label,
      allowedTierIds: [...rule.allowedTierIds],
      allowedKinds: [...rule.allowedKinds],
      requiresAccreditation: rule.requiresAccreditation,
      notes: rule.notes ?? '',
    });
    setEditingId(rule.id);
  }

  function cancel() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function save() {
    const payload: AccessRule = {
      id: editingId === 'new' ? newId('rule') : editingId!,
      eventId: selectedEventId,
      gate: form.gate,
      label: form.label,
      allowedTierIds: form.allowedTierIds,
      allowedKinds: form.allowedKinds,
      requiresAccreditation: form.requiresAccreditation,
      notes: form.notes || undefined,
    };
    dispatch({ type: 'UPSERT_ACCESS_RULE', payload });
    cancel();
  }

  function deleteRule(id: string) {
    dispatch({ type: 'DELETE_ACCESS_RULE', id });
  }

  function toggleTier(tierId: string) {
    setForm((f) => ({
      ...f,
      allowedTierIds: f.allowedTierIds.includes(tierId)
        ? f.allowedTierIds.filter((t) => t !== tierId)
        : [...f.allowedTierIds, tierId],
    }));
  }

  function toggleKind(kind: TicketKind) {
    setForm((f) => ({
      ...f,
      allowedKinds: f.allowedKinds.includes(kind)
        ? f.allowedKinds.filter((k) => k !== kind)
        : [...f.allowedKinds, kind],
    }));
  }

  return (
    <div className="app-page">
      <section className="app-page-header">
        <div>
          <p className="app-kicker">Gate management</p>
          <h2>Access Rules</h2>
          <p>Define which ticket tiers and kinds are permitted at each gate. Rules override the default "allow all" behaviour.</p>
        </div>
        <RoleGate permission="check_in:write">
          <button className="app-button app-button-primary" onClick={openNew} disabled={!selectedEventId || editingId !== null}>
            + Add rule
          </button>
        </RoleGate>
      </section>

      <div className="app-filter-bar" style={{ marginBottom: 24 }}>
        <select className="app-select" value={selectedEventId} onChange={(e) => { setSelectedEventId(e.target.value); cancel(); }}>
          <option value="">Select event…</option>
          {state.events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
        </select>
        {event && <span className="app-muted-sm">{rules.length} rule{rules.length !== 1 ? 's' : ''} configured</span>}
      </div>

      {!selectedEventId ? (
        <div className="app-empty-state">Select an event to manage its access rules.</div>
      ) : (
        <>
          {/* Add / edit form */}
          {editingId !== null && (
            <article className="app-panel" style={{ marginBottom: 24 }}>
              <div className="app-panel-header">
                <h3>{editingId === 'new' ? 'New access rule' : 'Edit rule'}</h3>
              </div>
              <div className="app-form" style={{ marginTop: 16 }}>
                <div className="form-row">
                  <div className="form-field">
                    <label>Gate</label>
                    <select value={form.gate} onChange={(e) => setForm((f) => ({ ...f, gate: e.target.value }))}>
                      <option value="">Select gate…</option>
                      {knownGates.map((g) => <option key={g} value={g}>{g}</option>)}
                      <option value="__custom__">Custom…</option>
                    </select>
                    {form.gate === '__custom__' && (
                      <input
                        style={{ marginTop: 8 }}
                        placeholder="Gate name"
                        value={form.gate === '__custom__' ? '' : form.gate}
                        onChange={(e) => setForm((f) => ({ ...f, gate: e.target.value }))}
                      />
                    )}
                  </div>
                  <div className="form-field">
                    <label>Rule label</label>
                    <input
                      value={form.label}
                      onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                      placeholder="e.g. VIP only, GA + Reserved"
                    />
                  </div>
                </div>

                <div className="form-field">
                  <label>Allowed ticket tiers <span className="form-hint">(leave all unchecked = allow any tier)</span></label>
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

                <div className="form-field">
                  <label>Allowed ticket kinds <span className="form-hint">(leave all unchecked = allow any kind)</span></label>
                  <div className="access-rule-tier-grid">
                    {ALL_KINDS.map((kind) => (
                      <label key={kind} className="access-rule-tier-check">
                        <input
                          type="checkbox"
                          checked={form.allowedKinds.includes(kind)}
                          onChange={() => toggleKind(kind)}
                        />
                        <span>{KIND_LABELS[kind]}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <label className="access-rule-tier-check" style={{ gap: 12 }}>
                      <input
                        type="checkbox"
                        checked={form.requiresAccreditation}
                        onChange={(e) => setForm((f) => ({ ...f, requiresAccreditation: e.target.checked }))}
                      />
                      <span>Requires staff accreditation</span>
                    </label>
                  </div>
                  <div className="form-field">
                    <label>Notes</label>
                    <input
                      value={form.notes}
                      onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                      placeholder="Optional staff instructions"
                    />
                  </div>
                </div>

                <div className="form-actions">
                  <button className="app-button app-button-primary" onClick={save} disabled={!form.gate || !form.label}>
                    Save rule
                  </button>
                  <button className="app-button" onClick={cancel}>Cancel</button>
                </div>
              </div>
            </article>
          )}

          {/* Rule list */}
          {rules.length === 0 && editingId === null ? (
            <div className="app-empty-state">
              <p>No access rules yet. Without rules, all ticket types are admitted at all gates.</p>
              <button className="app-button" onClick={openNew}>Add first rule</button>
            </div>
          ) : (
            <article className="app-panel">
              <div className="app-panel-header">
                <h3>Rules for {event?.name}</h3>
              </div>
              <div className="app-list">
                {rules.map((rule) => {
                  const allowedTierNames = rule.allowedTierIds.length === 0
                    ? 'All tiers'
                    : rule.allowedTierIds.map((tid) => tiers.find((t) => t.id === tid)?.name ?? tid).join(', ');
                  const allowedKindNames = rule.allowedKinds.length === 0
                    ? 'All kinds'
                    : rule.allowedKinds.map((k) => KIND_LABELS[k]).join(', ');
                  return (
                    <div key={rule.id} className="app-list-row">
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <strong>{rule.gate}</strong>
                          <span className="app-chip">{rule.label}</span>
                          {rule.requiresAccreditation && <span className="badge badge-amber">accred. required</span>}
                        </div>
                        <p style={{ marginTop: 4, fontSize: '0.84rem', color: 'rgba(220,232,239,0.6)' }}>
                          {allowedTierNames} · {allowedKindNames}
                          {rule.notes && ` — ${rule.notes}`}
                        </p>
                      </div>
                      <RoleGate permission="check_in:write">
                        <div className="app-row-actions">
                          <button className="app-action-btn" onClick={() => openEdit(rule)} disabled={editingId !== null}>Edit</button>
                          <button className="app-action-btn app-action-danger" onClick={() => deleteRule(rule.id)}>Delete</button>
                        </div>
                      </RoleGate>
                    </div>
                  );
                })}
              </div>
            </article>
          )}

          {/* Default behaviour note */}
          <div className="app-alert" style={{ marginTop: 20 }}>
            <span>ℹ</span>
            <span>
              Gates with no rules admit all valid tickets. Rules define restrictions — at least one rule must match for entry to be granted.
              {' '}<strong>Accreditation</strong> gates require a physical wristband check by staff in addition to the QR scan.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
