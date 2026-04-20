import { useMemo, useState } from 'react';
import RoleGate from '../../components/ui/RoleGate';
import type { CheckoutQuestion, CheckoutQuestionType, DiscountCampaign, DiscountType } from '../../lib/domain';
import { usePlatform } from '../../lib/platform';

const EMPTY_DISCOUNT = {
  eventId: '',
  name: '',
  code: '',
  type: 'percentage' as DiscountType,
  amount: '10',
  startsAt: '',
  endsAt: '',
  active: true,
};

const EMPTY_QUESTION = {
  eventId: '',
  label: '',
  type: 'text' as CheckoutQuestionType,
  required: false,
  options: '',
};

export default function DiscountsPage() {
  const { state, dispatch, newId, nowStr } = usePlatform();
  const [selectedEventId, setSelectedEventId] = useState(state.events[0]?.id ?? '');
  const [discountForm, setDiscountForm] = useState(EMPTY_DISCOUNT);
  const [questionForm, setQuestionForm] = useState(EMPTY_QUESTION);

  const discounts = useMemo(
    () => state.discountCampaigns.filter((discount) => !selectedEventId || discount.eventId === selectedEventId),
    [selectedEventId, state.discountCampaigns],
  );

  const questions = useMemo(
    () => state.checkoutQuestions.filter((question) => !selectedEventId || question.eventId === selectedEventId),
    [selectedEventId, state.checkoutQuestions],
  );

  function saveDiscount() {
    const payload: DiscountCampaign = {
      id: newId('disc'),
      eventId: discountForm.eventId || selectedEventId,
      name: discountForm.name.trim(),
      code: discountForm.code.trim().toUpperCase(),
      type: discountForm.type,
      amount: Number(discountForm.amount) || 0,
      startsAt: discountForm.startsAt || undefined,
      endsAt: discountForm.endsAt || undefined,
      redemptions: 0,
      revenueAttributed: 0,
      active: discountForm.active,
      createdAt: nowStr(),
    };
    dispatch({ type: 'UPSERT_DISCOUNT', payload });
    setDiscountForm({ ...EMPTY_DISCOUNT, eventId: selectedEventId });
  }

  function saveQuestion() {
    const payload: CheckoutQuestion = {
      id: newId('qform'),
      eventId: questionForm.eventId || selectedEventId,
      label: questionForm.label.trim(),
      type: questionForm.type,
      required: questionForm.required,
      options: questionForm.type === 'select'
        ? questionForm.options.split(',').map((entry) => entry.trim()).filter(Boolean)
        : undefined,
    };
    dispatch({ type: 'UPSERT_CHECKOUT_QUESTION', payload });
    setQuestionForm({ ...EMPTY_QUESTION, eventId: selectedEventId });
  }

  return (
    <div className="app-page">
      <section className="app-page-header">
        <div>
          <p className="app-kicker">Organizer growth</p>
          <h2>Discounts and checkout</h2>
          <p>Launch early bird offers, manage promo codes, and shape the questions buyers answer during checkout.</p>
        </div>
      </section>

      <div className="app-filter-bar" style={{ marginBottom: 24 }}>
        <select className="app-select" value={selectedEventId} onChange={(e) => {
          setSelectedEventId(e.target.value);
          setDiscountForm((current) => ({ ...current, eventId: e.target.value }));
          setQuestionForm((current) => ({ ...current, eventId: e.target.value }));
        }}>
          <option value="">All events</option>
          {state.events.map((event) => (
            <option key={event.id} value={event.id}>{event.name}</option>
          ))}
        </select>
      </div>

      <section className="app-two-column">
        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Discount campaigns</h3>
            <span>{discounts.length} live offers</span>
          </div>
          <div className="app-list">
            {discounts.map((discount) => {
              const event = state.events.find((entry) => entry.id === discount.eventId);
              return (
                <div key={discount.id} className="app-list-row">
                  <div>
                    <strong>{discount.name}</strong>
                    <p>{event?.name ?? discount.eventId} · {discount.code} · {discount.type.replace(/_/g, ' ')}</p>
                  </div>
                  <div className="app-list-metric">
                    <strong>{discount.type === 'percentage' ? `${discount.amount}%` : `$${discount.amount}`}</strong>
                    <p>{discount.redemptions} redemptions · ${discount.revenueAttributed.toLocaleString()} influenced</p>
                  </div>
                  <RoleGate permission="marketing:write">
                    <button className="app-action-btn app-action-danger" onClick={() => dispatch({ type: 'DELETE_DISCOUNT', id: discount.id })}>
                      Delete
                    </button>
                  </RoleGate>
                </div>
              );
            })}
            {discounts.length === 0 && <div className="app-empty-state">No discount campaigns yet.</div>}
          </div>

          <RoleGate permission="marketing:write">
            <div className="app-form" style={{ marginTop: 18 }}>
              <div className="form-row">
                <div className="form-field">
                  <label>Offer name</label>
                  <input value={discountForm.name} onChange={(e) => setDiscountForm((current) => ({ ...current, name: e.target.value }))} placeholder="Design Forward early bird" />
                </div>
                <div className="form-field">
                  <label>Promo code</label>
                  <input value={discountForm.code} onChange={(e) => setDiscountForm((current) => ({ ...current, code: e.target.value.toUpperCase() }))} placeholder="EARLY20" className="app-mono" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>Type</label>
                  <select value={discountForm.type} onChange={(e) => setDiscountForm((current) => ({ ...current, type: e.target.value as DiscountType }))}>
                    <option value="percentage">Percentage</option>
                    <option value="fixed">Fixed value</option>
                    <option value="early_bird">Early bird</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>Value</label>
                  <input type="number" min="0" value={discountForm.amount} onChange={(e) => setDiscountForm((current) => ({ ...current, amount: e.target.value }))} />
                </div>
                <div className="form-field">
                  <label>Event</label>
                  <select value={discountForm.eventId} onChange={(e) => setDiscountForm((current) => ({ ...current, eventId: e.target.value }))}>
                    <option value="">Select event</option>
                    {state.events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>Starts</label>
                  <input type="datetime-local" value={discountForm.startsAt} onChange={(e) => setDiscountForm((current) => ({ ...current, startsAt: e.target.value }))} />
                </div>
                <div className="form-field">
                  <label>Ends</label>
                  <input type="datetime-local" value={discountForm.endsAt} onChange={(e) => setDiscountForm((current) => ({ ...current, endsAt: e.target.value }))} />
                </div>
              </div>
              <div className="form-actions">
                <button className="app-button app-button-primary" onClick={saveDiscount} disabled={!discountForm.name.trim() || !discountForm.code.trim() || !(discountForm.eventId || selectedEventId)}>
                  Save discount
                </button>
              </div>
            </div>
          </RoleGate>
        </article>

        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Checkout questions</h3>
            <span>{questions.length} configured prompts</span>
          </div>
          <div className="app-list">
            {questions.map((question) => (
              <div key={question.id} className="app-list-row">
                <div>
                  <strong>{question.label}</strong>
                  <p>{question.type} · {question.required ? 'required' : 'optional'}</p>
                  {question.options && <p className="app-muted-sm">{question.options.join(', ')}</p>}
                </div>
                <RoleGate permission="marketing:write">
                  <button className="app-action-btn app-action-danger" onClick={() => dispatch({ type: 'DELETE_CHECKOUT_QUESTION', id: question.id })}>
                    Delete
                  </button>
                </RoleGate>
              </div>
            ))}
            {questions.length === 0 && <div className="app-empty-state">No checkout questions configured.</div>}
          </div>

          <RoleGate permission="marketing:write">
            <div className="app-form" style={{ marginTop: 18 }}>
              <div className="form-field">
                <label>Question label</label>
                <input value={questionForm.label} onChange={(e) => setQuestionForm((current) => ({ ...current, label: e.target.value }))} placeholder="Dietary requirements" />
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>Type</label>
                  <select value={questionForm.type} onChange={(e) => setQuestionForm((current) => ({ ...current, type: e.target.value as CheckoutQuestionType }))}>
                    <option value="text">Text</option>
                    <option value="select">Select</option>
                    <option value="checkbox">Checkbox</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>Event</label>
                  <select value={questionForm.eventId} onChange={(e) => setQuestionForm((current) => ({ ...current, eventId: e.target.value }))}>
                    <option value="">Select event</option>
                    {state.events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
                  </select>
                </div>
              </div>
              {questionForm.type === 'select' && (
                <div className="form-field">
                  <label>Options <span className="form-hint">(comma separated)</span></label>
                  <input value={questionForm.options} onChange={(e) => setQuestionForm((current) => ({ ...current, options: e.target.value }))} placeholder="Design, Brand, Engineering" />
                </div>
              )}
              <label className="access-rule-tier-check" style={{ marginTop: 12 }}>
                <input type="checkbox" checked={questionForm.required} onChange={(e) => setQuestionForm((current) => ({ ...current, required: e.target.checked }))} />
                <span>Required at checkout</span>
              </label>
              <div className="form-actions">
                <button className="app-button app-button-primary" onClick={saveQuestion} disabled={!questionForm.label.trim() || !(questionForm.eventId || selectedEventId)}>
                  Save question
                </button>
              </div>
            </div>
          </RoleGate>
        </article>
      </section>
    </div>
  );
}
