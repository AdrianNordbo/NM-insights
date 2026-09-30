# NM Insights – dashboard (web/)

Next.js (App Router) som leser schema `dashboard` i Supabase som `authenticated`.
Se CLAUDE.md i rotmappen for datalag, rettighetsmodell og frontend-regler.

## Lokalt

```
cp .env.example .env.local   # fyll inn verdiene
npm install
npm run dev                  # http://localhost:3000
```

## Regler

- Bare publishable-nøkkelen. Supabase-nøkkelen med full tilgang skal aldri inn i `web/`;
  `npm run check:secrets` (kjøres automatisk før build) stopper bygget hvis den finnes.
- Frontend leser bare fra schema `dashboard`.
- Hosting: Vercel, funksjonsregion `dub1` (Dublin, samme sted som Supabase eu-west-1).
