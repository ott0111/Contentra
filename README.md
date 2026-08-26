# Contentra

Contentra is a creator-focused content growth platform built with Next.js, TypeScript, Tailwind CSS, and Supabase.

## Phase 1

The foundation includes the Next.js App Router setup, black and purple design tokens, responsive dashboard shell, empty-state metrics, navigation, and a Supabase profile migration with Row Level Security.

## Getting Started

Run the development server:

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


You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!
Copy `.env.example` to `.env.local`, add the Supabase URL, anon key, service role key, and OpenAI key. Apply `supabase/migrations/001_phase1_foundation.sql` followed by `supabase/migrations/002_phase8_production.sql` in the Supabase SQL editor. Never expose the service role key.

For PayPal sandbox billing, follow [SETUP.md](SETUP.md) and provide the sandbox application credentials, plan IDs, and webhook ID.
## Deploy on Vercel
Validate the project with:
The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.
```bash
npm run lint
npm run build
```
Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
Later phases are intentionally not implemented yet.
