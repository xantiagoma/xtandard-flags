/** Vite `?raw` imports (inlined as strings in both the SPA and the embed builds). */
declare module "*.svg?raw" {
  const content: string;
  export default content;
}
