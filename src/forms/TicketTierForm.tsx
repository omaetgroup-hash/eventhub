import { useState } from 'react';
import type { TicketKind, TicketTier } from '../lib/domain';
import { usePlatform } from '../lib/platform';

interface TicketTierFormProps {
  initial?: Partial<TicketTier>;
  defaultEventId?: string;
  onDone: () => void;
}

const KIND_OPTIONS: TicketKind[] = ['general_admission', 'reserved_seating', 'vip', 'timed_entry'];

export default function TicketTierForm({ initial, defaultEventId, onDone }: TicketTierFormProps) {
  const { dispatch, newId, state } = usePlatform();
  const isEdit = !!initial?.id;

  const [form, setForm] = useState({
    eventId: initial?.eventId ?? defaultEventId ?? '',
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    kind: (initial?.kind ?? 'general_admission') as TicketKind,
    price: initial?.price?.toString() ?? '',
    inventory: initial?.inventory?.toString() ?? '',
    saleStartsAt: initial?.saleStartsAt ?? '',
    saleEndsAt: initial?.saleEndsAt ?? '',
  });

  const set = (key: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [key]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const tier: TicketTier = {
      id: initial?.id ?? newId('tier'),
      eventId: form.eventId,
      name: form.name.trim(),
      description: form.description.trim(),
      kind: form.kind,
      price: parseFloat(form.price) || 0,
      inventory: parseInt(form.inventory, 10) || 0,
      sold: initial?.sold ?? 0,
      saleStartsAt: form.saleStartsAt || undefined,
      saleEndsAt: form.saleEndsAt || undefined,
    };
    dispatch({ type: 'UPSERT_TIER', payload: tier });
    onDone();
  }

  return (
    <form className="app-form" onSubmit={submit}>
      <div className="form-field">
        <label>Event</label>
        <select required value={form.eventId} onChange={set('eventId')}>
          <option value="">Select event…</option>
          {state.events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
        </select>
      </div>
      <div className="form-field">
        <label>Tier name</label>
        <input required value={form.name} onChange={set('name')} placeholder="General Admission" />
      </div>
      <div className="form-field">
        <label>Description</label>
        <textarea rows={2} value={form.description} onChange={set('description')} placeholder="What's included?" />
      </div>
      <div className="form-row">
        <div className="form-field">
          <label>Type</label>
          <select value={form.kind} onChange={set('kind')}>
            {KIND_OPTIONS.map((k) => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Price (NZD)</label>
          <input type="number" min="0" step="0.01" required value={form.price} onChange={set('price')} placeholder="89.00" />
        </div>
      </div>
      <div className="form-field">
        <label>Inventory</label>
        <input type="number" min="1" required value={form.inventory} onChange={set('inventory')} placeholder="500" />
      </div>
      <div className="form-row">
        <div className="form-field">
          <label>Sale opens</label>
          <input type="datetime-local" value={form.saleStartsAt.replace(' ', 'T')} onChange={(e) => setForm((f) => ({ ...f, saleStartsAt: e.target.value.replace('T', ' ') }))} />
        </div>
        <div className="form-field">
          <label>Sale closes</label>
          <input type="datetime-local" value={form.saleEndsAt.replace(' ', 'T')} onChange={(e) => setForm((f) => ({ ...f, saleEndsAt: e.target.value.replace('T', ' ') }))} />
        </div>
      </div>
      <div className="form-actions">
        <button type="submit" className="app-button app-button-primary">
          {isEdit ? 'Save changes' : 'Create tier'}
        </button>
      </div>
    </form>
  );
}
