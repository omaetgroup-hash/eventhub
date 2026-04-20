import { useMemo } from 'react';
import { usePlatform } from '../../lib/platform';

export default function AudiencePage() {
  const { state } = usePlatform();

  const customerProfiles = useMemo(() => {
    const byEmail = new Map<string, { email: string; name: string; orders: number; spend: number; events: Set<string> }>();
    for (const order of state.orders.filter((entry) => entry.status === 'paid')) {
      const current = byEmail.get(order.buyerEmail) ?? {
        email: order.buyerEmail,
        name: order.buyerName,
        orders: 0,
        spend: 0,
        events: new Set<string>(),
      };
      current.orders += 1;
      current.spend += order.total;
      current.events.add(order.eventId);
      byEmail.set(order.buyerEmail, current);
    }

    return Array.from(byEmail.values())
      .map((profile) => ({
        ...profile,
        repeatBuyer: profile.orders > 1,
        highValue: profile.spend >= 400,
        eventCount: profile.events.size,
      }))
      .sort((left, right) => right.spend - left.spend);
  }, [state.orders]);

  const repeatBuyers = customerProfiles.filter((profile) => profile.repeatBuyer).length;
  const highValueBuyers = customerProfiles.filter((profile) => profile.highValue).length;

  return (
    <div className="app-page">
      <section className="app-page-header">
        <div>
          <p className="app-kicker">Organizer growth</p>
          <h2>Audience</h2>
          <p>See who is buying, which segments are worth targeting, and which customers are becoming repeat or high-value fans.</p>
        </div>
      </section>

      <section className="app-stat-grid">
        <article className="app-stat-card">
          <span>Known buyers</span>
          <strong>{customerProfiles.length}</strong>
        </article>
        <article className="app-stat-card">
          <span>Repeat buyers</span>
          <strong>{repeatBuyers}</strong>
        </article>
        <article className="app-stat-card">
          <span>High-value buyers</span>
          <strong>{highValueBuyers}</strong>
        </article>
        <article className="app-stat-card">
          <span>Segments</span>
          <strong>{state.customerSegments.length}</strong>
        </article>
      </section>

      <section className="app-two-column">
        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Saved segments</h3>
            <span>{state.customerSegments.length} audiences</span>
          </div>
          <div className="app-list">
            {state.customerSegments.map((segment) => (
              <div key={segment.id} className="app-list-row">
                <div>
                  <strong>{segment.name}</strong>
                  <p>{segment.criteria}</p>
                  {segment.notes && <p className="app-muted-sm">{segment.notes}</p>}
                </div>
                <div className="app-list-metric">
                  <strong>{segment.memberCount}</strong>
                  <p>{segment.repeatBuyerCount} repeat · {segment.highValueCount} high-value</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Audience signals</h3>
          </div>
          <div className="app-list">
            <div className="app-list-row">
              <div>
                <strong>Repeat rate</strong>
                <p>Share of paid customers who have purchased more than once.</p>
              </div>
              <div className="app-list-metric">
                <strong>{customerProfiles.length ? Math.round((repeatBuyers / customerProfiles.length) * 100) : 0}%</strong>
                <p>Current baseline</p>
              </div>
            </div>
            <div className="app-list-row">
              <div>
                <strong>Average events per buyer</strong>
                <p>How broad each customer relationship is across your portfolio.</p>
              </div>
              <div className="app-list-metric">
                <strong>{customerProfiles.length ? (customerProfiles.reduce((sum, profile) => sum + profile.eventCount, 0) / customerProfiles.length).toFixed(1) : '0.0'}</strong>
                <p>Portfolio reach</p>
              </div>
            </div>
            <div className="app-list-row">
              <div>
                <strong>High-value audience</strong>
                <p>Customers over $400 lifetime spend are best candidates for VIP and loyalty offers.</p>
              </div>
              <div className="app-list-metric">
                <strong>{highValueBuyers}</strong>
                <p>Actionable now</p>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="app-panel">
        <div className="app-panel-header">
          <h3>Top customers</h3>
          <span>Derived from paid orders</span>
        </div>
        <div className="app-table-panel" style={{ padding: 0, border: 'none', background: 'transparent' }}>
          <div className="app-table-header app-table-header-5">
            <span>Buyer</span>
            <span>Email</span>
            <span>Orders</span>
            <span>Events</span>
            <span>Spend</span>
          </div>
          {customerProfiles.slice(0, 8).map((profile) => (
            <div key={profile.email} className="app-table-row app-table-row-5">
              <strong>{profile.name}</strong>
              <span>{profile.email}</span>
              <span>{profile.orders}{profile.repeatBuyer && <span className="badge badge-green" style={{ marginLeft: 8 }}>repeat</span>}</span>
              <span>{profile.eventCount}</span>
              <span>${profile.spend.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
