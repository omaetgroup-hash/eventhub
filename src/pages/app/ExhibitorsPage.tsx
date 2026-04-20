import { useState } from 'react';
import RoleGate from '../../components/ui/RoleGate';
import type { ExhibitorBooth } from '../../lib/domain';
import { usePlatform } from '../../lib/platform';

const EMPTY_BOOTH = {
  eventId: 'evt_005',
  name: '',
  hall: '',
  boothCode: '',
};

export default function ExhibitorsPage() {
  const { state, dispatch, newId } = usePlatform();
  const [selectedEventId, setSelectedEventId] = useState('evt_005');
  const [boothForm, setBoothForm] = useState(EMPTY_BOOTH);

  const booths = state.exhibitorBooths.filter((booth) => booth.eventId === selectedEventId);
  const sponsors = state.sponsors.filter((sponsor) => sponsor.eventId === selectedEventId);

  function saveBooth() {
    const payload: ExhibitorBooth = {
      id: newId('booth'),
      eventId: boothForm.eventId || selectedEventId,
      name: boothForm.name.trim(),
      hall: boothForm.hall.trim(),
      boothCode: boothForm.boothCode.trim().toUpperCase(),
      leadCount: 0,
      meetingCount: 0,
    };
    dispatch({ type: 'UPSERT_EXHIBITOR', payload });
    setBoothForm({ ...EMPTY_BOOTH, eventId: selectedEventId });
  }

  return (
    <div className="app-page">
      <section className="app-page-header">
        <div>
          <p className="app-kicker">Conference layer</p>
          <h2>Sponsors and exhibitors</h2>
          <p>Manage booths, sponsor tiers, and exhibitor lead flow for expos, conferences, and trade events.</p>
        </div>
      </section>

      <div className="app-filter-bar" style={{ marginBottom: 24 }}>
        <select className="app-select" value={selectedEventId} onChange={(e) => { setSelectedEventId(e.target.value); setBoothForm((current) => ({ ...current, eventId: e.target.value })); }}>
          {state.events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
        </select>
        <span className="app-muted-sm">{booths.length} booths · {sponsors.length} sponsors</span>
      </div>

      <section className="app-two-column">
        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Exhibitor booths</h3>
            <span>{booths.length} active booths</span>
          </div>
          <div className="app-list">
            {booths.map((booth) => (
              <div key={booth.id} className="app-list-row">
                <div>
                  <strong>{booth.name}</strong>
                  <p>{booth.hall} · Booth {booth.boothCode}</p>
                </div>
                <div className="app-list-metric">
                  <strong>{booth.leadCount}</strong>
                  <p>{booth.meetingCount} meetings</p>
                </div>
              </div>
            ))}
          </div>

          <RoleGate permission="events:write">
            <div className="app-form" style={{ marginTop: 18 }}>
              <div className="form-row">
                <div className="form-field">
                  <label>Company / booth</label>
                  <input value={boothForm.name} onChange={(e) => setBoothForm((current) => ({ ...current, name: e.target.value }))} placeholder="North Studio" />
                </div>
                <div className="form-field">
                  <label>Hall</label>
                  <input value={boothForm.hall} onChange={(e) => setBoothForm((current) => ({ ...current, hall: e.target.value }))} placeholder="Expo Hall A" />
                </div>
                <div className="form-field">
                  <label>Booth code</label>
                  <input value={boothForm.boothCode} onChange={(e) => setBoothForm((current) => ({ ...current, boothCode: e.target.value.toUpperCase() }))} placeholder="A12" className="app-mono" />
                </div>
              </div>
              <div className="form-actions">
                <button className="app-button app-button-primary" onClick={saveBooth} disabled={!boothForm.name.trim() || !boothForm.hall.trim() || !boothForm.boothCode.trim()}>
                  Save booth
                </button>
              </div>
            </div>
          </RoleGate>
        </article>

        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Sponsor roster</h3>
            <span>{sponsors.length} linked sponsors</span>
          </div>
          <div className="app-list">
            {sponsors.map((sponsor) => (
              <div key={sponsor.id} className="app-list-row">
                <div>
                  <strong>{sponsor.name}</strong>
                  <p>{sponsor.tier} sponsor</p>
                  {sponsor.website && <p className="app-muted-sm">{sponsor.website}</p>}
                </div>
                <div className="app-list-metric">
                  <strong>{sponsor.boothId ? 'Booth linked' : 'No booth'}</strong>
                  <p>{sponsor.boothId ?? 'Link later'}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="app-list" style={{ marginTop: 18 }}>
            <div className="app-list-row">
              <div>
                <strong>Lead capture readiness</strong>
                <p>Booth-level lead and meeting counts are modeled so sponsor ROI can flow into reports later.</p>
              </div>
              <div className="app-list-metric">
                <strong>Scaffolded</strong>
                <p>Live retrieval pending</p>
              </div>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
