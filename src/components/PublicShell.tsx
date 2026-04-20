import { Link, NavLink, Outlet } from 'react-router-dom';

export default function PublicShell() {
  return (
    <div className="pub-shell">
      <nav className="pub-nav">
        <div className="pub-nav-inner">
          <Link to="/" className="pub-nav-logo">
            EventHub
          </Link>
          <div className="pub-nav-links">
            <NavLink
              to="/events"
              className={({ isActive }) =>
                isActive ? 'pub-nav-link pub-nav-link-active' : 'pub-nav-link'
              }
            >
              Events
            </NavLink>
            <NavLink
              to="/account"
              className={({ isActive }) =>
                isActive ? 'pub-nav-link pub-nav-link-active' : 'pub-nav-link'
              }
            >
              My tickets
            </NavLink>
          </div>
          <div className="pub-nav-actions">
            <Link to="/app" className="pub-nav-signin">Organiser login</Link>
            <Link to="/events" className="pub-nav-cta">Browse events</Link>
          </div>
        </div>
      </nav>

      <main className="pub-main">
        <Outlet />
      </main>

      <footer className="pub-footer">
        <div className="pub-footer-inner">
          <div className="pub-footer-brand">
            <span className="pub-footer-logo">EventHub</span>
            <p>Premium event experiences across Aotearoa New Zealand.</p>
          </div>
          <div className="pub-footer-cols">
            <div className="pub-footer-col">
              <strong>Discover</strong>
              <Link to="/events">All events</Link>
              <Link to="/events?category=Festival">Festivals</Link>
              <Link to="/events?category=Conference">Conferences</Link>
              <Link to="/events?category=Club+Night">Club nights</Link>
              <Link to="/account">My tickets</Link>
            </div>
            <div className="pub-footer-col">
              <strong>Platform</strong>
              <Link to="/app">Organiser login</Link>
              <Link to="/app/settings">Settings</Link>
            </div>
          </div>
        </div>
        <div className="pub-footer-bar">
          <p>&copy; {new Date().getFullYear()} EventHub Pacific. All rights reserved.</p>
          <p className="pub-footer-tagline">The professional event operations platform.</p>
        </div>
      </footer>
    </div>
  );
}
