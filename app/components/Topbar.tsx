import Image from "next/image";

export default function Topbar() {
  return (
    <header className="topbar">
      <a className="brand" href="/">
        <Image src="/logo.svg" alt="" width={36} height={36} priority />
        <div>
          <div className="brand-name gradient-text">Live vs Settled</div>
          <div className="brand-sub">Unofficial &middot; Squeekchain</div>
        </div>
      </a>
      <span className="pill">Sepolia</span>
    </header>
  );
}