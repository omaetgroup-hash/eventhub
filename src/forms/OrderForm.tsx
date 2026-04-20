import { useState, useMemo } from 'react';
import type { IssuedTicket, OrderRecord, OrderStatus, PaymentRecord } from '../lib/domain';
import { usePlatform, getAvailableInventory, checkPurchaseLimit, detectSuspiciousPurchase, validatePresaleCode } from '../lib/platform';
import { encodeShortPayload } from '../services/qr';
import { paymentService } from '../services/payment';

interface OrderFormProps {
  defaultEventId?: string;
  onDone: () => void;
}

export default function OrderForm({ defaultEventId, onDone }: OrderFormProps) {
  const { dispatch, newId, nowStr, state } = usePlatform();

  const [form, setForm] = useState({
    eventId: defaultEventId ?? '',
    tierId: '',
    buyerName: '',
    buyerEmail: '',
    quantity: '1',
    presaleCode: '',
    status: 'paid' as OrderStatus,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setForm((f) => {
      const next = { ...f, [key]: e.target.value };
      if (key === 'eventId') next.tierId = '';
      return next;
    });
  };

  const tiersForEvent = useMemo(
    () => state.ticketTiers.filter((t) => t.eventId === form.eventId),
    [state.ticketTiers, form.eventId]
  );

  const selectedTier = state.ticketTiers.find((t) => t.id === form.tierId);
  const qty = Math.max(1, parseInt(form.quantity, 10) || 1);
  const availableQty = selectedTier
    ? getAvailableInventory(form.tierId, state.ticketTiers, state.inventoryHolds)
    : 999;
  const maxQty = availableQty;
  const total = selectedTier ? selectedTier.price * qty : 0;
  const amountCents = total * 100;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTier) return;
    setSubmitting(true);
    setError(null);

    try {
      const available = getAvailableInventory(form.tierId, state.ticketTiers, state.inventoryHolds);
      if (qty > available) {
        setError(`Only ${available} ticket${available === 1 ? '' : 's'} available.`);
        setSubmitting(false);
        return;
      }

      const limitResult = checkPurchaseLimit(
        form.buyerEmail.trim(),
        form.tierId,
        form.eventId,
        qty,
        state.purchaseLimits,
        state.orders,
      );
      if (!limitResult.allowed) {
        setError(limitResult.reason ?? 'Purchase limit exceeded.');
        setSubmitting(false);
        return;
      }

      const trimmedPresaleCode = form.presaleCode.trim();
      let matchedPresaleId: string | null = null;
      if (trimmedPresaleCode) {
        const presaleResult = validatePresaleCode(
          trimmedPresaleCode,
          form.eventId,
          form.tierId,
          state.presaleCodes,
          nowStr(),
        );
        if (!presaleResult.valid) {
          setError(presaleResult.reason ?? 'Invalid presale code.');
          setSubmitting(false);
          return;
        }
        matchedPresaleId = presaleResult.codeRecord?.id ?? null;
      }

      const fraudFlag = detectSuspiciousPurchase(
        form.buyerEmail.trim(),
        form.eventId,
        form.tierId,
        qty,
        state.orders,
      );
      if (fraudFlag) {
        dispatch({ type: 'FLAG_PURCHASE', flag: fraudFlag });
      }

      const orderId = newId('ord');
      const issuedAt = nowStr();

      const intent = await paymentService.createPaymentIntent(amountCents, 'nzd', {
        orderId,
        tierId: form.tierId,
        eventId: form.eventId,
        buyerEmail: form.buyerEmail.trim(),
      });

      const tickets: IssuedTicket[] = Array.from({ length: qty }, () => {
        const ticketId = newId('tkt');
        return {
          id: ticketId,
          orderId,
          tierId: form.tierId,
          eventId: form.eventId,
          holderName: form.buyerName.trim(),
          holderEmail: form.buyerEmail.trim(),
          qrPayload: encodeShortPayload(form.eventId, ticketId),
          status: 'valid' as const,
          issuedAt,
        };
      });

      const order: OrderRecord = {
        id: orderId,
        eventId: form.eventId,
        tierId: form.tierId,
        buyerName: form.buyerName.trim(),
        buyerEmail: form.buyerEmail.trim(),
        total,
        quantity: qty,
        status: form.status,
        createdAt: issuedAt,
      };

      const paymentRecord: PaymentRecord = {
        id: newId('pay'),
        orderId,
        intentId: intent.id,
        provider: paymentService.provider,
        amountCents,
        currency: 'nzd',
        status: intent.status === 'succeeded' ? 'succeeded' : 'initiated',
        createdAt: issuedAt,
      };

      dispatch({ type: 'CREATE_ORDER', payload: order, tickets });
      dispatch({ type: 'CREATE_PAYMENT', payload: paymentRecord });
      if (matchedPresaleId) {
        dispatch({ type: 'USE_PRESALE_CODE', id: matchedPresaleId });
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="app-form" onSubmit={submit}>
      <div className="form-field">
        <label>Event</label>
        <select required value={form.eventId} onChange={set('eventId')}>
          <option value="">Select event…</option>
          {state.events
            .filter((ev) => ev.status === 'on_sale' || ev.status === 'live')
            .map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
        </select>
      </div>

      <div className="form-field">
        <label>Ticket tier</label>
        <select required value={form.tierId} onChange={set('tierId')} disabled={!form.eventId}>
          <option value="">Select tier…</option>
          {tiersForEvent.map((t) => {
            const avail = getAvailableInventory(t.id, state.ticketTiers, state.inventoryHolds);
            return (
              <option key={t.id} value={t.id} disabled={avail <= 0}>
                {t.name} — ${t.price} ({avail} remaining)
              </option>
            );
          })}
        </select>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label>Buyer name</label>
          <input required value={form.buyerName} onChange={set('buyerName')} placeholder="Sam Nguyen" />
        </div>
        <div className="form-field">
          <label>Buyer email</label>
          <input type="email" required value={form.buyerEmail} onChange={set('buyerEmail')} placeholder="sam@example.com" />
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label>Quantity <span className="form-hint">(max {maxQty})</span></label>
          <input
            type="number"
            min="1"
            max={maxQty}
            required
            value={form.quantity}
            onChange={set('quantity')}
          />
        </div>
        <div className="form-field">
          <label>Payment status</label>
          <select value={form.status} onChange={set('status')}>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
          </select>
        </div>
      </div>

      <div className="form-field">
        <label>Promo / presale code <span className="form-hint">(optional)</span></label>
        <input
          value={form.presaleCode}
          onChange={set('presaleCode')}
          placeholder="FANCLUB26"
          className="app-mono"
        />
      </div>

      {selectedTier && (
        <div className="order-form-summary">
          <span>{qty} × {selectedTier.name} @ ${selectedTier.price}</span>
          <strong>Total: ${total.toLocaleString()}</strong>
        </div>
      )}

      {error && <p className="form-error">{error}</p>}

      <div className="form-actions">
        <button
          type="submit"
          className="app-button app-button-primary"
          disabled={!selectedTier || submitting}
        >
          {submitting ? 'Processing…' : 'Create order + issue tickets'}
        </button>
      </div>
    </form>
  );
}
