# KinBech API — VPS Deploy

| Item | Value |
|------|--------|
| Domain | https://kinbechapi.codersalpha.com (primary) |
| Alias (old apps) | https://kinbech-api.codersalpha.com — DNS + nginx `server_name` + cert SAN |
| VPS path | `/home/ubuntu/Momtaj_Projects/kinbech_backen/Backend` |
| PM2 name | `kinbech-backend` |
| Port | `5001` |
| Nginx `proxy_pass` | `http://127.0.0.1:5001` |
| Package manager | `npm` |

## Deploy (one shot)

```bash
cd /home/ubuntu/Momtaj_Projects/kinbech_backen/Backend
git pull origin main
npm install --omit=dev
pm2 restart kinbech-backend --update-env
pm2 save
curl -s http://127.0.0.1:5001/categories | head -c 200
curl -sk https://kinbechapi.codersalpha.com/categories | head -c 200
```

Expect: JSON with `"categories":[...]`

## Important routes (no `/api` prefix)

```
GET  /categories
GET  /listings
GET  /shops
GET  /sellers
POST /auth/login
POST /auth/signup
```

## Useful

```bash
pm2 logs kinbech-backend --lines 50 --nostream
grep proxy_pass /etc/nginx/sites-available/kinbechapi.codersalpha.com
```

## Website + Mobile API host

Clients previously used **`kinbech-api`** (hyphen). Live nginx is **`kinbechapi`** (no hyphen).

After pull, rebuild website with `Website/.env.production` → `https://kinbechapi.codersalpha.com`.
Old store apps still call `kinbech-api` — restore alias:

```bash
# Hostinger DNS: A  kinbech-api  →  148.230.67.252

# VPS — add both names (adjust path if your site file differs)
grep server_name /etc/nginx/sites-enabled/*kinbech*
sudo sed -i 's/server_name kinbechapi\.codersalpha\.com;/server_name kinbechapi.codersalpha.com kinbech-api.codersalpha.com;/g' /etc/nginx/sites-enabled/kinbechapi*
sudo certbot --nginx -d kinbechapi.codersalpha.com -d kinbech-api.codersalpha.com --expand
sudo nginx -t && sudo systemctl reload nginx
curl -sS https://kinbechapi.codersalpha.com/health
curl -sS https://kinbech-api.codersalpha.com/health
```

## Notes

- Folder spelling on VPS: `kinbech_backen` (missing `d`).
- DNS A record must be `148.230.67.252` — Hostinger Website/AAAA remove karo warna 403.
- Atlas error `find on KinBech.users` → MongoDB Atlas user ko `readWrite` do.
- Website live: `https://kinbech.codersalpha.com` (Hostinger). Storefront also `https://kinbech.app`.

## Monitoring (Sentry + Admin Error Log)

1. Create a free Sentry project (Node) at https://sentry.io → copy DSN.
2. On VPS `Backend/.env` add:

```bash
SENTRY_DSN=https://xxxx@o000.ingest.sentry.io/0000
SENTRY_RELEASE=kinbech-api@1.0.0
NODE_ENV=production
```

3. Install deps & restart:

```bash
cd /home/ubuntu/Momtaj_Projects/kinbech_backen/Backend
npm install --omit=dev
pm2 restart kinbech-backend --update-env
```

4. Admin Console → **Trust & Safety → Error Log**  
   Shows stack, route, user, severity, occurrence count, developer hint.  
   Server 5xx + Mobile/Website crashes land here even without Sentry.  
   With `SENTRY_DSN`, the same events also alert the Sentry team inbox/Slack.

## Auto-scaling (traffic)

### Near-term (current single VPS)

Use PM2 **cluster mode** so Node uses all CPU cores behind nginx:

```bash
cd /home/ubuntu/Momtaj_Projects/kinbech_backen/Backend
pm2 delete kinbech-backend
pm2 start ecosystem.config.cjs --env production
# pin instance count if needed:
PM2_INSTANCES=2 pm2 start ecosystem.config.cjs --env production
pm2 save
```

Scale under load:

```bash
pm2 scale kinbech-backend 4
pm2 logs kinbech-backend --lines 80 --nostream
```

Watch CPU/RAM (`htop`). If RAM > ~80% or latency spikes → bump VPS plan (vertical) or add instances carefully (uploads are local disk — keep sticky if needed).

### Next step (true cloud auto-scale)

Before multi-VPS / App Platform / ECS:

1. Move `/uploads` to S3/R2 + CDN (shared storage).
2. Keep MongoDB on Atlas (already managed).
3. Put 2+ API nodes behind a load balancer (DigitalOcean LB / Cloudflare / nginx upstream).
4. Enable platform autoscaling on CPU > 70% (DO App Platform, Render, Railway, or AWS ECS).

Until uploads leave the VPS, prefer **PM2 cluster + larger droplet** over multi-machine scale.