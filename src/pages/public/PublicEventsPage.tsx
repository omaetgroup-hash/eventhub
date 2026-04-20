import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePlatform } from '../../lib/platform';
import EventCard from '../../components/ui/EventCard';

const PUBLIC_STATUSES = new Set(['on_sale', 'live', 'sold_out']);
const CATEGORIES = ['Festival', 'Conference', 'Club Night', 'Comedy', 'Gala', 'Concert'];
const CITIES = ['Auckland', 'Wellington', 'Christchurch', 'Dunedin'];
const PRICE_RANGES = [
  { label: 'Any price', value: '' },
  { label: 'Under $50', value: '0-50' },
  { label: '$50 – $100', value: '50-100' },
  { label: '$100 – $200', value: '100-200' },
  { label: '$200+', value: '200-999999' },
];

export default function PublicEventsPage() {
  const { state } = usePlatform();
  const [params, setParams] = useSearchParams();

  const q        = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const city     = params.get('city') ?? '';
  const price    = params.get('price') ?? '';

  function setParam(key: string, value: string) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  }

  function clearFilters() {
    setParams({});
  }

  const hasFilters = q || category || city || price;

  const publicEvents = useMemo(
    () => state.events.filter((e) => PUBLIC_STATUSES.has(e.status)),
    [state.events]
  );

  const featured = useMemo(
    () => [...publicEvents].sort((a, b) => b.ticketsSold - a.ticketsSold).slice(0, 3),
    [publicEvents]
  );

  const filtered = useMemo(() => {
    let list = publicEvents;

    if (q) {
      const lq = q.toLowerCase();
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(lq) ||
          e.category.toLowerCase().includes(lq) ||
          (e.description ?? '').toLowerCase().includes(lq)
      );
    }

    if (category) list = list.filter((e) => e.category === category);

    if (city) {
      list = list.filter((e) => {
        const venue = state.venues.find((v) => v.id === e.venueId);
        return venue?.city === city;
      });
    }

    if (price) {
      const [min, max] = price.split('-').map(Number);
      list = list.filter((e) => {
        const tiers = state.ticketTiers.filter((t) => t.eventId === e.id);
        if (tiers.length === 0) return true;
        const lowest = Math.min(...tiers.map((t) => t.price));
        return lowest >= min && lowest <= max;
      });
    }

    return list;
  }, [publicEvents, q, category, city, price, state.venues, state.ticketTiers]);

  const upcoming = useMemo(
    () =>
      publicEvents
        .filter((e) => e.status === 'on_sale')
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
        .slice(0, 6),
    [publicEvents]
  );

  return (
    <div className="pub-events-page">
      {/* Search hero */}
      <section className="pub-search-hero">
        <div className="pub-search-hero-inner">
          <p className="pub-hero-kicker">Discover your next experience</p>
          <h1 className="pub-hero-title">Events across Aotearoa</h1>
          <div className="pub-search-bar">
            <input
              className="pub-search-input"
              type="search"
              placeholder="Search events, artists, venues…"
              value={q}
              onChange={(e) => setParam('q', e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* Featured events — only when no filters active */}
      {!hasFilters && (
        <section className="pub-section">
          <div className="pub-section-header">
            <h2>Featured events</h2>
            <p>The biggest events on right now</p>
          </div>
          <div className="pub-featured-grid">
            {featured.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                venue={state.venues.find((v) => v.id === event.venueId)}
                tiers={state.ticketTiers.filter((t) => t.eventId === event.id)}
                featured
              />
            ))}
          </div>
        </section>
      )}

      {/* Filter bar */}
      <section className="pub-section pub-section-tight">
        <div className="pub-filter-bar">
          <div className="pub-filter-group">
            <label className="pub-filter-label">Category</label>
            <div className="pub-filter-chips">
              <button
                className={`pub-filter-chip${!category ? ' pub-filter-chip-active' : ''}`}
                onClick={() => setParam('category', '')}
              >
                All
              </button>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  className={`pub-filter-chip${category === cat ? ' pub-filter-chip-active' : ''}`}
                  onClick={() => setParam('category', category === cat ? '' : cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="pub-filter-selects">
            <select
              className="pub-filter-select"
              value={city}
              onChange={(e) => setParam('city', e.target.value)}
            >
              <option value="">Any city</option>
              {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>

            <select
              className="pub-filter-select"
              value={price}
              onChange={(e) => setParam('price', e.target.value)}
            >
              {PRICE_RANGES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>

            {hasFilters && (
              <button className="pub-filter-clear" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Upcoming events — only when no filters active */}
      {!hasFilters && (
        <section className="pub-section">
          <div className="pub-section-header">
            <h2>Coming up</h2>
            <p>On sale now — reserve your spot</p>
          </div>
          <div className="pub-event-grid">
            {upcoming.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                venue={state.venues.find((v) => v.id === event.venueId)}
                tiers={state.ticketTiers.filter((t) => t.eventId === event.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Filtered results */}
      {hasFilters && (
        <section className="pub-section">
          <div className="pub-section-header">
            <h2>
              {filtered.length} event{filtered.length !== 1 ? 's' : ''} found
            </h2>
            {hasFilters && (
              <button className="pub-link-btn" onClick={clearFilters}>
                Clear all filters
              </button>
            )}
          </div>
          {filtered.length === 0 ? (
            <div className="pub-empty-state">
              <p>No events match your filters.</p>
              <button className="pub-link-btn" onClick={clearFilters}>Browse all events</button>
            </div>
          ) : (
            <div className="pub-event-grid">
              {filtered.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  venue={state.venues.find((v) => v.id === event.venueId)}
                  tiers={state.ticketTiers.filter((t) => t.eventId === event.id)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Trending by category — only when no filters */}
      {!hasFilters && (
        <section className="pub-section pub-section-trending">
          <div className="pub-section-header">
            <h2>Browse by type</h2>
          </div>
          <div className="pub-category-grid">
            {CATEGORIES.map((cat) => {
              const count = publicEvents.filter((e) => e.category === cat).length;
              if (count === 0) return null;
              return (
                <Link
                  key={cat}
                  to={`/events?category=${encodeURIComponent(cat)}`}
                  className={`pub-category-tile pub-cat-${cat.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <strong>{cat}</strong>
                  <span>{count} event{count !== 1 ? 's' : ''}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
