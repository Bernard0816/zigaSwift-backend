# VeriFly Website + Backend (Fullstack MVP Landing)

Includes:
- Responsive single-page site (HTML/CSS/JS)
- Node/Express backend
- SQLite database storage for waitlist + courier applications
- Confirmation emails via SMTP (Nodemailer)
- SEO + social preview meta tags
- Analytics placeholders (Plausible / GA4)

## Run locally
1) Install Node.js 18+
2) Install deps:
```bash
npm install
```
3) Configure env:
- Copy `.env.example` to `.env`
- Fill SMTP creds (optional; submissions still work without emails)
4) Start:
```bash
npm run dev
```
Open http://localhost:3000

## Deploy notes (quick)
- Replace `https://verifly.example/` in `public/index.html` with your real domain.
- Add `logo.png` and `og-image.png` to `/public` if you want social preview images.
- For production, consider Postgres instead of SQLite.
- Restrict CORS to your domain.

## Domain setup (fast)
- Buy domain (Namecheap/Cloudflare/etc.)
- Point DNS to your host (Vercel/Netlify/Render)
- Enable SSL
- Update canonical/OG tags to your domain
