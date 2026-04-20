import { useState } from 'react';
import type { Venue } from '../lib/domain';
import { usePlatform } from '../lib/platform';

interface VenueFormProps {
  initial?: Partial<Venue>;
  onDone: () => void;
}

export default function VenueForm({ initial, onDone }: VenueFormProps) {
  const { dispatch, newId, nowStr, state } = usePlatform();
  const isEdit = !!initial?.id;

  const [form, setForm] = useState({
    name: initial?.name ?? '',
    address: initial?.address ?? '',
    city: initial?.city ?? '',
    country: initial?.country ?? 'NZ',
    capacity: initial?.capacity?.toString() ?? '',
    zonesRaw: initial?.zones?.join(', ') ?? '',
    managerId: initial?.managerId ?? '',
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const manager = state.teamMembers.find((m) => m.id === form.managerId);
    const venue: Venue = {
      id: initial?.id ?? newId('venue'),
      name: form.name.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      country: form.country.trim(),
      capacity: parseInt(form.capacity, 10) || 0,
      zones: form.zonesRaw.split(',').map((z) => z.trim()).filter(Boolean),
      managerId: form.managerId,
      manager: manager?.name ?? '',
      createdAt: initial?.createdAt ?? nowStr(),
    };
    dispatch({ type: 'UPSERT_VENUE', payload: venue });
    onDone();
  }

  return (
    <form className="app-form" onSubmit={submit}>
      <div className="form-field">
        <label>Venue name</label>
        <input required value={form.name} onChange={set('name')} placeholder="Harbour Hall" />
      </div>
      <div className="form-field">
        <label>Address</label>
        <input value={form.address} onChange={set('address')} placeholder="1 Quay Street" />
      </div>
      <div className="form-row">
        <div className="form-field">
          <label>City</label>
          <input required value={form.city} onChange={set('city')} placeholder="Auckland" />
        </div>
        <div className="form-field">
          <label>Country</label>
          <input value={form.country} onChange={set('country')} placeholder="NZ" />
        </div>
      </div>
      <div className="form-field">
        <label>Capacity</label>
        <input type="number" min="1" required value={form.capacity} onChange={set('capacity')} placeholder="4200" />
      </div>
      <div className="form-field">
        <label>Zones <span className="form-hint">(comma-separated)</span></label>
        <input value={form.zonesRaw} onChange={set('zonesRaw')} placeholder="GA Floor, VIP Lounge, North Seating" />
      </div>
      <div className="form-field">
        <label>Manager</label>
        <select value={form.managerId} onChange={set('managerId')}>
          <option value="">Unassigned</option>
          {state.teamMembers
            .filter((m) => m.role === 'venue_manager' || m.role === 'organizer' || m.role === 'super_admin')
            .map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
        </select>
      </div>
      <div className="form-actions">
        <button type="submit" className="app-button app-button-primary">
          {isEdit ? 'Save changes' : 'Create venue'}
        </button>
      </div>
    </form>
  );
}
