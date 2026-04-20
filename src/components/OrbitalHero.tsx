const nodes = [
  {
    name: 'Standard',
    className: 'node-events',
    blurb: 'events, ticketing, orders',
  },
  {
    name: 'Finance',
    className: 'node-sales',
    blurb: 'reconciliation and exports',
  },
  {
    name: 'Operations',
    className: 'node-operations',
    blurb: 'gates, scanners, check-in',
  },
  {
    name: 'Growth',
    className: 'node-tickets',
    blurb: 'campaigns and audience',
  },
  {
    name: 'Conference',
    className: 'node-audience',
    blurb: 'agenda and exhibitors',
  },
  {
    name: 'Enterprise',
    className: 'node-venues',
    blurb: 'integrations and analytics',
  },
];

export default function OrbitalHero() {
  return (
    <div className="orbital-hero" aria-hidden="true">
      <div className="orbital-ring orbital-ring-outer" />
      <div className="orbital-ring orbital-ring-middle" />
      <div className="orbital-ring orbital-ring-inner" />
      <div className="orbital-ring orbital-ring-data" />
      <div className="orbital-axis orbital-axis-vertical" />
      <div className="orbital-axis orbital-axis-horizontal" />
      <div className="orbital-path orbital-path-a" />
      <div className="orbital-path orbital-path-b" />
      <div className="orbital-path orbital-path-c" />

      {nodes.map((node) => (
        <div key={node.name} className={`orbital-node ${node.className}`}>
          <span className="orbital-node-ring" />
          <span className="orbital-node-core" />
          <strong>{node.name}</strong>
          <small>{node.blurb}</small>
        </div>
      ))}

      <div className="orbital-core">
        <span className="orbital-core-pulse pulse-a" />
        <span className="orbital-core-pulse pulse-b" />
        <span className="orbital-core-pulse pulse-c" />
        <div className="orbital-core-disc">
          <p>Core Platform</p>
          <h1>EventHub</h1>
          <span className="orbital-core-status">Start with Standard. Add packs as you grow.</span>
        </div>
      </div>
    </div>
  );
}
