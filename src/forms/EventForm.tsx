import { useState } from 'react';
import type { EventRecord, EventStatus } from '../lib/domain';
import { usePlatform } from '../lib/platform';

interface EventFormProps {
  initial?: Partial<EventRecord>;
  onDone: () => void;
}

const STATUS_OPTIONS: EventStatus[] = ['draft', 'on_sale', 'sold_out', 'live', 'completed', 'cancelled'];

const CATEGORIES = ['Festival', 'Conference', 'Club Night', 'Concert', 'Exhibition', 'Sport', 'Workshop', 'Other'];

export default function EventForm({ initial, onDone }: EventFormProps) {
  const { dispatch, newId, nowStr, state } = usePlatform();
  const isEdit = !!initial?.id;

  const [form, setForm] = useState({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    status: (initial?.status ?? 'draft') as EventStatus,
    startsAt: initial?.startsAt ?? '',
    endsAt: initial?.endsAt ?? '',
    venueId: initial?.venueId ?? '',
    organizerId: initial?.organizerId ?? '',
    category: initial?.category ?? 'Festival',
  });

  const set = (key: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [key]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const event: EventRecord = {
      id: initial?.id ?? newId('evt'),
      name: form.name.trim(),
      description: form.description.trim(),
      status: form.status,
      startsAt: form.startsAt,
      endsAt: form.endsAt,
      venueId: form.venueId,
      organizerId: form.organizerId,
      category: form.category,
      ticketsSold: initial?.ticketsSold ?? 0,
      grossRevenue: initial?.grossRevenue ?? 0,
      createdAt: initial?.createdAt ?? nowStr(),
    };
    dispatch({ type: 'UPSERT_EVENT', payload: event });
    onDone();
  }

  return (
    <form className="app-form" onSubmit={submit}>
      <div className="form-field">
        <label>Event name</label>
        <input required value={form.name} onChange={set('name')} placeholder="Auckland Summer Series" />
      </div>
      <div className="form-field">
        <label>Description</label>
        <textarea rows={3} value={form.description} onChange={set('description')} placeholder="Brief description of the event…" />
      </div>
      <div className="form-row">
        <div className="form-field">
          <label>Category</label>
          <select value={form.category} onChange={set('category')}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Status</label>
          <select value={form.status} onChange={set('status')}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-field">
          <label>Starts at</label>
          <input type="datetime-local" required value={form.startsAt.replace(' ', 'T')} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value.replace('T', ' ') }))} />
        </div>
        <div className="form-field">
          <label>Ends at</label>
          <input type="datetime-local" value={form.endsAt.replace(' ', 'T')} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value.replace(' ', ' ') }))} />
        </div>
      </div>
      <div className="form-field">
        <label>Venue</label>
        <select required value={form.venueId} onChange={set('venueId')}>
          <option value="">Select venue…</option>
          {state.venues.map((v) => <option key={v.id} value={v.id}>{v.name} — {v.city}</option>)}
        </select>
      </div>
      <div className="form-field">
        <label>Organizer</label>
        <select value={form.organizerId} onChange={set('organizerId')}>
          <option value="">Unassigned</option>
          {state.teamMembers
            .filter((m) => m.role === 'organizer' || m.role === 'super_admin')
            .map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      <div className="form-actions">
        <button type="submit" className="app-button app-button-primary">
          {isEdit ? 'Save changes' : 'Create event'}
        </button>
      </div>
    </form>
  );
}
