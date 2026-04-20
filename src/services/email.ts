import { env, isServerBackedEmailConfigured } from '../lib/env';

export interface OrderConfirmationData {
  orderId: string;
  buyerName: string;
  buyerEmail: string;
  eventName: string;
  eventDate: string;
  venueName: string;
  tierName: string;
  quantity: number;
  total: number;
  currency: string;
  tickets: Array<{ id: string; qrPayload: string; holderName: string }>;
}

export interface TicketIssuedData {
  holderName: string;
  holderEmail: string;
  eventName: string;
  eventDate: string;
  venueName: string;
  tierName: string;
  qrPayload: string;
  ticketId: string;
}

export interface RefundConfirmationData {
  orderId: string;
  buyerName: string;
  buyerEmail: string;
  amountRefunded: number;
  currency: string;
  eventName: string;
  reason?: string;
}

export interface OrganizerInviteData {
  inviteeName: string;
  inviteeEmail: string;
  role: string;
  orgName: string;
  invitedBy: string;
  acceptUrl: string;
}

export interface EventReminderData {
  holderName: string;
  holderEmail: string;
  eventName: string;
  eventDate: string;
  venueName: string;
  venueAddress: string;
  qrPayloads: string[];
}

export type EmailTemplate =
  | 'order_confirmation'
  | 'ticket_issued'
  | 'refund_confirmation'
  | 'organizer_invite'
  | 'event_reminder';

export interface SendResult {
  id: string;
  template: EmailTemplate;
  to: string;
  status: 'sent' | 'failed';
  provider: string;
  error?: string;
  sentAt: string;
}

export class EmailError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly provider: string,
  ) {
    super(message);
    this.name = 'EmailError';
  }
}

export interface EmailService {
  readonly provider: string;
  isConfigured(): boolean;
  sendOrderConfirmation(data: OrderConfirmationData): Promise<SendResult>;
  sendTicketIssued(data: TicketIssuedData): Promise<SendResult>;
  sendRefundConfirmation(data: RefundConfirmationData): Promise<SendResult>;
  sendOrganizerInvite(data: OrganizerInviteData): Promise<SendResult>;
  sendEventReminder(data: EventReminderData): Promise<SendResult>;
}

function mockSendResult(template: EmailTemplate, to: string): SendResult {
  const result: SendResult = {
    id: `mock_${Math.random().toString(36).slice(2, 10)}`,
    template,
    to,
    status: 'sent',
    provider: 'mock',
    sentAt: new Date().toISOString(),
  };
  if (import.meta.env.DEV) {
    console.info(`[MockEmailService] ${template} -> ${to}`, result);
  }
  return result;
}

class MockEmailService implements EmailService {
  readonly provider = 'mock';

  isConfigured(): boolean {
    return false;
  }

  async sendOrderConfirmation(data: OrderConfirmationData): Promise<SendResult> {
    return mockSendResult('order_confirmation', data.buyerEmail);
  }
  async sendTicketIssued(data: TicketIssuedData): Promise<SendResult> {
    return mockSendResult('ticket_issued', data.holderEmail);
  }
  async sendRefundConfirmation(data: RefundConfirmationData): Promise<SendResult> {
    return mockSendResult('refund_confirmation', data.buyerEmail);
  }
  async sendOrganizerInvite(data: OrganizerInviteData): Promise<SendResult> {
    return mockSendResult('organizer_invite', data.inviteeEmail);
  }
  async sendEventReminder(data: EventReminderData): Promise<SendResult> {
    return mockSendResult('event_reminder', data.holderEmail);
  }
}

class ServerEmailService implements EmailService {
  readonly provider = 'resend';

  constructor(
    private readonly apiBaseUrl: string,
    private readonly fromAddress: string,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.apiBaseUrl) && this.fromAddress.includes('@');
  }

  private async send<T>(template: EmailTemplate, to: string, payload: T): Promise<SendResult> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/email/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          template,
          to,
          from: this.fromAddress,
          payload,
        }),
      });

      if (!response.ok) {
        throw new EmailError(`Email API request failed (${response.status})`, 'http_error', 'resend');
      }

      return await response.json() as SendResult;
    } catch (error) {
      if (error instanceof EmailError) throw error;
      throw new EmailError(
        `Email dispatch API is unavailable at ${this.apiBaseUrl}.`,
        'network_error',
        'resend',
      );
    }
  }

  async sendOrderConfirmation(data: OrderConfirmationData): Promise<SendResult> {
    return this.send('order_confirmation', data.buyerEmail, data);
  }
  async sendTicketIssued(data: TicketIssuedData): Promise<SendResult> {
    return this.send('ticket_issued', data.holderEmail, data);
  }
  async sendRefundConfirmation(data: RefundConfirmationData): Promise<SendResult> {
    return this.send('refund_confirmation', data.buyerEmail, data);
  }
  async sendOrganizerInvite(data: OrganizerInviteData): Promise<SendResult> {
    return this.send('organizer_invite', data.inviteeEmail, data);
  }
  async sendEventReminder(data: EventReminderData): Promise<SendResult> {
    return this.send('event_reminder', data.holderEmail, data);
  }
}

export function createEmailService(fromAddress?: string): EmailService {
  if (isServerBackedEmailConfigured() && fromAddress) {
    return new ServerEmailService(env.emailApiBaseUrl, fromAddress);
  }
  return new MockEmailService();
}

export const emailService: EmailService = createEmailService(env.emailSender);
