/** @type {import('next').NextConfig} */
const nextConfig = {
  // @xtandard/flags ships prebuilt ESM in dist/ and reads its bundled admin SPA
  // from disk via `import.meta.url`. Keep it external so Next loads it through
  // Node's resolver at runtime instead of trying to bundle it (which can't
  // statically resolve the `new URL("./ui", …)` asset lookup).
  serverExternalPackages: ["@xtandard/flags"],

  // Belt-and-braces for the server bundle: mark the package (and its subpath
  // exports) as a true external so webpack never parses dist/ at all. Without
  // this, the `new URL("./ui", import.meta.url)` inside the package trips
  // webpack's static asset resolver.
  webpack: (config, { isServer }) => {
    if (isServer) {
      const externals = config.externals ?? [];
      config.externals = [
        ...(Array.isArray(externals) ? externals : [externals]),
        ({ request }, callback) => {
          if (request === "@xtandard/flags" || request?.startsWith("@xtandard/flags/")) {
            return callback(null, "module " + request);
          }
          callback();
        },
      ];
    }
    return config;
  },
};
export default nextConfig;
