import { Link } from 'react-router-dom';
import OrbitalHero from '../components/OrbitalHero';
import StarField from '../components/StarField';
import { ADD_ON_PACKS, PACK_DEFINITIONS } from '../lib/packs';

const standardHighlights = [
  {
    title: 'Events',
    description: 'Create, publish, and manage live events from one structured workspace.',
  },
  {
    title: 'Ticketing',
    description: 'Checkout, orders, QR tickets, customer access, and core reporting in one flow.',
  },
  {
    title: 'Venues',
    description: 'Manage locations, capacity, layouts, and event ownership without extra systems.',
  },
  {
    title: 'Customers',
    description: 'Give buyers a clean path from discovery to purchase to ticket access.',
  },
];

const addOnPackIds = ADD_ON_PACKS.filter((pack) => pack !== 'monetization');

export default function OriginPage() {
  return (
    <div className="site-shell site-shell-origin site-shell-eventhub">
      <StarField />
      <main className="origin-layout">
        <section className="eventhub-hero-grid">
          <div className="eventhub-copy">
            <p className="eventhub-kicker">Kapoe presents EventHub</p>
            <h1 className="eventhub-title">Sell, manage, and grow live events from one core platform.</h1>
            <p className="eventhub-tagline">
              EventHub starts with a strong Standard platform for events, ticketing, orders, venues, and customer access.
              Add finance, operations, growth, conference, or enterprise packs only when your clients need them.
            </p>
            <div className="eventhub-cta-row">
              <Link className="primary-cta" to="/app">
                Start with Standard
              </Link>
              <Link className="secondary-cta" to="/events">
                Explore Marketplace
              </Link>
            </div>
            <div className="eventhub-metrics">
              <article>
                <strong>Standard</strong>
                <span>the core EventHub platform</span>
              </article>
              <article>
                <strong>5</strong>
                <span>add-on packs ready to layer in</span>
              </article>
              <article>
                <strong>Modular</strong>
                <span>sell only what each customer needs</span>
              </article>
            </div>
          </div>
          <div className="origin-hero-wrap eventhub-orb-wrap">
            <OrbitalHero />
          </div>
        </section>

        <section className="eventhub-section">
          <div className="eventhub-section-header">
            <p className="eventhub-section-kicker">Standard Pack</p>
            <h2>The main offer for every EventHub customer.</h2>
            <p>
              Standard is the event commerce core. It gives clients the product they need to run real events without forcing
              them into finance, operations, conference, or enterprise complexity on day one.
            </p>
          </div>
          <div className="eventhub-module-grid">
            {standardHighlights.map((highlight) => (
              <article key={highlight.title} className="eventhub-module-card">
                <div className="eventhub-module-topline">
                  <span>{highlight.title}</span>
                  <strong>Included</strong>
                </div>
                <p>{highlight.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="eventhub-section">
          <div className="eventhub-section-header">
            <p className="eventhub-section-kicker">Add-On Packs</p>
            <h2>Add depth only where a customer needs it.</h2>
            <p>
              Finance, operations, growth, conference, and enterprise become switchable product packs. The same platform,
              but trimmed to the exact commercial footprint each client wants.
            </p>
          </div>
          <div className="eventhub-pack-grid">
            {addOnPackIds.map((packId) => {
              const pack = PACK_DEFINITIONS[packId];
              return (
                <article key={pack.id} className="eventhub-pack-card">
                  <div className="eventhub-pack-topline">
                    <span>{pack.name}</span>
                    <strong>{pack.pricingPosition}</strong>
                  </div>
                  <p className="eventhub-pack-headline">{pack.headline}</p>
                  <p>{pack.description}</p>
                  <small>{pack.audience}</small>
                </article>
              );
            })}
          </div>
        </section>

        <section className="eventhub-section eventhub-proof-strip">
          <div className="eventhub-proof-copy">
            <p className="eventhub-section-kicker">Commercial Fit</p>
            <h2>Start with Standard. Add packs as clients grow.</h2>
            <p>
              EventHub should feel simple at the front door and powerful under the surface. Sell the core platform first,
              then expand with the exact operating depth a customer is ready to pay for.
            </p>
          </div>
          <div className="eventhub-proof-panel">
            <div>
              <span>Core offer</span>
              <strong>Standard</strong>
            </div>
            <div>
              <span>Add-ons</span>
              <strong>Finance, Ops, Growth</strong>
            </div>
            <div>
              <span>Verticals</span>
              <strong>Conference</strong>
            </div>
            <div>
              <span>Scale</span>
              <strong>Enterprise</strong>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
