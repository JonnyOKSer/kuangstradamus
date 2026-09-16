# Kuangstradamus 诺查丹玛斯

A fantasy football trade commissioner with a taste for proverbs, growing into a full league analyst.

- `kuang-backend/` — Express API (Railway). Trade valuation, Sleeper league import, season analytics, lineup optimizer. Free data only. See its README for endpoints.
- `kuang-frontend/` — Next.js static site (Netlify, kuangstradamus.xyz). Trade chat + league dashboard.
- `docs/REVIEW-AND-ROADMAP.md` — project review, data-source research, and the roadmap / backlog.

## Local development

```bash
# terminal 1
cd kuang-backend && npm install && npm run dev          # http://localhost:3000

# terminal 2
cd kuang-frontend && npm install && NEXT_PUBLIC_API_URL=http://localhost:3000 npm run dev
```
