# Print Orders

Send PDFs and images to a print shop with a quantity, a note and an optional deadline. The
shop marks each order Pending, Ongoing or Ready, records how many copies are printed and
whether the order is paid, and adds photos of the finished work. The shop page warns when
an unfinished order is within 24 hours of its deadline or past it. Both sides can preview
PDFs in the page and chat about each order, and the customer's page updates within 5
seconds.

Orders the shop marks Ready leave the main list and move to History. They can still be
changed there: the shop can set them back to Ongoing or Pending, and if the customer edits
a Ready order it goes back to Ongoing.

When the customer uploads a new design, the shop gets an SMS through text.lk. Only one SMS
is sent every 5 hours, so uploads inside that gap don't send another. Set
`TEXTLK_API_TOKEN`, `SMS_TO`, `SMS_SENDER_ID` and `SMS_GAP_HOURS` (see `.env.example`);
with no token, no SMS is sent.

Built with Next.js and SQLite. Everything is stored in the `data/` folder:

- `data/app.db`: the orders database
- `data/uploads/`: the uploaded files, which only logged-in users can open

## Run on your computer

```bash
npm install
npm run dev
```

Open http://localhost:3000. The passwords are in `.env`: `CUSTOMER_PASSWORD` opens the
upload page and `SHOP_PASSWORD` opens the shop page. If `.env` is missing, copy
`.env.example` to `.env` and fill it in.

## Deploy to a Hostinger Node.js Web App (zip upload)

Upload `print-orders.zip` in hPanel under Websites → Add Website → Node.js web app, then use:

- Node.js version: 22
- Build command: `npm run build`
- Output directory: `.next`
- Entry file: `server.js`
- Environment variables: import `hostinger.env`

Keep `DATA_DIR=~/print-orders-data`. Each deploy creates a new build folder, so `DATA_DIR`
must stay outside the app or orders and files can be lost on redeploy.

## Deploy to a Hostinger VPS (Ubuntu)

Replace `YOUR_VPS_IP` and `example.com` below. Point the domain's A record at the VPS IP first.

### 1. Install the tools (on the VPS, once)

```bash
ssh root@YOUR_VPS_IP
apt update && apt install -y nginx build-essential python3 certbot python3-certbot-nginx rsync
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
npm install -g pm2
mkdir -p /var/www/print-orders
```

### 2. Upload the code (on your Mac)

Run this from the project folder. It skips `data/` and `.env`, so it never touches live orders.

```bash
rsync -az --exclude node_modules --exclude .next --exclude data --exclude .env \
  ./ root@YOUR_VPS_IP:/var/www/print-orders/
```

### 3. Create the passwords (on the VPS, once)

```bash
cd /var/www/print-orders
{
  echo "CUSTOMER_PASSWORD=$(openssl rand -hex 8)"
  echo "SHOP_PASSWORD=$(openssl rand -hex 8)"
  echo "AUTH_SECRET=$(openssl rand -hex 32)"
} > .env
chmod 600 .env
cat .env   # note the two passwords
```

### 4. Build and start

```bash
npm ci
npm run build
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # run the command it prints, so the app starts after a reboot
```

### 5. Set up nginx and HTTPS

```bash
cp deploy/print-proxy.conf /etc/nginx/snippets/print-proxy.conf
cp deploy/nginx.conf /etc/nginx/sites-available/print-orders
sed -i 's/example.com/YOUR_DOMAIN/' /etc/nginx/sites-available/print-orders
ln -s /etc/nginx/sites-available/print-orders /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
certbot --nginx -d YOUR_DOMAIN
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable
```

Use HTTPS. Without it, passwords and files travel over the network unencrypted.

## Update the app

Run the rsync command from step 2, then on the VPS:

```bash
cd /var/www/print-orders && npm ci && npm run build && pm2 restart print-orders
```

## Back up

Run this on the VPS, then copy the archive somewhere else:

```bash
cd /var/www/print-orders
sqlite3 data/app.db ".backup data/backup.db"   # needs: apt install sqlite3
tar czf ~/print-orders-$(date +%F).tar.gz data/backup.db data/uploads
rm data/backup.db
```
