import { useState } from 'react';
import RoleGate from '../../components/ui/RoleGate';
import type { AnnouncementRecord } from '../../lib/domain';
import { usePlatform } from '../../lib/platform';

const EMPTY_ANNOUNCEMENT = {
  eventId: 'evt_005',
  title: '',
  channel: 'push' as AnnouncementRecord['channel'],
};

export default function EngagementPage() {
  const { state, dispatch, newId, nowStr } = usePlatform();
  const [selectedEventId, setSelectedEventId] = useState('evt_005');
  const [announcementForm, setAnnouncementForm] = useState(EMPTY_ANNOUNCEMENT);

  const profiles = state.matchmakingProfiles.filter((profile) => profile.eventId === selectedEventId);
  const appointments = state.appointments.filter((appointment) => appointment.eventId === selectedEventId);
  const polls = state.livePolls.filter((poll) => poll.eventId === selectedEventId);
  const surveys = state.surveys.filter((survey) => survey.eventId === selectedEventId);
  const announcements = state.announcements.filter((announcement) => announcement.eventId === selectedEventId);

  function saveAnnouncement() {
    const payload: AnnouncementRecord = {
      id: newId('ann'),
      eventId: announcementForm.eventId || selectedEventId,
      title: announcementForm.title.trim(),
      channel: announcementForm.channel,
      sentAt: nowStr(),
    };
    dispatch({ type: 'UPSERT_ANNOUNCEMENT', payload });
    setAnnouncementForm({ ...EMPTY_ANNOUNCEMENT, eventId: selectedEventId });
  }

  return (
    <div className="app-page">
      <section className="app-page-header">
        <div>
          <p className="app-kicker">Conference layer</p>
          <h2>Engagement and networking</h2>
          <p>Track matchmaking, appointments, live polls, surveys, and attendee announcements from the same event workspace.</p>
        </div>
      </section>

      <div className="app-filter-bar" style={{ marginBottom: 24 }}>
        <select className="app-select" value={selectedEventId} onChange={(e) => { setSelectedEventId(e.target.value); setAnnouncementForm((current) => ({ ...current, eventId: e.target.value })); }}>
          {state.events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
        </select>
      </div>

      <section className="app-stat-grid">
        <article className="app-stat-card">
          <span>Match profiles</span>
          <strong>{profiles.length}</strong>
        </article>
        <article className="app-stat-card">
          <span>Appointments</span>
          <strong>{appointments.length}</strong>
        </article>
        <article className="app-stat-card">
          <span>Live polls</span>
          <strong>{polls.length}</strong>
        </article>
        <article className="app-stat-card">
          <span>Announcements</span>
          <strong>{announcements.length}</strong>
        </article>
      </section>

      <section className="app-two-column">
        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Networking</h3>
          </div>
          <div className="app-list">
            {profiles.map((profile) => (
              <div key={profile.id} className="app-list-row">
                <div>
                  <strong>{profile.attendeeName}</strong>
                  <p>{profile.interests.join(', ')}</p>
                  <p className="app-muted-sm">{profile.goals.join(' · ')}</p>
                </div>
                <div className="app-list-metric">
                  <strong>{profile.availability}</strong>
                  <p>match profile</p>
                </div>
              </div>
            ))}
            {appointments.map((appointment) => (
              <div key={appointment.id} className="app-list-row">
                <div>
                  <strong>{appointment.attendeeName}</strong>
                  <p>Meeting with {appointment.counterpart}</p>
                </div>
                <div className="app-list-metric">
                  <strong>{appointment.status}</strong>
                  <p>{appointment.startsAt} · {appointment.location}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Polls and surveys</h3>
          </div>
          <div className="app-list">
            {polls.map((poll) => (
              <div key={poll.id} className="app-list-row">
                <div>
                  <strong>{poll.question}</strong>
                  <p>Live poll</p>
                </div>
                <div className="app-list-metric">
                  <strong>{poll.responses}</strong>
                  <p>{poll.status}</p>
                </div>
              </div>
            ))}
            {surveys.map((survey) => (
              <div key={survey.id} className="app-list-row">
                <div>
                  <strong>{survey.title}</strong>
                  <p>{survey.audience}</p>
                </div>
                <div className="app-list-metric">
                  <strong>{Math.round(survey.completionRate * 100)}%</strong>
                  <p>completion</p>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="app-panel">
        <div className="app-panel-header">
          <h3>Announcements</h3>
          <span>{announcements.length} messages</span>
        </div>
        <div className="app-list">
          {announcements.map((announcement) => (
            <div key={announcement.id} className="app-list-row">
              <div>
                <strong>{announcement.title}</strong>
                <p>{announcement.channel} broadcast</p>
              </div>
              <div className="app-list-metric">
                <strong>{announcement.sentAt}</strong>
              </div>
            </div>
          ))}
        </div>

        <RoleGate permission="events:write">
          <div className="app-form" style={{ marginTop: 18 }}>
            <div className="form-row">
              <div className="form-field">
                <label>Announcement title</label>
                <input value={announcementForm.title} onChange={(e) => setAnnouncementForm((current) => ({ ...current, title: e.target.value }))} placeholder="Workshop rooms now open" />
              </div>
              <div className="form-field">
                <label>Channel</label>
                <select value={announcementForm.channel} onChange={(e) => setAnnouncementForm((current) => ({ ...current, channel: e.target.value as AnnouncementRecord['channel'] }))}>
                  <option value="push">Push</option>
                  <option value="email">Email</option>
                  <option value="onsite">Onsite</option>
                </select>
              </div>
            </div>
            <div className="form-actions">
              <button className="app-button app-button-primary" onClick={saveAnnouncement} disabled={!announcementForm.title.trim()}>
                Save announcement
              </button>
            </div>
          </div>
        </RoleGate>
      </section>
    </div>
  );
}
