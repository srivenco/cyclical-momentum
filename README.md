# Cyclical Momentum Strategy Dashboard

Password-protected investment strategy dashboard for NSE mid/small-cap momentum signals.

## Quick Start

### Backend (local)
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Edit .env — set APP_PASSWORD_HASH and JWT_SECRET
uvicorn main:app --reload --port 8000
```

### Frontend (local)
```bash
cd frontend
npm install
echo "VITE_API_URL=http://localhost:8000" > .env.local
npm run dev
```

### Generate password hash
```bash
python -c "import bcrypt; print(bcrypt.hashpw(b'YOUR_PASSWORD', bcrypt.gensalt()).decode())"
```

## Deployment

### Backend → Render
1. Create account at render.com
2. New → Blueprint → connect this GitHub repo (Render reads `render.yaml` automatically)
3. Set environment variables in Render dashboard for both services:
   - `APP_PASSWORD_HASH` — bcrypt hash of your password
   - `JWT_SECRET` — random 32+ char string
   - `ALLOWED_ORIGIN` — your GitHub Pages URL (e.g. `https://yourusername.github.io`)
4. Cron job is configured in `render.yaml` — runs Mon–Fri at 6:30am IST
5. Note: free tier sleeps after 15min inactivity — first request of the day takes ~30s to wake

### Frontend → GitHub Pages
1. Go to repo Settings → Pages → Source: **GitHub Actions**
2. Add secret: `VITE_API_URL` = your Railway backend URL
3. Push to `main` — GitHub Actions auto-deploys

## Strategy Summary

Four books activated by macro regime:
- **Commodity** (threshold 3x vol) — active when Crude + Copper both above 200MA with volume surge
- **Rate Hike** (2x vol) — active when US10Y 63d change > +20bps
- **Rate Cut** (2x vol) — active when US10Y 63d change < -20bps
- **Defensive** (2x vol) — active when Nifty50 below 200MA

Entry: vol ratio crossover + above MA50 + 5% momentum filter + swing low stop
