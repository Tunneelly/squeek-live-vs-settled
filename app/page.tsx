import Topbar from "./components/Topbar";

export default function Home() {
  return (
    <main className="shell">
      <Topbar />
      <div className="grid grid-2">
        <section className="card">
          <div className="tag live">Live</div>
          <div className="stat live">&mdash; &mdash; &mdash;</div>
          <div className="muted">Work counted on the device</div>
        </section>
        <section className="card">
          <div className="tag settled">Settled</div>
          <div className="stat settled">&mdash; &mdash; &mdash;</div>
          <div className="muted">Work certified on Ethereum</div>
        </section>
      </div>
      <section className="dotpanel" style={{ marginTop: 16 }}>
        <div className="eyebrow">Block progress</div>
        <div className="bar" style={{ marginTop: 12 }}>
          <span style={{ width: "42%" }} />
        </div>
      </section>
      <p className="notice">
        Unofficial community tool. Not affiliated with or endorsed by Squeekchain.
        Sepolia testnet only.
      </p>
    </main>
  );
}