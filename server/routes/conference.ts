import crypto from 'node:crypto';
import { Router } from 'express';
import {
  appendAudit,
  deleteAnnouncement,
  deleteAppointment,
  deleteConferenceSession,
  deleteExhibitor,
  deletePoll,
  deleteSpeaker,
  deleteSponsor,
  deleteSurvey,
  getConferenceSession,
  getEvent,
  getSpeaker,
  insertAnnouncement,
  listAnnouncements,
  listAppointments,
  listExhibitors,
  listPolls,
  listSessions,
  listSpeakers,
  listSponsors,
  listSurveys,
  respondToPoll,
  upsertAppointment,
  upsertExhibitor,
  upsertPoll,
  upsertSession,
  upsertSpeaker,
  upsertSponsor,
  upsertSurvey,
} from '../db';
import {
  canAccessEvent,
  requireAdmin,
  requirePermission,
  requireSession,
  type AuthRequest,
} from '../middleware';

const router = Router();

function nowIso() { return new Date().toISOString(); }
function newId(prefix: string) { return `${prefix}_${crypto.randomBytes(4).toString('hex')}`; }

function guardEvent(req: import('express').Request, res: import('express').Response): boolean {
  const event = getEvent(req.params['eventId'] as string);
  if (!event) { res.status(404).json({ error: 'Event not found.' }); return false; }
  const session = (req as AuthRequest).session;
  if (!canAccessEvent(session.user, event)) { res.status(403).json({ error: 'Event access denied.' }); return false; }
  return true;
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

router.get('/events/:eventId/sessions', requireSession, requirePermission('events:read'), (req, res) => {
  if (!guardEvent(req, res)) return;
  res.json(listSessions(req.params['eventId'] as string));
});

router.post('/events/:eventId/sessions', requireSession, requirePermission('events:write'), (req, res) => {
  if (!guardEvent(req, res)) return;
  const session = (req as AuthRequest).session;
  const body = req.body as { title?: string; track?: string; startsAt?: string; endsAt?: string; speakerIds?: string[]; room?: string; capacity?: number };
  if (!body.title?.trim()) { res.status(400).json({ error: 'title is required.' }); return; }
  const eventId = req.params['eventId'] as string;

  const s = upsertSession({
    id: newId('sess'),
    eventId,
    title: body.title.trim(),
    track: body.track ?? '',
    startsAt: body.startsAt ?? nowIso(),
    endsAt: body.endsAt ?? '',
    speakerIds: body.speakerIds ?? [],
    room: body.room ?? '',
    capacity: body.capacity,
    createdAt: nowIso(),
  });
  appendAudit({ actor: session.user.id, action: 'session.created', target: s.id, severity: 'info', note: s.title });
  res.status(201).json(s);
});

router.get('/events/:eventId/sessions/:id', requireSession, requirePermission('events:read'), (req, res) => {
  if (!guardEvent(req, res)) return;
  const s = getConferenceSession(req.params['id'] as string);
  if (!s || s.eventId !== (req.params['eventId'] as string)) { res.status(404).json({ error: 'Session not found.' }); return; }
  res.json(s);
});

router.put('/events/:eventId/sessions/:id', requireSession, requirePermission('events:write'), (req, res) => {
  if (!guardEvent(req, res)) return;
  const existing = getConferenceSession(req.params['id'] as string);
  if (!existing || existing.eventId !== (req.params['eventId'] as string)) { res.status(404).json({ error: 'Session not found.' }); return; }
  res.json(upsertSession({ ...existing, ...req.body, id: existing.id, eventId: existing.eventId, createdAt: existing.createdAt }));
});

router.delete('/events/:eventId/sessions/:id', requireSession, requireAdmin, requirePermission('events:write'), (req, res) => {
  if (!guardEvent(req, res)) return;
  if (!deleteConferenceSession(req.params['id'] as string)) { res.status(404).json({ error: 'Session not found.' }); return; }
  res.status(204).send();
});

// ─── Speakers ─────────────────────────────────────────────────────────────────

router.get('/events/:eventId/speakers', requireSession, requirePermission('events:read'), (req, res) => {
  if (!guardEvent(req, res)) return;
  res.json(listSpeakers(req.params['eventId'] as string));
});

router.post('/events/:eventId/speakers', requireSession, requirePermission('events:write'), (req, res) => {
  if (!guardEvent(req, res)) return;
  const session = (req as AuthRequest).session;
  const body = req.body as { name?: string; title?: string; organization?: string; bio?: string; topicTags?: string[] };
  if (!body.name?.trim()) { res.status(400).json({ error: 'name is required.' }); return; }

  const speaker = upsertSpeaker({
    id: newId('spkr'),
    eventId: req.params['eventId'] as string,
    name: body.name.trim(),
    title: body.title ?? '',
    organization: body.organization ?? '',
    bio: body.bio ?? '',
    topicTags: body.topicTags ?? [],
    createdAt: nowIso(),
  });
  appendAudit({ actor: session.user.id, action: 'speaker.created', target: speaker.id, severity: 'info', note: speaker.name });
  res.status(201).json(speaker);
});

router.put('/events/:eventId/speakers/:id', requireSession, requirePermission('events:write'), (req, res) => {
  if (!guardEvent(req, res)) return;
  const existing = getSpeaker(req.params['id'] as string);
  if (!existing || existing.eventId !== (req.params['eventId'] as string)) { res.status(404).json({ error: 'Speaker not found.' }); return; }
  res.json(upsertSpeaker({ ...existing, ...req.body, id: existing.id, eventId: existing.eventId, createdAt: existing.createdAt }));
});

router.delete('/events/:eventId/speakers/:id', requireSession, requireAdmin, requirePermission('events:write'), (req, res) => {
  if (!guardEvent(req, res)) return;
  if (!deleteSpeaker(req.params['id'] as string)) { res.status(404).json({ error: 'Speaker not found.' }); return; }
  res.status(204).send();
});

// ─── Exhibitors ───────────────────────────────────────────────────────────────

router.get('/events/:eventId/exhibitors', requireSession, requirePermission('events:read'), (req, res) => {
  if (!guardEvent(req, res)) return;
  res.json(listExhibitors(req.params['eventId'] as string));
});

router.post('/events/:eventId/exhibitors', requireSession, requirePermission('events:write'), (req, res) => {
  if (!guardEvent(req, res)) return;
  const session = (req as AuthRequest).session;
  const body = req.body as { name?: string; hall?: string; boothCode?: string };
  if (!body.name?.trim()) { res.status(400).json({ error: 'name is required.' }); return; }

  const exhibitor = upsertExhibitor({
    id: newId('exh'),
    eventId: req.params['eventId'] as string,
    name: body.name.trim(),
    hall: body.hall ?? '',
    boothCode: body.boothCode ?? '',
    leadCount: 0,
    meetingCount: 0,
    createdAt: nowIso(),
  });
  appendAudit({ actor: session.user.id, action: 'exhibitor.created', target: exhibitor.id, severity: 'info', note: exhibitor.name });
  res.status(201).json(exhibitor);
});

router.delete('/events/:eventId/exhibitors/:id', requireSession, requireAdmin, requirePermission('events:write'), (req, res) => {
  if (!guardEvent(req, res)) return;
  if (!deleteExhibitor(req.params['id'] as string)) { res.status(404).json({ error: 'Exhibitor not found.' }); return; }
  res.status(204).send();
});

// ─── Sponsors ─────────────────────────────────────────────────────────────────

router.get('/events/:eventId/sponsors', requireSession, requirePermission('events:read'), (req, res) => {
  if (!guardEvent(req, res)) return;
  res.json(listSponsors(req.params['eventId'] as string));
});

router.post('/events/:eventId/sponsors', requireSession, requirePermission('events:write'), (req, res) => {
  if (!guardEvent(req, res)) return;
  const session = (req as AuthRequest).session;
  const body = req.body as { name?: string; tier?: string; boothId?: string; website?: string };
  if (!body.name?.trim()) { res.status(400).json({ error: 'name is required.' }); return; }

  const sponsor = upsertSponsor({
    id: newId('spon'),
    eventId: req.params['eventId'] as string,
    name: body.name.trim(),
    tier: body.tier ?? 'bronze',
    boothId: body.boothId,
    website: body.website,
    createdAt: nowIso(),
  });
  appendAudit({ actor: session.user.id, action: 'sponsor.created', target: sponsor.id, severity: 'info', note: sponsor.name });
  res.status(201).json(sponsor);
});

router.delete('/events/:eventId/sponsors/:id', requireSession, requireAdmin, requirePermission('events:write'), (req, res) => {
  if (!guardEvent(req, res)) return;
  if (!deleteSponsor(req.params['id'] as string)) { res.status(404).json({ error: 'Sponsor not found.' }); return; }
  res.status(204).send();
});

// ─── Appointments ─────────────────────────────────────────────────────────────

router.get('/events/:eventId/appointments', requireSession, requirePermission('events:read'), (req, res) => {
  if (!guardEvent(req, res)) return;
  res.json(listAppointments(req.params['eventId'] as string));
});

router.post('/events/:eventId/appointments', requireSession, requirePermission('events:write'), (req, res) => {
  if (!guardEvent(req, res)) return;
  const body = req.body as { attendeeName?: string; counterpart?: string; startsAt?: string; location?: string };
  if (!body.attendeeName?.trim() || !body.counterpart?.trim()) {
    res.status(400).json({ error: 'attendeeName and counterpart are required.' });
    return;
  }
  const appt = upsertAppointment({
    id: newId('appt'),
    eventId: req.params['eventId'] as string,
    attendeeName: body.attendeeName.trim(),
    counterpart: body.counterpart.trim(),
    startsAt: body.startsAt ?? nowIso(),
    location: body.location ?? '',
    status: 'scheduled',
    createdAt: nowIso(),
  });
  res.status(201).json(appt);
});

router.delete('/events/:eventId/appointments/:id', requireSession, requirePermission('events:write'), (req, res) => {
  if (!guardEvent(req, res)) return;
  if (!deleteAppointment(req.params['id'] as string)) { res.status(404).json({ error: 'Appointment not found.' }); return; }
  res.status(204).send();
});

// ─── Announcements ────────────────────────────────────────────────────────────

router.get('/events/:eventId/announcements', requireSession, requirePermission('events:read'), (req, res) => {
  if (!guardEvent(req, res)) return;
  res.json(listAnnouncements(req.params['eventId'] as string));
});

router.post('/events/:eventId/announcements', requireSession, requirePermission('events:write'), (req, res) => {
  if (!guardEvent(req, res)) return;
  const session = (req as AuthRequest).session;
  const body = req.body as { title?: string; body?: string; channel?: string };
  if (!body.title?.trim() || !body.body?.trim()) { res.status(400).json({ error: 'title and body are required.' }); return; }

  const announcement = insertAnnouncement({
    id: newId('ann'),
    eventId: req.params['eventId'] as string,
    title: body.title.trim(),
    body: body.body.trim(),
    channel: body.channel ?? 'app',
    sentAt: nowIso(),
    createdAt: nowIso(),
  });
  appendAudit({ actor: session.user.id, action: 'announcement.sent', target: announcement.id, severity: 'info', note: announcement.title });
  res.status(201).json(announcement);
});

router.delete('/events/:eventId/announcements/:id', requireSession, requireAdmin, requirePermission('events:write'), (req, res) => {
  if (!guardEvent(req, res)) return;
  if (!deleteAnnouncement(req.params['id'] as string)) { res.status(404).json({ error: 'Announcement not found.' }); return; }
  res.status(204).send();
});

// ─── Surveys ──────────────────────────────────────────────────────────────────

router.get('/events/:eventId/surveys', requireSession, requirePermission('events:read'), (req, res) => {
  if (!guardEvent(req, res)) return;
  res.json(listSurveys(req.params['eventId'] as string));
});

router.post('/events/:eventId/surveys', requireSession, requirePermission('events:write'), (req, res) => {
  if (!guardEvent(req, res)) return;
  const body = req.body as { title?: string; audience?: string };
  if (!body.title?.trim()) { res.status(400).json({ error: 'title is required.' }); return; }

  res.status(201).json(upsertSurvey({
    id: newId('surv'),
    eventId: req.params['eventId'] as string,
    title: body.title.trim(),
    audience: body.audience ?? 'all',
    completionRate: 0,
    createdAt: nowIso(),
  }));
});

router.delete('/events/:eventId/surveys/:id', requireSession, requireAdmin, requirePermission('events:write'), (req, res) => {
  if (!guardEvent(req, res)) return;
  if (!deleteSurvey(req.params['id'] as string)) { res.status(404).json({ error: 'Survey not found.' }); return; }
  res.status(204).send();
});

// ─── Polls ────────────────────────────────────────────────────────────────────

router.get('/events/:eventId/polls', requireSession, requirePermission('events:read'), (req, res) => {
  if (!guardEvent(req, res)) return;
  res.json(listPolls(req.params['eventId'] as string));
});

router.post('/events/:eventId/polls', requireSession, requirePermission('events:write'), (req, res) => {
  if (!guardEvent(req, res)) return;
  const body = req.body as { question?: string; options?: string[] };
  if (!body.question?.trim() || !body.options?.length) {
    res.status(400).json({ error: 'question and options are required.' });
    return;
  }
  res.status(201).json(upsertPoll({
    id: newId('poll'),
    eventId: req.params['eventId'] as string,
    question: body.question.trim(),
    status: 'open',
    options: body.options,
    responses: 0,
    createdAt: nowIso(),
  }));
});

router.post('/events/:eventId/polls/:id/respond', (req, res) => {
  respondToPoll(req.params['id'] as string);
  res.json({ ok: true });
});

router.delete('/events/:eventId/polls/:id', requireSession, requireAdmin, requirePermission('events:write'), (req, res) => {
  if (!guardEvent(req, res)) return;
  if (!deletePoll(req.params['id'] as string)) { res.status(404).json({ error: 'Poll not found.' }); return; }
  res.status(204).send();
});

export default router;
