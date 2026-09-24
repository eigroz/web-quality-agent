This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.


## Live Cloudflare preview

The live preview belongs to the separate **Site Journey Analyser** Cloudflare account.
Its account ID is pinned in wrangler.jsonc so deployment does not select Dubai ExPutts.

- Run npm ci, then npm run cf:typegen after changing bindings.
- Run npm run dev for the original Next.js development server (local Playwright browser).
- Run npm run dev:vinext for the Cloudflare development server.
- Run npm test and npm run lint before publishing.
- Run npm run deploy:preview to build and update the live preview in Cloudflare.
- Authenticate through wrangler login if the CLI does not have access to this account.

Cloudflare builds use vinext and @cloudflare/playwright with a BROWSER binding.
The Vite alias selects the hosted browser implementation; Next.js retains its local browser implementation.
No API tokens belong in source files. The Cloudflare account has independent plans and browser quotas.
The preview is public. robots.txt disallows all crawling, and metadata plus X-Robots-Tag discourage indexing.
These are crawler instructions, not access control. No paid plan is enabled by this setup.

The country selector contains the 49 options from the supplied reMarkable page source, including territories and markets without a webshop.
Country changes retain the product/page path, query and fragment and change the market prefix.
The configuration is a snapshot, not a live catalogue; browser language/timezone do not change the caller's IP address.
