import { Link } from 'react-router-dom';
import type { EventRecord, TicketTier, Venue } from '../../lib/domain';

const BANNER_CLASS: Record<string, string> = {
  Festival:   'event-banner-festival',
  Conference: 'event-banner-conference',
  'Club Night': 'event-banner-club',
  Comedy:     'event-banner-comedy',
  Gala:       'event-banner-gala',
  Concert:    'event-banner-concert',
};

interface EventCardProps {
  event: EventRecord;
  venue?: Venue;
  tiers?: TicketTier[];
  featured?: boolean;
}

function formatDate(str: string): string {
  try {
    return new Date(str.replace(' ', 'T')).toLocaleDateString('en-NZ', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return str;
  }
}

export default function EventCard({ event, venue, tiers = [], featured = false }: EventCardProps) {
  const lowestPrice = tiers.length > 0 ? Math.min(...tiers.map((t) => t.price)) : null;
  const bannerClass = BANNER_CLASS[event.category] ?? 'event-banner-default';
  const isLive = event.status === 'live';
  const isSoldOut = event.status === 'sold_out' || tiers.every((t) => t.sold >= t.inventory && tiers.length > 0);

  return (
    <Link to={`/events/${event.id}`} className={`event-card${featured ? ' event-card-featured' : ''}`}>
      <div className={`event-card-banner ${bannerClass}`}>
        <span className="event-card-category">{event.category}</span>
        {isLive && <span className="event-card-live">● Live now</span>}
        {isSoldOut && !isLive && <span className="event-card-soldout">Sold out</span>}
      </div>
      <div className="event-card-body">
        <h3 className="event-card-title">{event.name}</h3>
        <p className="event-card-venue">
          {venue?.name}
          {venue?.city ? <span className="event-card-city"> · {venue.city}</span> : null}
        </p>
        <p className="event-card-date">{formatDate(event.startsAt)}</p>
        {featured && event.description && (
          <p className="event-card-desc">
            {event.description.length > 110
              ? event.description.slice(0, 110) + '…'
              : event.description}
          </p>
        )}
        <div className="event-card-footer">
          <span className="event-card-price">
            {isSoldOut ? 'Sold out' : lowestPrice !== null ? `From $${lowestPrice}` : 'Free'}
          </span>
          <span className="event-card-arrow">→</span>
        </div>
      </div>
    </Link>
  );
}
