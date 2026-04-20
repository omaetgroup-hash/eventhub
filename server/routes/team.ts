import crypto from 'node:crypto';
import { Router } from 'express';
import {
  appendAudit,
  createStaffAssignment,
  createTeamInvite,
  deleteStaffAssignment,
  getEvent,
  listTeamInvites,
  listStaffAssignments,
} from '../db';
import {
  canAccessEvent,
  getAccessibleEventIds,
  requirePack,
  requirePermission,
  requireSession,
  type AuthRequest,
} from '../middleware';
import { serverEnv } from '../env';
import { sendTransactionalEmail } from '../services/email';

const router = Router();

router.get('/assignments', requireSession, requirePack('operations'), requirePermission('team:read'), (req, res) => {
  const session = (req as AuthRequest).session;
  const { eventId, staffId } = req.query as Record<string, string | undefined>;
  const accessibleEventIds = getAccessibleEventIds(session.user);
  let assignments = listStaffAssignments({
    eventId: eventId || undefined,
    staffId: staffId || undefined,
  });
  if (accessibleEventIds !== null) {
    assignments = assignments.filter((a) => accessibleEventIds.includes(a.eventId));
  }
  res.json(assignments);
});

router.post('/assignments', requireSession, requirePack('operations'), requirePermission('team:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const { staffId, eventId, gate } = req.body as { staffId?: string; eventId?: string; gate?: string };
  if (!staffId?.trim() || !eventId?.trim()) {
    res.status(400).json({ error: 'staffId and eventId are required.' });
    return;
  }
  const event = getEvent(eventId.trim());
  if (!event) { res.status(404).json({ error: 'Event not found.' }); return; }
  if (!canAccessEvent(session.user, event)) {
    res.status(403).json({ error: 'Access denied to this event.' });
    return;
  }
  const assignment = createStaffAssignment({
    staffId: staffId.trim(),
    eventId: eventId.trim(),
    gate: gate?.trim() || undefined,
    assignedBy: session.user.id,
  });
  appendAudit({
    actor: session.user.id,
    action: 'staff.assigned',
    target: staffId.trim(),
    severity: 'info',
    note: `event:${eventId}${gate?.trim() ? ` gate:${gate.trim()}` : ''}`,
  });
  res.status(201).json(assignment);
});

router.delete('/assignments/:id', requireSession, requirePack('operations'), requirePermission('team:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const id = req.params.id as string;
  const all = listStaffAssignments();
  const assignment = all.find((a) => a.id === id);
  if (!assignment) { res.status(404).json({ error: 'Assignment not found.' }); return; }
  const event = getEvent(assignment.eventId);
  if (event && !canAccessEvent(session.user, event)) {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }
  deleteStaffAssignment(id);
  appendAudit({
    actor: session.user.id,
    action: 'staff.unassigned',
    target: assignment.staffId,
    severity: 'info',
    note: `event:${assignment.eventId}${assignment.gate ? ` gate:${assignment.gate}` : ''}`,
  });
  res.status(204).send();
});

router.get('/invites', requireSession, requirePermission('team:read'), (_req, res) => {
  res.json(listTeamInvites());
});

router.post('/invites', requireSession, requirePermission('team:write'), async (req, res) => {
  const session = (req as AuthRequest).session;
  const { name, email, role, scope } = req.body as { name?: string; email?: string; role?: string; scope?: string };
  if (!name?.trim() || !email?.trim() || !role?.trim()) {
    res.status(400).json({ error: 'name, email, and role are required.' });
    return;
  }

  const token = crypto.randomBytes(24).toString('hex');
  const invite = createTeamInvite({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    role: role as AuthRequest['session']['user']['role'],
    scope: scope?.trim() || 'All events',
    invitedBy: session.user.id,
    token,
    expiresAt: new Date(Date.now() + serverEnv.inviteTtlHours * 60 * 60_000).toISOString(),
  });

  const acceptUrl = `${serverEnv.appUrl}/app/login?invite=${invite.token}`;

  await sendTransactionalEmail('organizer_invite', invite.email, {
    invitedName: invite.name,
    invitedRole: invite.role,
    scope: invite.scope,
    invitedBy: session.user.name,
    acceptUrl,
    expiresAt: invite.expiresAt,
  });

  appendAudit({
    actor: session.user.id,
    action: 'team.member_invited',
    target: invite.email,
    severity: 'info',
    note: invite.role,
  });

  res.status(201).json({
    invite: {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      scope: invite.scope,
      expiresAt: invite.expiresAt,
    },
    acceptUrl,
  });
});

export default router;
