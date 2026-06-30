import { newCheckout, bannerColor, homeLayout } from "../flags";

// Server Component: flags are evaluated on the server via the Vercel Flags SDK,
// which resolves them through @xtandard/flags' OpenFeature provider. The values
// drive the actual UI below — a banner color, a CTA, and a product grid — so a
// Publish from the in-app admin panel (/flags) visibly changes this page.
export default async function Page() {
  const [checkout, color, layout] = await Promise.all([
    newCheckout(),
    bannerColor(),
    homeLayout(),
  ]);

  const columns = layout?.columns ?? 2;
  const products = Array.from({ length: columns * 2 }, (_, i) => `Product ${i + 1}`);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto" }}>
      {/* banner-color (string) actually colors this banner. */}
      <div
        style={{
          background: color,
          color: "#fff",
          padding: "1.25rem 1.5rem",
          borderRadius: 10,
          fontWeight: 600,
        }}
      >
        Acme Store — hero style: <code>{layout?.hero ?? "static"}</code>
      </div>

      <h1>Flags SDK × @xtandard/flags</h1>
      <p>
        Everything below is driven by flags evaluated through the Vercel Flags SDK
        and the <code>@xtandard/flags</code> OpenFeature provider (context:{" "}
        <code>{`{ country: "FR", plan: "beta" }`}</code>).
      </p>

      {/* new-checkout (boolean) toggles which CTA renders. */}
      <p>
        {checkout ? (
          <button
            style={{
              background: "#16a34a",
              color: "#fff",
              border: 0,
              padding: "0.75rem 1.25rem",
              borderRadius: 8,
              fontSize: 16,
              cursor: "pointer",
            }}
          >
            ✨ Try the new one-click checkout
          </button>
        ) : (
          <button
            style={{
              background: "#e5e7eb",
              color: "#111",
              border: 0,
              padding: "0.75rem 1.25rem",
              borderRadius: 8,
              fontSize: 16,
              cursor: "pointer",
            }}
          >
            Proceed to classic checkout
          </button>
        )}
      </p>

      {/* home-layout.columns (json) drives this product grid. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: 12,
        }}
      >
        {products.map((p) => (
          <div
            key={p}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: "1.5rem 1rem",
              textAlign: "center",
            }}
          >
            {p}
          </div>
        ))}
      </div>

      <ul style={{ color: "#666", fontSize: 14, marginTop: "1.5rem" }}>
        <li>
          <strong>new-checkout</strong>: {String(checkout)} (toggles the CTA above)
        </li>
        <li>
          <strong>banner-color</strong>: <code>{color}</code> (colors the banner)
        </li>
        <li>
          <strong>home-layout</strong>: <code>{JSON.stringify(layout)}</code> (sets
          the grid columns)
        </li>
      </ul>

      <hr />
      <p>
        <a href="/flags" style={{ fontWeight: 600 }}>
          Open the admin panel →
        </a>
      </p>
      <p style={{ color: "#666", fontSize: 14 }}>
        Change a flag, click <strong>Publish</strong>, then refresh this page —
        it updates within a couple seconds. First run? <code>bun run seed</code>{" "}
        publishes the demo flags.
      </p>
    </main>
  );
}
