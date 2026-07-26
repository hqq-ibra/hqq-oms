# Deploying HQQ OMS to hqq-tech.com

Everything here was verified against the live server on 2026-07-26.

## Production topology

| Thing | Value |
|---|---|
| Host | `root@46.224.197.38` (Ubuntu 24.04.4 LTS), SSH key `~/.ssh/hqq_oms_ed25519` |
| App root | `/opt/hqq-oms` |
| Process manager | pm2 — `hqq-api` (port 4000) and `hqq-web` (port 3001) |
| **pm2 working directory** | **`/opt/hqq-oms`** for both — see [Uploads](#uploads) |
| Web server | nginx 1.24.0, site config `/etc/nginx/sites-available/hqq-tech` |
| Live database | Docker container **`hqq_db`**, port 5434, user `hqq`, database `hqq_oms` |
| Runtime | Node v22.22.1, npm 10.9.4 |

> **Database gotcha.** There are two Postgres containers. `hqq_db` (5434) is the live
> one, configured in `/opt/hqq-oms/.env`. `hqq_postgres` (5432) is **not in use** — the
> `postgres` role does not even exist in it. `apps/api/.env` points at 5432 and is
> misleading; trust `/opt/hqq-oms/.env`.

`/opt/hqq-oms` contains a `.git` directory, but it is stale (stuck at the initial
commit). Deployment is by file copy, not by `git pull`. Do not trust git state there.

## Deploying

The repo is on GitHub now, so the old `backups/deploy-todo.ps1` — which base64-encodes a
tarball into a PowerShell heredoc because there was no remote — is obsolete. Use this.

### 1. Build a clean archive from the committed tree

```bash
git archive --format=tar <branch> apps prisma package.json package-lock.json tsconfig.base.json \
  | tar --delete 'apps/api/uploads' \
  | gzip > /tmp/deploy.tar.gz
```

`git archive` ships only committed files, so no `node_modules`, no `.next`, no local
scratch. Deleting `apps/api/uploads` drops 77 MB of tracked PDFs that production does not
need (see [Uploads](#uploads)). Result is roughly 1.6 MB.

### 2. Back up what you are about to overwrite

```bash
B=/opt/hqq-oms-backup-$(date +%Y%m%d)
mkdir -p "$B/pkg/api" "$B/pkg/web" "$B/pkg/root"
cd /opt/hqq-oms
cp -a apps/api/src "$B/api-src"
cp -a apps/web/src "$B/web-src"
cp -a apps/web/.next "$B/web-next"          # ~330 MB, this is your rollback build
cp -a apps/api/package.json "$B/pkg/api/"
cp -a apps/web/package.json "$B/pkg/web/"
cp -a package.json package-lock.json "$B/pkg/root/"
```

Copy the three `package.json` files to **separate** subdirectories — copying them into
one directory collides on the filename and, under `set -e`, aborts the script.

### 3. Extract, install, build

```bash
scp -i ~/.ssh/hqq_oms_ed25519 /tmp/deploy.tar.gz root@46.224.197.38:/tmp/
ssh -i ~/.ssh/hqq_oms_ed25519 root@46.224.197.38
cd /opt/hqq-oms
tar xzf /tmp/deploy.tar.gz -C /opt/hqq-oms
npm install --no-audit --no-fund
npx prisma generate --schema prisma/schema.prisma
npm -w apps/api run build
npm -w apps/web run build       # slow, several minutes
```

Only restart **after** both builds succeed. A running pm2 process keeps serving its
already-loaded build, so a failed build leaves production untouched.

### 4. Restart — the step that actually ships it

```bash
pm2 restart hqq-api hqq-web --update-env
```

> **This is the step that gets skipped, and skipping it is silent.** A long SSH session
> can drop (`Connection reset by peer`) after the builds and before the restart, and the
> shell may still report success. The new code sits on disk while pm2 keeps serving the
> old processes.
>
> On 2026-07-26 this happened, and `hqq-api` was found to have been running for 74 days
> with **zero** restarts. Every new page returned 404 despite a "successful" deploy.

### 5. Verify — never trust the exit code

```bash
pm2 jlist | python3 -c "import sys,json,time
for a in json.load(sys.stdin):
    up=(time.time()*1000-a['pm2_env']['pm_uptime'])/1000
    print(f\"{a['name']}: {a['pm2_env']['status']}, up {up:.0f}s, restarts={a['pm2_env']['restart_time']}\")"
```

Uptime must be seconds, and the restart counter must have incremented. Then check the
live site:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://hqq-tech.com/<a-new-page>
curl -s -o /dev/null -w '%{http_code}\n' https://hqq-tech.com/api/v1/<a-new-route>
```

A guarded API route should answer **401**, not 404. `404` means the API process has not
picked up the new code — go back to step 4.

### Rollback

Restore `api-src`, `web-src` and `web-next` from the backup directory, then
`pm2 restart hqq-api hqq-web`. Because `.next` is included, rollback needs no rebuild.

## Uploads

User uploads live at **`/opt/hqq-oms/uploads/`** and nginx serves them via
`location /uploads/ { alias /opt/hqq-oms/uploads/; }`.

This location matters. Uploads used to sit inside `apps/api/uploads`, which broke twice
over:

1. Deployment copies `apps/` wholesale, so anything under it is at risk of being
   overwritten by whatever the developer had locally.
2. Every upload path in the API was built from `process.cwd()`. pm2 runs with
   cwd `/opt/hqq-oms`, so files were written to `/opt/hqq-oms/uploads/` while nginx was
   serving `/opt/hqq-oms/apps/api/uploads/`. **Every newly uploaded file returned 404**
   while older files — shipped by the deploy copy — worked fine.

Both are fixed: uploads now live outside `apps/`, and paths come from
`apps/api/src/config/uploads.ts`, which reads an optional `UPLOADS_DIR` environment
variable and falls back to `join(process.cwd(), 'uploads')`.

To make the location explicit rather than a side effect of how pm2 was launched, set
`UPLOADS_DIR=/opt/hqq-oms/uploads` in `/opt/hqq-oms/.env` and restart. Leaving it unset
resolves to the same directory today, so this is optional hardening, not a fix.

`apps/api/uploads` is still tracked in git (187 files, 77 MB). Exclude it from deployment
archives; production's copies are the real ones.

## Search engine visibility

hqq-tech.com is deliberately kept out of search results. nginx sends
`X-Robots-Tag: noindex, nofollow, noarchive, nosnippet` on **every** response, including
`/uploads/` (those are confidential product drawings), and serves `/robots.txt` from
`/var/www/robots.txt`.

That `robots.txt` intentionally **permits** crawling. It looks wrong and is not: a
`Disallow` stops crawlers fetching pages, which stops them ever seeing the `noindex`
header, which can leave already-indexed URLs stranded in results. The header is the
authoritative signal; robots.txt must not hide it.

## Verification caveats

These bite anyone who assumes a green build means a healthy codebase.

- **`npm run build:web` does not typecheck.** `apps/web/next.config` sets
  `ignoreBuildErrors` and `ignoreDuringBuilds`, so TypeScript and lint are skipped
  entirely. Run `cd apps/web && npx tsc --noEmit` separately.
- **There is a baseline of 6 pre-existing type errors** in `apps/web`, unrelated to
  recent work. Compare against that number; anything above it is yours.
- **`npm run lint` cannot run.** No `eslint.config.*` exists anywhere in the repo, so the
  script fails repo-wide regardless of code quality.
- **API tests:** `npm -w apps/api run test`. Jest was added on 2026-07-26; before that the
  API had no tests at all.

## Schema changes

The analytics work needed none. If a change does require one, apply the migration against
`hqq_db` **before** restarting the API, and record it in `_prisma_migrations` — see
`backups/deploy-todo.ps1` for the pattern previously used to do this by hand.
