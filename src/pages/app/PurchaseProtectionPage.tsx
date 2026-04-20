import { useState, useMemo } from 'react';
import type { PurchaseLimitRule, PriorityGroup } from '../../lib/domain';
import { usePlatform } from '../../lib/platform';
import RoleGate from '../../components/ui/RoleGate';

type Tab = 'limits' | 'priority';

const ACCESS_LEVEL_LABELS = {
  presale_early: 'Early access (no code)',
  presale_code:  'Code required',
  standard:      'Standard',
};

const EMPTY_LIMIT = { maxPerOrder: 4, maxPerBuyer: 8, tierId: '', notes: '' };
const EMPTY_GROUP = {
  name: '',
  accessLevel: 'presale_early' as PriorityGroup['accessLevel'],
  allowedTierIds: [] as string[],
  memberCount: 0,
  notes: '',
};

export default function PurchaseProtectionPage() {
  const { state, dispatch, newId, nowStr } = usePlatform();
  const [tab, setTab] = useState<Tab>('limits');
  const [selectedEventId, setSelectedEventId] = useState(state.events[0]?.id ?? '');
  const [editingLimitId, setEditingLimitId] = useState<string | 'new' | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | 'new' | null>(null);
  const [limitForm, setLimitForm] = useState(EMPTY_LIMIT);
  const [groupForm, setGroupForm] = useState(EMPTY_GROUP);

  const tiers = state.ticketTiers.filter((t) => t.eventId === selectedEventId);
  const limits = useMemo(
    () => state.purchaseLimits.filter((r) => r.eventId === selectedEventId),
    [state.purchaseLimits, selectedEventId]
  );
  const groups = useMemo(
    () => state.priorityGroups.filter((g) => g.eventId === selectedEventId),
    [state.priorityGroups, selectedEventId]
  );

  // ── Limit CRUD ──────────────────────────────────────────────────────────────
  function openNewLimit() {
    setLimitForm(EMPTY_LIMIT);
    setEditingLimitId('new');
  }

  function openEditLimit(rule: PurchaseLimitRule) {
    setLimitForm({ maxPerOrder: rule.maxPerOrder, maxPerBuyer: rule.maxPerBuyer, tierId: rule.tierId ?? '', notes: rule.notes ?? '' });
    setEditingLimitId(rule.id);
  }

  function saveLimit() {
    const payload: PurchaseLimitRule = {
      id: editingLimitId === 'new' ? newId('limit') : editingLimitId!,
      eventId: selectedEventId,
      tierId: limitForm.tierId || undefined,
      maxPerOrder: limitForm.maxPerOrder,
      maxPerBuyer: limitForm.maxPerBuyer,
      notes: limitForm.notes || undefined,
    };
    dispatch({ type: 'UPSERT_PURCHASE_LIMIT', payload });
    setEditingLimitId(null);
    setLimitForm(EMPTY_LIMIT);
  }

  function deleteLimit(id: string) {
    dispatch({ type: 'DELETE_PURCHASE_LIMIT', id });
  }

  // ── Priority group CRUD ─────────────────────────────────────────────────────
  function openNewGroup() {
    setGroupForm(EMPTY_GROUP);
    setEditingGroupId('new');
  }

  function openEditGroup(group: PriorityGroup) {
    setGroupForm({
      name: group.name,
      accessLevel: group.accessLevel,
      allowedTierIds: [...group.allowedTierIds],
      memberCount: group.memberCount,
      notes: group.notes ?? '',
    });
    setEditingGroupId(group.id);
  }

  function saveGroup() {
    const payload: PriorityGroup = {
      id: editingGroupId === 'new' ? newId('pgroup') : editingGroupId!,
      eventId: selectedEventId,
      name: groupForm.name,
      accessLevel: groupForm.accessLevel,
      allowedTierIds: groupForm.allowedTierIds,
      memberCount: groupForm.memberCount,
      notes: groupForm.notes || undefined,
      createdAt: editingGroupId === 'new' ? nowStr() : (state.priorityGroups.find((g) => g.id === editingGroupId)?.createdAt ?? nowStr()),
    };
    dispatch({ type: 'UPSERT_PRIORITY_GROUP', payload });
    setEditingGroupId(null);
    setGroupForm(EMPTY_GROUP);
  }

  function deleteGroup(id: string) {
    dispatch({ type: 'DELETE_PRIORITY_GROUP', id });
  }

  function toggleGroupTier(tierId: string) {
    setGroupForm((f) => ({
      ...f,
      allowedTierIds: f.allowedTierIds.includes(tierId)
        ? f.allowedTierIds.filter((t) => t !== tierId)
        : [...f.allowedTierIds, tierId],
    }));
  }

  return (
    <div className="app-page">
      <section className="app-page-header">
        <div>
          <p className="app-kicker">High-demand sales</p>
          <h2>Purchase Protections</h2>
          <p>Set per-buyer limits, define priority access groups, and control presale windows.</p>
        </div>
        <select className="app-select" value={selectedEventId} onChange={(e) => { setSelectedEventId(e.target.value); setEditingLimitId(null); setEditingGroupId(null); }}>
          <option value="">Select event…</option>
          {state.events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
        </select>
      </section>

      {/* Tabs */}
      <div className="app-tab-bar">
        <button className={`app-tab${tab === 'limits' ? ' app-tab-active' : ''}`} onClick={() => setTab('limits')}>
          Purchase limits
          {limits.length > 0 && <span className="app-tab-badge">{limits.length}</span>}
        </button>
        <button className={`app-tab${tab === 'priority' ? ' app-tab-active' : ''}`} onClick={() => setTab('priority')}>
          Priority groups
          {groups.length > 0 && <span className="app-tab-badge">{groups.length}</span>}
        </button>
      </div>

      {!selectedEventId ? (
        <div className="app-empty-state">Select an event to manage purchase protections.</div>
      ) : tab === 'limits' ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <RoleGate permission="check_in:write">
              <button
                className="app-button app-button-primary"
                onClick={openNewLimit}
                disabled={editingLimitId !== null}
              >
                + Add limit
              </button>
            </RoleGate>
          </div>

          {editingLimitId !== null && (
            <article className="app-panel" style={{ marginBottom: 20 }}>
              <div className="app-panel-header">
                <h3>{editingLimitId === 'new' ? 'New limit rule' : 'Edit limit'}</h3>
              </div>
              <div className="app-form" style={{ marginTop: 16 }}>
                <div className="form-row">
                  <div className="form-field">
                    <label>Scope <span className="form-hint">optional — blank = all tiers</span></label>
                    <select value={limitForm.tierId} onChange={(e) => setLimitForm((f) => ({ ...f, tierId: e.target.value }))}>
                      <option value="">All tiers in event</option>
                      {tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Max per order</label>
                    <input type="number" min={1} value={limitForm.maxPerOrder} onChange={(e) => setLimitForm((f) => ({ ...f, maxPerOrder: Number(e.target.value) }))} />
                  </div>
                  <div className="form-field">
                    <label>Max per buyer <span className="form-hint">lifetime</span></label>
                    <input type="number" min={1} value={limitForm.maxPerBuyer} onChange={(e) => setLimitForm((f) => ({ ...f, maxPerBuyer: Number(e.target.value) }))} />
                  </div>
                </div>
                <div className="form-field">
                  <label>Notes</label>
                  <input value={limitForm.notes} onChange={(e) => setLimitForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional description" />
                </div>
                <div className="form-actions">
                  <button className="app-button app-button-primary" onClick={saveLimit} disabled={limitForm.maxPerOrder < 1 || limitForm.maxPerBuyer < 1}>Save limit</button>
                  <button className="app-button" onClick={() => setEditingLimitId(null)}>Cancel</button>
                </div>
              </div>
            </article>
          )}

          {limits.length === 0 && editingLimitId === null ? (
            <div className="app-empty-state">
              <p>No purchase limits. Without limits, buyers can purchase any quantity.</p>
              <button className="app-button" onClick={openNewLimit}>Add first limit</button>
            </div>
          ) : limits.length > 0 && (
            <article className="app-panel">
              <div className="app-list">
                {limits.map((rule) => {
                  const tier = tiers.find((t) => t.id === rule.tierId);
                  return (
                    <div key={rule.id} className="app-list-row">
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <strong>{tier?.name ?? 'All tiers'}</strong>
                          <span className="app-chip">{rule.maxPerOrder}/order</span>
                          <span className="app-chip">{rule.maxPerBuyer}/buyer</span>
                        </div>
                        {rule.notes && <p style={{ fontSize: '0.82rem', color: 'rgba(220,232,239,0.55)', marginTop: 4 }}>{rule.notes}</p>}
                      </div>
                      <RoleGate permission="check_in:write">
                        <div className="app-row-actions">
                          <button className="app-action-btn" onClick={() => openEditLimit(rule)} disabled={editingLimitId !== null}>Edit</button>
                          <button className="app-action-btn app-action-danger" onClick={() => deleteLimit(rule.id)}>Delete</button>
                        </div>
                      </RoleGate>
                    </div>
                  );
                })}
              </div>
            </article>
          )}
        </>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <RoleGate permission="check_in:write">
              <button
                className="app-button app-button-primary"
                onClick={openNewGroup}
                disabled={editingGroupId !== null}
              >
                + Add group
              </button>
            </RoleGate>
          </div>

          {editingGroupId !== null && (
            <article className="app-panel" style={{ marginBottom: 20 }}>
              <div className="app-panel-header">
                <h3>{editingGroupId === 'new' ? 'New priority group' : 'Edit group'}</h3>
              </div>
              <div className="app-form" style={{ marginTop: 16 }}>
                <div className="form-row">
                  <div className="form-field">
                    <label>Group name</label>
                    <input value={groupForm.name} onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))} placeholder="Fan Club Members" />
                  </div>
                  <div className="form-field">
                    <label>Access level</label>
                    <select value={groupForm.accessLevel} onChange={(e) => setGroupForm((f) => ({ ...f, accessLevel: e.target.value as PriorityGroup['accessLevel'] }))}>
                      <option value="presale_early">Early access (no code)</option>
                      <option value="presale_code">Requires presale code</option>
                      <option value="standard">Standard access</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Member count</label>
                    <input type="number" min={0} value={groupForm.memberCount} onChange={(e) => setGroupForm((f) => ({ ...f, memberCount: Number(e.target.value) }))} />
                  </div>
                </div>
                <div className="form-field">
                  <label>Allowed tiers <span className="form-hint">empty = all tiers</span></label>
                  <div className="access-rule-tier-grid">
                    {tiers.map((tier) => (
                      <label key={tier.id} className="access-rule-tier-check">
                        <input type="checkbox" checked={groupForm.allowedTierIds.includes(tier.id)} onChange={() => toggleGroupTier(tier.id)} />
                        <span>{tier.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="form-field">
                  <label>Notes</label>
                  <input value={groupForm.notes} onChange={(e) => setGroupForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional instructions or context" />
                </div>
                <div className="form-actions">
                  <button className="app-button app-button-primary" onClick={saveGroup} disabled={!groupForm.name.trim()}>Save group</button>
                  <button className="app-button" onClick={() => setEditingGroupId(null)}>Cancel</button>
                </div>
              </div>
            </article>
          )}

          {groups.length === 0 && editingGroupId === null ? (
            <div className="app-empty-state">
              <p>No priority groups configured.</p>
              <button className="app-button" onClick={openNewGroup}>Add first group</button>
            </div>
          ) : groups.length > 0 && (
            <article className="app-panel">
              <div className="app-list">
                {groups.map((group) => {
                  const tierNames = group.allowedTierIds.length === 0
                    ? 'All tiers'
                    : group.allowedTierIds.map((tid) => tiers.find((t) => t.id === tid)?.name ?? tid).join(', ');
                  return (
                    <div key={group.id} className="app-list-row">
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                          <strong>{group.name}</strong>
                          <span className="app-chip">{ACCESS_LEVEL_LABELS[group.accessLevel]}</span>
                          <span className="app-muted-sm">{group.memberCount.toLocaleString()} members</span>
                        </div>
                        <p style={{ fontSize: '0.82rem', color: 'rgba(220,232,239,0.55)' }}>
                          {tierNames}
                          {group.notes && ` — ${group.notes}`}
                        </p>
                      </div>
                      <RoleGate permission="check_in:write">
                        <div className="app-row-actions">
                          <button className="app-action-btn" onClick={() => openEditGroup(group)} disabled={editingGroupId !== null}>Edit</button>
                          <button className="app-action-btn app-action-danger" onClick={() => deleteGroup(group.id)}>Delete</button>
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
