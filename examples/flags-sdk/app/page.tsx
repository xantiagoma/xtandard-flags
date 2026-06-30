import { newCheckout, bannerColor, homeLayout } from "../flags";

// Server Component: flags are evaluated on the server via the Vercel Flags SDK,
// which resolves them through @xtandard/flags' OpenFeature provider.
export default async function Page() {
  const [checkout, color, layout] = await Promise.all([newCheckout(), bannerColor(), homeLayout()]);

  return (
    <main style={{ maxWidth: 640 }}>
      <h1>Flags SDK × @xtandard/flags</h1>
      <p>
        These values come from the Vercel Flags SDK, resolved through the
        <code> @xtandard/flags </code> OpenFeature provider (context:{" "}
        <code>{`{ country: "FR", plan: "beta" }`}</code>).
      </p>
      <ul>
        <li>
          <strong>new-checkout</strong>: {String(checkout)}
        </li>
        <li>
          <strong>banner-color</strong>:{" "}
          <span style={{ background: color, color: "#fff", padding: "2px 8px", borderRadius: 4 }}>
            {color}
          </span>
        </li>
        <li>
          <strong>home-layout</strong>: <code>{JSON.stringify(layout)}</code>
        </li>
      </ul>
      <p style={{ color: "#666", fontSize: 14 }}>
        Run <code>bun run seed</code> first to publish these flags, then <code>bun run dev</code>.
      </p>
    </main>
  );
}
