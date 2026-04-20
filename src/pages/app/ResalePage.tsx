import { usePlatform } from '../../lib/platform';

export default function ResalePage() {
  const { state } = usePlatform();

  return (
    <div className="app-page">
      <section className="app-page-header">
        <div>
          <p className="app-kicker">Marketplace maturity</p>
          <h2>Verified resale</h2>
          <p>Track face-value resale listings, see seller activity, and prepare transfer restrictions for a safer secondary market.</p>
        </div>
      </section>

      <section className="app-stat-grid">
        <article className="app-stat-card">
          <span>Listings</span>
          <strong>{state.resaleListings.length}</strong>
        </article>
        <article className="app-stat-card">
          <span>Face value volume</span>
          <strong>${state.resaleListings.reduce((sum, listing) => sum + listing.faceValue, 0).toLocaleString()}</strong>
        </article>
        <article className="app-stat-card">
          <span>Asking volume</span>
          <strong>${state.resaleListings.reduce((sum, listing) => sum + listing.askingPrice, 0).toLocaleString()}</strong>
        </article>
      </section>

      <section className="app-panel">
        <div className="app-panel-header">
          <h3>Active resale listings</h3>
          <span>{state.resaleListings.length} records</span>
        </div>
        <div className="app-list">
          {state.resaleListings.map((listing) => {
            const event = state.events.find((entry) => entry.id === listing.eventId);
            const premium = listing.askingPrice - listing.faceValue;
            return (
              <div key={listing.id} className="app-list-row">
                <div>
                  <strong>{event?.name ?? listing.eventId}</strong>
                  <p>{listing.sellerEmail}</p>
                </div>
                <div className="app-list-metric">
                  <strong>${listing.askingPrice.toLocaleString()}</strong>
                  <p>Face value ${listing.faceValue} · {premium >= 0 ? `+${premium}` : premium} premium · {listing.status}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
