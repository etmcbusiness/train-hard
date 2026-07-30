# food-search proxy — deployment

Why this exists: FatSecret's OAuth2 credentials are IP-restricted (their
dashboard allows up to 15 whitelisted IPs). Serverless/edge platforms
(Supabase Edge Functions, Cloudflare Workers) don't have a fixed egress IP,
so FatSecret rejects calls from them. This is a tiny always-on proxy meant
to run on a real VM with a static IP — Oracle Cloud's Always Free tier is a
genuinely free way to get one.

## 1. Create the VM

1. Sign up at [cloud.oracle.com](https://cloud.oracle.com) (free tier, no
   charge unless you explicitly upgrade).
2. Create a Compute instance: **Always Free eligible** shape (either the
   `VM.Standard.E2.1.Micro` or an `Ampere A1` shape — both are free), image
   **Ubuntu 22.04**.
3. When it's created, note its **public IPv4 address** — this stays fixed
   for the life of the instance.
4. Open ports 80 and 443:
   - In the OCI console: your instance's **Subnet → Security Lists →
     Ingress Rules** → add rules allowing TCP 80 and 443 from `0.0.0.0/0`.
   - On the VM itself (Oracle's Ubuntu images ship with a restrictive
     iptables config by default):
     ```
     sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
     sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
     sudo netfilter-persistent save
     ```

## 2. Whitelist the IP with FatSecret

In FatSecret's developer dashboard, under your app's **IP Restrictions**,
add the VM's public IP. Their docs say changes can take **up to 24 hours**
to take effect — do this early.

## 3. Install Deno and Caddy on the VM

```
curl -fsSL https://deno.land/install.sh | sh
sudo apt update && sudo apt install -y caddy
```
(If `apt install caddy` isn't available, follow Caddy's official install
instructions for Ubuntu at caddyserver.com/docs/install.)

## 4. Upload the files

Copy `main.ts`, `food-search.service`, and `Caddyfile` from this folder to
the VM (e.g. `scp` them to `/home/ubuntu/food-search/`).

Create `/home/ubuntu/food-search/.env` from `.env.example` and fill in:
```
FATSECRET_CLIENT_ID=<your client id>
FATSECRET_CLIENT_SECRET=<your client secret>
FOOD_SEARCH_SHARED_SECRET=94ca97c863544faf8c50c0dbcb9470f7b1fce6ff2ed847e798466fb7a2d87d6e
PORT=8787
```

Edit `Caddyfile`, replacing `YOUR-IP-WITH-DASHES` with the VM's public IP
written with dashes instead of dots (e.g. `152.67.12.34` → `152-67-12-34`),
then copy it to `/etc/caddy/Caddyfile`.

## 5. Start everything

```
sudo cp /home/ubuntu/food-search/food-search.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now food-search
sudo systemctl restart caddy
```

## 6. Verify

```
curl "https://152-67-12-34.nip.io/?q=cheese%20pizza" -H "x-app-secret: 94ca97c863544faf8c50c0dbcb9470f7b1fce6ff2ed847e798466fb7a2d87d6e"
```
Should return FatSecret JSON results, not an error.

## 7. Point the app at it

In `eat-plenty.html`, set `FOOD_SEARCH_URL` to
`https://152-67-12-34.nip.io` (your actual nip.io hostname).

## Cleanup (optional)

The Supabase Edge Function from the earlier attempt (`food-search`) can be
deleted from the Supabase dashboard — it's dead weight now, harmless but
unused.
