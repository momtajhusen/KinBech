# KinBech API — VPS Deploy

| Item | Value |
|------|--------|
| Domain | https://kinbechapi.codersalpha.com |
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

## Notes

- Folder spelling on VPS: `kinbech_backen` (missing `d`).
- DNS A record must be `148.230.67.252` — Hostinger Website/AAAA remove karo warna 403.
- Atlas error `find on KinBech.users` → MongoDB Atlas user ko `readWrite` do.
