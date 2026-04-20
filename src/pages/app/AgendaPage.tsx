import { useState } from 'react';
import RoleGate from '../../components/ui/RoleGate';
import type { SessionRecord, SpeakerProfile } from '../../lib/domain';
import { usePlatform } from '../../lib/platform';

const EMPTY_SESSION = {
  eventId: 'evt_005',
  title: '',
  track: '',
  startsAt: '',
  endsAt: '',
  speakerIds: [] as string[],
  room: '',
};

const EMPTY_SPEAKER = {
  name: '',
  title: '',
  organization: '',
  bio: '',
  topicTags: '',
};

export default function AgendaPage() {
  const { state, dispatch, newId } = usePlatform();
  const [selectedEventId, setSelectedEventId] = useState('evt_005');
  const [sessionForm, setSessionForm] = useState(EMPTY_SESSION);
  const [speakerForm, setSpeakerForm] = useState(EMPTY_SPEAKER);

  const sessions = state.sessions.filter((session) => session.eventId === selectedEventId);
  const speakers = state.speakers;

  function toggleSpeaker(id: string) {
    setSessionForm((current) => ({
      ...current,
      speakerIds: current.speakerIds.includes(id)
        ? current.speakerIds.filter((speakerId) => speakerId !== id)
        : [...current.speakerIds, id],
    }));
  }

  function saveSession() {
    const payload: SessionRecord = {
      id: newId('sess'),
      eventId: sessionForm.eventId || selectedEventId,
      title: sessionForm.title.trim(),
      track: sessionForm.track.trim(),
      startsAt: sessionForm.startsAt,
      endsAt: sessionForm.endsAt,
      speakerIds: sessionForm.speakerIds,
      room: sessionForm.room.trim(),
    };
    dispatch({ type: 'UPSERT_SESSION', payload });
    setSessionForm({ ...EMPTY_SESSION, eventId: selectedEventId });
  }

  function saveSpeaker() {
    const payload: SpeakerProfile = {
      id: newId('spk'),
      name: speakerForm.name.trim(),
      title: speakerForm.title.trim(),
      organization: speakerForm.organization.trim(),
      bio: speakerForm.bio.trim(),
      topicTags: speakerForm.topicTags.split(',').map((tag) => tag.trim()).filter(Boolean),
    };
    dispatch({ type: 'UPSERT_SPEAKER', payload });
    setSpeakerForm(EMPTY_SPEAKER);
  }

  return (
    <div className="app-page">
      <section className="app-page-header">
        <div>
          <p className="app-kicker">Conference layer</p>
          <h2>Agenda builder</h2>
          <p>Build multi-session schedules, manage speakers, and attach talks to your core event model.</p>
        </div>
      </section>

      <div className="app-filter-bar" style={{ marginBottom: 24 }}>
        <select className="app-select" value={selectedEventId} onChange={(e) => { setSelectedEventId(e.target.value); setSessionForm((current) => ({ ...current, eventId: e.target.value })); }}>
          {state.events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
        </select>
        <span className="app-muted-sm">{sessions.length} sessions · {speakers.length} speakers</span>
      </div>

      <section className="app-two-column">
        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Agenda sessions</h3>
            <span>{sessions.length} scheduled</span>
          </div>
          <div className="app-list">
            {sessions.map((session) => (
              <div key={session.id} className="app-list-row">
                <div>
                  <strong>{session.title}</strong>
                  <p>{session.track} · {session.startsAt} → {session.endsAt} · {session.room}</p>
                </div>
                <div className="app-list-metric">
                  <strong>{session.speakerIds.length}</strong>
                  <p>speaker{session.speakerIds.length !== 1 ? 's' : ''}</p>
                </div>
                <RoleGate permission="events:write">
                  <button className="app-action-btn app-action-danger" onClick={() => dispatch({ type: 'DELETE_SESSION', id: session.id })}>
                    Delete
                  </button>
                </RoleGate>
              </div>
            ))}
          </div>

          <RoleGate permission="events:write">
            <div className="app-form" style={{ marginTop: 18 }}>
              <div className="form-row">
                <div className="form-field">
                  <label>Title</label>
                  <input value={sessionForm.title} onChange={(e) => setSessionForm((current) => ({ ...current, title: e.target.value }))} placeholder="Design systems in the wild" />
                </div>
                <div className="form-field">
                  <label>Track</label>
                  <input value={sessionForm.track} onChange={(e) => setSessionForm((current) => ({ ...current, track: e.target.value }))} placeholder="Product" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>Starts</label>
                  <input type="datetime-local" value={sessionForm.startsAt} onChange={(e) => setSessionForm((current) => ({ ...current, startsAt: e.target.value }))} />
                </div>
                <div className="form-field">
                  <label>Ends</label>
                  <input type="datetime-local" value={sessionForm.endsAt} onChange={(e) => setSessionForm((current) => ({ ...current, endsAt: e.target.value }))} />
                </div>
                <div className="form-field">
                  <label>Room</label>
                  <input value={sessionForm.room} onChange={(e) => setSessionForm((current) => ({ ...current, room: e.target.value }))} placeholder="Main Stage" />
                </div>
              </div>
              <div className="form-field">
                <label>Speakers</label>
                <div className="access-rule-tier-grid">
                  {speakers.map((speaker) => (
                    <label key={speaker.id} className="access-rule-tier-check">
                      <input type="checkbox" checked={sessionForm.speakerIds.includes(speaker.id)} onChange={() => toggleSpeaker(speaker.id)} />
                      <span>{speaker.name}</span>
                      <span className="access-rule-tier-kind">{speaker.organization}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-actions">
                <button className="app-button app-button-primary" onClick={saveSession} disabled={!sessionForm.title.trim() || !sessionForm.startsAt || !sessionForm.endsAt}>
                  Save session
                </button>
              </div>
            </div>
          </RoleGate>
        </article>

        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Speaker library</h3>
            <span>{speakers.length} profiles</span>
          </div>
          <div className="app-list">
            {speakers.map((speaker) => (
              <div key={speaker.id} className="app-list-row">
                <div>
                  <strong>{speaker.name}</strong>
                  <p>{speaker.title} · {speaker.organization}</p>
                  <p className="app-muted-sm">{speaker.topicTags.join(', ')}</p>
                </div>
              </div>
            ))}
          </div>

          <RoleGate permission="events:write">
            <div className="app-form" style={{ marginTop: 18 }}>
              <div className="form-row">
                <div className="form-field">
                  <label>Name</label>
                  <input value={speakerForm.name} onChange={(e) => setSpeakerForm((current) => ({ ...current, name: e.target.value }))} placeholder="Amelia Hart" />
                </div>
                <div className="form-field">
                  <label>Title</label>
                  <input value={speakerForm.title} onChange={(e) => setSpeakerForm((current) => ({ ...current, title: e.target.value }))} placeholder="Design Director" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>Organization</label>
                  <input value={speakerForm.organization} onChange={(e) => setSpeakerForm((current) => ({ ...current, organization: e.target.value }))} placeholder="North Studio" />
                </div>
                <div className="form-field">
                  <label>Topics <span className="form-hint">(comma separated)</span></label>
                  <input value={speakerForm.topicTags} onChange={(e) => setSpeakerForm((current) => ({ ...current, topicTags: e.target.value }))} placeholder="design systems, product" />
                </div>
              </div>
              <div className="form-field">
                <label>Bio</label>
                <textarea value={speakerForm.bio} onChange={(e) => setSpeakerForm((current) => ({ ...current, bio: e.target.value }))} rows={4} />
              </div>
              <div className="form-actions">
                <button className="app-button app-button-primary" onClick={saveSpeaker} disabled={!speakerForm.name.trim() || !speakerForm.title.trim()}>
                  Save speaker
                </button>
              </div>
            </div>
          </RoleGate>
        </article>
      </section>
    </div>
  );
}
