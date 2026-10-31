import Topbar from "./components/Topbar";
import Dashboard from "./components/Dashboard";

export default function Home() {
  return (
    <main className="shell">
      <Topbar />
      <Dashboard />
      <p className="notice">
        Unofficial community tool. Not affiliated with or endorsed by Squeekchain.
        Sepolia testnet only. Data comes from the public Squeekchain API and refreshes about once a minute.
      </p>
    </main>
  );
}