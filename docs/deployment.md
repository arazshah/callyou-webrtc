# Deployment on Ubuntu

Create `A` records for `callyou.ir` and `turn.callyou.ir` pointing to the VPS. Add `AAAA` only with working routed IPv6. Install current Docker Engine/Compose from Docker's official apt repository. Clone the app under a non-root deployment account.

Copy `.env.example` to `.env`, run `chmod 600 .env`, set production URLs/public IP, and generate independent secrets using `openssl rand -base64 48`. PostgreSQL passwords must be URL-encoded in `DATABASE_URL`. Start with:

```bash
docker compose -f docker-compose.production.yml up -d --build
docker compose -f docker-compose.production.yml ps
docker compose -f docker-compose.production.yml logs -f --tail=200 server web coturn
```

Caddy binds 80/443 and automatically provisions HTTPS. coturn uses host networking because large UDP mappings are error-prone. With UFW allow SSH, `80/tcp`, `443/tcp`, `443/udp`, `3478/tcp`, `3478/udp`, and `49160:49200/udp`. Mirror these rules in the cloud firewall. If behind NAT, forward them and set `TURN_PUBLIC_IP` to the public address.

Verify `curl -fsS https://callyou.ir/api/health`, `/api/ready`, browser Socket.IO connection, and TLS. Use Trickle ICE or a two-network call to confirm a relay candidate. `turnutils_uclient` can diagnose coturn using a temporary REST credential; never paste shared secrets into public sites.

Back up daily:

```bash
docker compose -f docker-compose.production.yml exec -T postgres pg_dump -Fc -U callyou callyou > callyou-$(date +%F).dump
```

Encrypt and copy backups off-host; regularly restore-test into a separate database. To update, take a backup, record `git rev-parse HEAD` and image IDs, pull the reviewed revision, and run `up -d --build`. Check readiness and logs. To roll back, check out the recorded revision and rebuild. Restore the database only for a known incompatible migration; current migrations are additive.

## Coolify

The repository includes `docker-compose.coolify.yml`. It differs from the standalone production stack in three important ways: Coolify terminates HTTPS, the web container listens only on internal port 80, and coturn publishes its TCP/UDP ports directly on the host.

1. Create a new Coolify resource from this Git repository and select the Docker Compose build pack.
2. Set the Compose location to `/docker-compose.coolify.yml`.
3. In the generated `web` service, set its domain to your public HTTPS URL on container port 80, for example `https://meet.example.com`.
4. Do not assign a domain or public port to `server` or `postgres`.
5. Configure the required variables below and deploy.

| Variable         | Example                    | Notes                                                         |
| ---------------- | -------------------------- | ------------------------------------------------------------- |
| `APP_URL`        | `https://meet.example.com` | Must exactly match the browser origin; omit a trailing slash. |
| `TURN_HOST`      | `turn.example.com`         | DNS record pointing directly to the Coolify server.           |
| `TURN_REALM`     | `turn.example.com`         | Normally the same hostname as `TURN_HOST`.                    |
| `TURN_PUBLIC_IP` | `203.0.113.10`             | Public IP advertised by coturn.                               |
| `TURN_MIN_PORT`  | `49160`                    | Optional; keep the firewall range identical.                  |
| `TURN_MAX_PORT`  | `49200`                    | Optional; keep the firewall range identical.                  |

Coolify creates stable random values for `SERVICE_PASSWORD_64_POSTGRES`, `SERVICE_BASE64_64_SESSION`, and `SERVICE_BASE64_64_TURN`. Never replace those values after rooms or database data exist unless you intend to invalidate sessions or rotate credentials.

Open `3478/tcp`, `3478/udp`, and `49160:49200/udp` in both the operating-system and provider firewalls. The application domain still needs normal `80/tcp` and `443/tcp` access for Coolify's proxy. If another service already occupies the TURN ports, change the mapping and the TURN URLs in the application together; changing only one side will break relaying.

After deployment, verify:

```bash
curl -fsS https://meet.example.com/api/health
curl -fsS https://meet.example.com/api/ready
```

Then test a call from two different networks and confirm that a `relay` ICE candidate appears in browser WebRTC diagnostics. A successful same-network call does not prove TURN is reachable.
