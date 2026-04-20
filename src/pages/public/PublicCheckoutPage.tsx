import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { usePlatform, checkPurchaseLimit, detectSuspiciousPurchase, getAvailableInventory, validatePresaleCode } from '../../lib/platform';
import { paymentService } from '../../services/payment';
import { completeCheckout } from '../../services/commerce';
import { hasApiPersistence } from '../../lib/data-store';

export default function PublicCheckoutPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const referralCode = searchParams.get('ref') ?? '';
  const { state, dispatch, newId, nowStr, refreshFromServer } = usePlatform();

  const event = state.events.find((entry) => entry.id === eventId);
  const venue = event ? state.venues.find((entry) => entry.id === event.venueId) : undefined;
  const tiers = useMemo(
    () => (event ? state.ticketTiers.filter((entry) => entry.eventId === event.id) : []),
    [event, state.ticketTiers],
  );

  const [form, setForm] = useState({
    tierId: tiers[0]?.id ?? '',
    buyerName: '',
    buyerEmail: '',
    quantity: '1',
    presaleCode: referralCode,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const selectedTier = tiers.find((entry) => entry.id === form.tierId);
  const quantity = Math.max(1, Number.parseInt(form.quantity, 10) || 1);
  const available = selectedTier ? getAvailableInventory(selectedTier.id, state.ticketTiers, state.inventoryHolds) : 0;
  const total = selectedTier ? selectedTier.price * quantity : 0;

  if (!event) {
    return (
      <div className="pub-section" style={{ textAlign: 'center', paddingTop: 80 }}>
        <h2>Checkout unavailable</h2>
        <p style={{ color: 'var(--muted)', marginBottom: 24 }}>
          This event could not be found.
        </p>
        <Link to="/events" className="pub-back-link">← Browse events</Link>
      </div>
    );
  }

  const activeEvent = event;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTier) return;

    setSubmitting(true);
    setError('');

    try {
      const latestAvailable = getAvailableInventory(selectedTier.id, state.ticketTiers, state.inventoryHolds);
      if (quantity > latestAvailable) {
        setError(`Only ${latestAvailable} ticket${latestAvailable === 1 ? '' : 's'} remain for ${selectedTier.name}.`);
        setSubmitting(false);
        return;
      }

      const limitCheck = checkPurchaseLimit(
        form.buyerEmail.trim(),
        selectedTier.id,
        activeEvent.id,
        quantity,
        state.purchaseLimits,
        state.orders,
      );
      if (!limitCheck.allowed) {
        setError(limitCheck.reason ?? 'Purchase limit exceeded.');
        setSubmitting(false);
        return;
      }

      const trimmedPresaleCode = form.presaleCode.trim();
      if (trimmedPresaleCode) {
        const presale = validatePresaleCode(
          trimmedPresaleCode,
          activeEvent.id,
          selectedTier.id,
          state.presaleCodes,
          nowStr(),
        );
        if (!presale.valid) {
          setError(presale.reason ?? 'Invalid promo or presale code.');
          setSubmitting(false);
          return;
        }
      }

      const fraudFlag = detectSuspiciousPurchase(
        form.buyerEmail.trim(),
        activeEvent.id,
        selectedTier.id,
        quantity,
        state.orders,
      );
      if (fraudFlag) {
        dispatch({ type: 'FLAG_PURCHASE', flag: fraudFlag });
      }

      if (hasApiPersistence()) {
        const result = await completeCheckout({
          eventId: activeEvent.id,
          tierId: selectedTier.id,
          buyerName: form.buyerName.trim(),
          buyerEmail: form.buyerEmail.trim(),
          quantity,
          presaleCode: trimmedPresaleCode || undefined,
          successUrl: `${window.location.origin}/account?email=${encodeURIComponent(form.buyerEmail.trim())}`,
          cancelUrl: `${window.location.origin}/events/${activeEvent.id}`,
        });

        await refreshFromServer();

        if (result.checkoutSession.status !== 'complete' && result.checkoutSession.url) {
          window.location.assign(result.checkoutSession.url);
          return;
        }

        navigate(`/account?email=${encodeURIComponent(form.buyerEmail.trim())}&order=${result.order.id}`, { replace: true });
        return;
      }

      const orderId = newId('ord');
      const checkoutSession = await paymentService.createCheckoutSession(
        [
          {
            name: selectedTier.name,
            description: `${activeEvent.name} • ${venue?.name ?? 'EventHub venue'}`,
            quantity,
            unitAmount: selectedTier.price * 100,
            currency: 'nzd',
          },
        ],
        `${window.location.origin}/account?email=${encodeURIComponent(form.buyerEmail.trim())}&order=${orderId}`,
        `${window.location.origin}/events/${activeEvent.id}`,
        {
          orderId,
          eventId: activeEvent.id,
          tierId: selectedTier.id,
          buyerEmail: form.buyerEmail.trim(),
        },
      );

      dispatch({
        type: 'CREATE_ORDER',
        payload: {
          id: orderId,
          eventId: activeEvent.id,
          tierId: selectedTier.id,
          buyerName: form.buyerName.trim(),
          buyerEmail: form.buyerEmail.trim(),
          total,
          quantity,
          status: checkoutSession.status === 'complete' ? 'paid' : 'pending',
          createdAt: nowStr(),
        },
        tickets: [],
      });

      if (checkoutSession.url) {
        window.location.assign(checkoutSession.url);
        return;
      }

      navigate(`/account?email=${encodeURIComponent(form.buyerEmail.trim())}&order=${orderId}`, { replace: true });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Checkout failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="pub-section pub-checkout-page">
      <div className="pub-checkout-layout">
        <section className="pub-checkout-main">
          <Link to={`/events/${activeEvent.id}`} className="pub-back-link">← Back to event</Link>
          <div className="pub-section-header" style={{ marginTop: 14 }}>
            <div>
              <h2>Checkout</h2>
              <p>{activeEvent.name}{venue ? ` • ${venue.name}` : ''}</p>
            </div>
          </div>

          <form className="app-form pub-checkout-form" onSubmit={handleSubmit}>
            <div className="form-field">
              <label>Ticket tier</label>
              <select value={form.tierId} onChange={(e) => setForm((current) => ({ ...current, tierId: e.target.value }))} required>
                <option value="">Select tier…</option>
                {tiers.map((tier) => {
                  const remaining = getAvailableInventory(tier.id, state.ticketTiers, state.inventoryHolds);
                  return (
                    <option key={tier.id} value={tier.id} disabled={remaining <= 0}>
                      {tier.name} — ${tier.price} ({remaining} left)
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="form-row">
              <div className="form-field">
                <label>Full name</label>
                <input
                  value={form.buyerName}
                  onChange={(e) => setForm((current) => ({ ...current, buyerName: e.target.value }))}
                  placeholder="Your name"
                  required
                />
              </div>
              <div className="form-field">
                <label>Email</label>
                <input
                  type="email"
                  value={form.buyerEmail}
                  onChange={(e) => setForm((current) => ({ ...current, buyerEmail: e.target.value }))}
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-field">
                <label>Quantity</label>
                <input
                  type="number"
                  min="1"
                  max={Math.max(1, available)}
                  value={form.quantity}
                  onChange={(e) => setForm((current) => ({ ...current, quantity: e.target.value }))}
                  required
                />
              </div>
              <div className="form-field">
                <label>Promo / presale code</label>
                <input
                  value={form.presaleCode}
                  onChange={(e) => setForm((current) => ({ ...current, presaleCode: e.target.value }))}
                  placeholder="Optional code"
                />
              </div>
            </div>

            {error && <p className="form-error">{error}</p>}

            <div className="form-actions">
              <button type="submit" className="app-button app-button-primary" disabled={!selectedTier || submitting}>
                {submitting ? 'Processing…' : 'Complete checkout'}
              </button>
            </div>
          </form>
        </section>

        <aside className="pub-checkout-sidebar">
          <div className="checkout-widget">
            <div className="checkout-widget-header">
              <span className="checkout-widget-label">Order summary</span>
              <span className="checkout-widget-from">{selectedTier ? `$${selectedTier.price}` : 'Select a tier'}</span>
            </div>
            <div className="checkout-tier-list">
              <div className="checkout-tier">
                <div className="checkout-tier-info">
                  <strong>{selectedTier?.name ?? 'Choose a tier'}</strong>
                  <p>{activeEvent.name}</p>
                  <span className="checkout-tier-scarce">{available} remaining</span>
                </div>
                <div className="checkout-tier-price">
                  <span>{selectedTier ? `$${selectedTier.price}` : '—'}</span>
                </div>
              </div>
            </div>
            <div className="pub-checkout-breakdown">
              <div><span>Quantity</span><strong>{quantity}</strong></div>
              <div><span>Subtotal</span><strong>${total.toLocaleString()}</strong></div>
              <div><span>Status</span><strong>{hasApiPersistence() || paymentService.isConfigured() ? 'Server checkout' : 'Instant mock payment'}</strong></div>
            </div>
            <p className="checkout-widget-note">
              Orders appear instantly in My Tickets. Paid orders issue QR tickets automatically.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
