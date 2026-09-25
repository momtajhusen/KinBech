==========================================================
KINBECH — VPS COMMANDS (step by step)
==========================================================

====================================
1) SERVER LOGIN
====================================

ssh root@148.230.67.252

Password:
# Set locally only — never commit real passwords.
# export VPS_SSH_PASSWORD='…'   or use SSH keys (recommended)

====================================
2) PROJECT FACTS
====================================

Domain:     https://kinbechapi.codersalpha.com   (primary, no hyphen)
Alias:      https://kinbech-api.codersalpha.com  (old apps — DNS+nginx needed)
Website:    https://kinbech.codersalpha.com      (Hostinger)
Storefront: https://kinbech.app
VPS path:   /home/ubuntu/Momtaj_Projects/kinbech_backen/Backend
            (folder spelling: kinbech_backen — missing "d")
PM2 name:   kinbech-backend
Port:       5001
Nginx:      proxy_pass http://127.0.0.1:5001;
Pkg:        npm
Routes:     NO /api prefix (e.g. /health, /categories, /listings)

====================================
3) PROJECT DIRECTORY
====================================

cd /home/ubuntu/Momtaj_Projects/kinbech_backen/Backend

pwd
ls -la

====================================
4) PM2 (APP MANAGEMENT)
====================================

pm2 status

pm2 logs kinbech-backend --lines 100

pm2 monit

pm2 restart kinbech-backend --update-env

pm2 reload kinbech-backend

pm2 stop kinbech-backend

pm2 start src/server.js --name kinbech-backend

pm2 delete kinbech-backend

pm2 flush

pm2 save

pm2 startup

====================================
5) GIT DEPLOYMENT
====================================

git branch
git status
git log -1
git log --oneline -5

git pull origin main

# Full deployment (one shot)
cd /home/ubuntu/Momtaj_Projects/kinbech_backen/Backend
git pull origin main
npm install --omit=dev
pm2 restart kinbech-backend --update-env
pm2 save

# One line
git pull origin main && npm install --omit=dev && pm2 restart kinbech-backend --update-env && pm2 save

====================================
6) NODE / NPM
====================================

node -v
npm -v
npm install
npm install --omit=dev

====================================
7) ENV FILE
====================================

cat .env
nano .env
# Save: CTRL+O | Exit: CTRL+X

# Useful keys:
# PORT=5001
# MONGODB_URI=...
# JWT_SECRET=...
# UPLOADS_DIR=/var/kinbech/uploads   (keep media outside git)

====================================
8) BACKEND HEALTH
====================================

curl -s http://127.0.0.1:5001/health
curl -sk https://kinbechapi.codersalpha.com/health

# Expect: {"ok":true,"service":"kinbech-api"}

curl -s http://127.0.0.1:5001/categories | head -c 200
curl -sk https://kinbechapi.codersalpha.com/categories | head -c 200

# Important routes (no /api prefix):
# GET  /health
# GET  /categories
# GET  /listings
# GET  /shops
# GET  /sellers
# POST /auth/login
# POST /auth/signup

====================================
9) PORT CHECK
====================================

sudo ss -tulpn | grep :80
sudo ss -tulpn | grep :443
sudo ss -tulpn | grep :5001

====================================
10) NGINX
====================================

sudo systemctl status nginx
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl restart nginx

grep -n "server_name\|proxy_pass\|listen" /etc/nginx/sites-available/kinbechapi.codersalpha.com
grep -n "server_name\|proxy_pass\|listen" /etc/nginx/sites-enabled/*kinbech* 2>/dev/null

# proxy_pass must be: http://127.0.0.1:5001;

====================================
11) SSL + OLD ALIAS (kinbech-api)
====================================

sudo certbot certificates
sudo certbot renew
sudo certbot renew --dry-run

# Primary only
sudo certbot --nginx -d kinbechapi.codersalpha.com

# Primary + old hyphen alias (after Hostinger A record):
# Hostinger DNS: A  kinbech-api  →  148.230.67.252
grep server_name /etc/nginx/sites-enabled/*kinbech*
# Ensure server_name includes BOTH:
#   kinbechapi.codersalpha.com kinbech-api.codersalpha.com
sudo certbot --nginx -d kinbechapi.codersalpha.com -d kinbech-api.codersalpha.com --expand
sudo nginx -t && sudo systemctl reload nginx
curl -sS https://kinbechapi.codersalpha.com/health
curl -sS https://kinbech-api.codersalpha.com/health

sudo systemctl status certbot.timer
sudo systemctl enable certbot.timer

openssl s_client -connect kinbechapi.codersalpha.com:443 -servername kinbechapi.codersalpha.com </dev/null 2>/dev/null | openssl x509 -noout -dates -subject

====================================
12) SERVER / FIREWALL
====================================

date
timedatectl status
df -h
free -h
uptime
sudo ufw status

====================================
13) PROJECT-ONLY COMMANDS (KinBech)
====================================

# Seed admin user
npm run seed:admin
# Default (if unchanged): admin@kinbech.com

# Uploads dir (outside repo so git pull never deletes media)
ls -la /var/kinbech/uploads 2>/dev/null || ls -la uploads 2>/dev/null

# Mongo Atlas tip: user needs readWrite on KinBech DB
# (error "find on KinBech.users" = missing permissions)

====================================
14) QUICK DEPLOY (LIVE)
====================================

# Full guide: VPS_DEPLOY.md

cd /home/ubuntu/Momtaj_Projects/kinbech_backen/Backend
git pull origin main
npm install --omit=dev
pm2 restart kinbech-backend --update-env
pm2 save
pm2 logs kinbech-backend --lines 50 --nostream

curl -s http://127.0.0.1:5001/health
curl -sk https://kinbechapi.codersalpha.com/health
curl -s http://127.0.0.1:5001/categories | head -c 200

====================================
15) WEBSITE + MOBILE (your Mac — not on VPS)
====================================

# Website production build → Hostinger
cd Website
npm run build
# Upload Website/dist/ → kinbech.codersalpha.com / kinbech.app
# .env.production: VITE_API_URL=https://kinbechapi.codersalpha.com

# Mobile release APK (EAS — need login: eas login)
cd Mobile
npm run build:apk
# eas.json production EXPO_PUBLIC_API_URL=https://kinbechapi.codersalpha.com

# Or local release APK (needs JDK + Android SDK + disk space)
# cd Mobile/android && ./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/

====================================
16) BROWSER URLS
====================================

https://kinbechapi.codersalpha.com/health
https://kinbechapi.codersalpha.com/categories
https://kinbech.codersalpha.com
https://kinbech.app

==========================================================
