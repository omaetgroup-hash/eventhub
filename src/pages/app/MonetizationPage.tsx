import { usePlatform } from '../../lib/platform';

export default function MonetizationPage() {
  const { state } = usePlatform();

  return (
    <div className="app-page">
      <section className="app-page-header">
        <div>
          <p className="app-kicker">Marketplace maturity</p>
          <h2>Premium monetization</h2>
          <p>Manage upgrade offers, membership access, sponsor placements, and dynamic pricing rules that push EventHub beyond basic ticketing.</p>
        </div>
      </section>

      <section className="app-stat-grid">
        <article className="app-stat-card">
          <span>Upgrade offers</span>
          <strong>{state.upgradeOffers.length}</strong>
        </article>
        <article className="app-stat-card">
          <span>Members</span>
          <strong>{state.membershipPlans.reduce((sum, plan) => sum + plan.activeMembers, 0)}</strong>
        </article>
        <article className="app-stat-card">
          <span>Sponsor placements</span>
          <strong>{state.sponsorPlacements.length}</strong>
        </article>
        <article className="app-stat-card">
          <span>Dynamic rules</span>
          <strong>{state.dynamicPricingRules.length}</strong>
        </article>
      </section>

      <section className="app-two-column">
        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Upgrades and memberships</h3>
          </div>
          <div className="app-list">
            {state.upgradeOffers.map((offer) => {
              const event = state.events.find((entry) => entry.id === offer.eventId);
              return (
                <div key={offer.id} className="app-list-row">
                  <div>
                    <strong>{offer.name}</strong>
                    <p>{event?.name ?? offer.eventId}</p>
                  </div>
                  <div className="app-list-metric">
                    <strong>${offer.upgradePrice}</strong>
                    <p>{offer.claimed}/{offer.inventory} claimed</p>
                  </div>
                </div>
              );
            })}
            {state.membershipPlans.map((plan) => (
              <div key={plan.id} className="app-list-row">
                <div>
                  <strong>{plan.name}</strong>
                  <p>{plan.benefits.join(' · ')}</p>
                </div>
                <div className="app-list-metric">
                  <strong>${plan.price}/{plan.billingCycle === 'monthly' ? 'mo' : 'yr'}</strong>
                  <p>{plan.activeMembers} active members</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Sponsor placements</h3>
          </div>
          <div className="app-list">
            {state.sponsorPlacements.map((placement) => (
              <div key={placement.id} className="app-list-row">
                <div>
                  <strong>{placement.name}</strong>
                  <p>{placement.sponsor} · {placement.placement}</p>
                </div>
                <div className="app-list-metric">
                  <strong>{placement.impressions.toLocaleString()}</strong>
                  <p>{placement.clicks} clicks</p>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="app-panel">
        <div className="app-panel-header">
          <h3>Dynamic pricing rules</h3>
          <span>{state.dynamicPricingRules.length} active rules</span>
        </div>
        <div className="app-list">
          {state.dynamicPricingRules.map((rule) => {
            const event = state.events.find((entry) => entry.id === rule.eventId);
            const tier = state.ticketTiers.find((entry) => entry.id === rule.tierId);
            return (
              <div key={rule.id} className="app-list-row">
                <div>
                  <strong>{event?.name ?? rule.eventId}</strong>
                  <p>{tier?.name ?? rule.tierId} · trigger: {rule.trigger}</p>
                </div>
                <div className="app-list-metric">
                  <strong>{rule.adjustmentType === 'increase_percent' ? '+' : '-'}{rule.adjustmentValue}%</strong>
                  <p>{rule.status}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
