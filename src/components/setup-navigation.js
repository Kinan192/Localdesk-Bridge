const sections = [
  { href: "/setup-center", label: "Setup" },
  { href: "/credential-vault", label: "Credential" },
  { href: "/cloudflare-setup", label: "Cloudflare" },
  { href: "/cloudflare-config", label: "MCP Config" },
  { href: "/oauth-settings", label: "OAuth" },
  { href: "/tunnel-control", label: "Tunnel" },
];

/** Shared local setup navigation: no credentials, no client state or API calls. */
export function SetupNavigation({ current }) {
  return (
    <nav aria-label="Navigasi konfigurasi" className="mb-4 overflow-x-auto rounded-xl border border-slate-700 bg-slate-900/60 p-2">
      <div className="flex min-w-max items-center gap-1">
        {sections.map(item => (
          <a key={item.href} href={item.href}
            aria-current={current === item.href ? "page" : undefined}
            className={"rounded-lg px-3 py-2 text-xs font-medium transition-colors " +
              (current === item.href
                ? "bg-sky-500/15 text-sky-200"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-100")}>
            {item.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
