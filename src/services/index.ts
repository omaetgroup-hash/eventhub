export { createPaymentService, paymentService } from './payment';
export type {
  PaymentService,
  PaymentIntent,
  CheckoutSession,
  CheckoutLineItem,
  RefundResult,
  WebhookEvent,
  PaymentStatus,
  PaymentError,
} from './payment';

export { createEmailService, emailService } from './email';
export type {
  EmailService,
  EmailTemplate,
  SendResult,
  OrderConfirmationData,
  TicketIssuedData,
  RefundConfirmationData,
  OrganizerInviteData,
  EventReminderData,
  EmailError,
} from './email';

export {
  encodeQrPayload,
  encodeShortPayload,
  decodeQrPayload,
  isQrPayloadValid,
  ticketIdFromShortPayload,
} from './qr';
export type { QrTicketData, QrDecodeResult } from './qr';

export { AUDIT, buildAuditEntry, AuditLogger } from './audit';
export type { AuditAction, AuditSeverity } from './audit';
