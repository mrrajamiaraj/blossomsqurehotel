/** Shown while an admin page's data loads: the page's shape, not a spinner. */
export default function Loading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }} aria-busy="true" aria-label="Loading">
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span className="a-skel" style={{ width: 140, height: 12 }} />
        <span className="a-skel" style={{ width: 280, height: 34 }} />
      </div>
      <div className="a-skel" style={{ height: 104 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
        <div className="a-skel" style={{ height: 260 }} />
        <div className="a-skel" style={{ height: 260 }} />
      </div>
    </div>
  );
}
