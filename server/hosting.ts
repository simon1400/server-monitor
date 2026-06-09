import { exec } from 'child_process'
import { promisify } from 'util'
import { promises as fs, createReadStream } from 'fs'
import path from 'path'
import dns from 'dns'
import { checkHttp, checkSSL } from './sites.js'

const execAsync = promisify(exec)
const dnsResolve4 = promisify(dns.resolve4)

// ── Constants ─────────────────────────────────────────────────────────────
const BASE_DIR = '/opt/static-sites'
const REGISTRY = path.join(BASE_DIR, '.registry.json')
const NGINX_AVAILABLE = '/etc/nginx/sites-available'
const NGINX_ENABLED = '/etc/nginx/sites-enabled'
const CERTBOT_EMAIL = process.env.CERTBOT_EMAIL || 'pechunka11@gmail.com'
const MAX_TEXT_SIZE = 1024 * 1024 // 1 MB editable text cap

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/
const DOMAIN_RE = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(?:\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i

// ── Types ─────────────────────────────────────────────────────────────────
export interface HistoryEntry {
  at: string            // ISO timestamp
  field: string         // 'created' | 'name' | 'cost' | 'currency' | 'nextPayment'
  from: string | null
  to: string | null
}

export interface SiteMeta {
  slug: string
  name: string
  domain: string
  www: boolean
  redirectWww?: boolean
  ssl: boolean
  createdAt: string
  // Administrative / billing info
  hostingCost?: number
  hostingCurrency?: string
  nextPaymentDate?: string   // YYYY-MM-DD
  history?: HistoryEntry[]
}

export interface AdminPatch {
  name?: string
  hostingCost?: number | null
  hostingCurrency?: string | null
  nextPaymentDate?: string | null
}

export interface ManagedSite extends SiteMeta {
  exists: boolean
  diskUsage: string
  fileCount: number
  hasNginx: boolean
  http: { status: number | null; ok: boolean } | null
  sslInfo: { valid: boolean; daysLeft: number; notAfter: string } | null
}

export interface StepResult {
  steps: { name: string; success: boolean; output: string }[]
  success: boolean
  error?: string
}

export interface FileEntry {
  name: string
  type: 'dir' | 'file'
  size: number
  mtime: number
}

// ── Low-level helpers ─────────────────────────────────────────────────────
function execCmd(cmd: string): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    exec(cmd, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) resolve({ success: false, output: (stderr || stdout || err.message).slice(-3000) })
      else resolve({ success: true, output: (stdout || stderr).slice(-3000) })
    })
  })
}

function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63)
}

function siteRootOf(slug: string): string {
  if (!SLUG_RE.test(slug)) throw new Error('Invalid site identifier')
  return path.join(BASE_DIR, slug)
}

// Resolve a user-supplied path strictly within a site's root.
// Blocks `..` traversal (via path.resolve) and symlink escapes (via realpath
// on the deepest existing ancestor).
async function safePath(slug: string, userPath = ''): Promise<string> {
  const root = siteRootOf(slug)
  const rel = String(userPath || '').replace(/^[/\\]+/, '')
  const full = path.resolve(root, rel)
  const rootSep = root.endsWith(path.sep) ? root : root + path.sep
  if (full !== root && !full.startsWith(rootSep)) throw new Error('Path escapes site root')

  // Symlink-escape check: realpath the deepest existing ancestor.
  let realRoot: string
  try { realRoot = await fs.realpath(root) } catch { return full } // root not created yet
  const realRootSep = realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep
  let check = full
  for (;;) {
    try {
      const real = await fs.realpath(check)
      if (real !== realRoot && !real.startsWith(realRootSep)) throw new Error('Path escapes site root (symlink)')
      break
    } catch (e: any) {
      if (e?.code === 'ENOENT') {
        const parent = path.dirname(check)
        if (parent.length < root.length || parent === check) break
        check = parent
        continue
      }
      throw e
    }
  }
  return full
}

async function ensureBase(): Promise<void> {
  await fs.mkdir(BASE_DIR, { recursive: true })
}

async function readRegistry(): Promise<SiteMeta[]> {
  try {
    const txt = await fs.readFile(REGISTRY, 'utf-8')
    const json = JSON.parse(txt)
    return Array.isArray(json.sites) ? json.sites : []
  } catch {
    return []
  }
}

async function writeRegistry(sites: SiteMeta[]): Promise<void> {
  await ensureBase()
  await fs.writeFile(REGISTRY, JSON.stringify({ sites }, null, 2), 'utf-8')
}

async function getMeta(slug: string): Promise<SiteMeta | null> {
  const sites = await readRegistry()
  return sites.find(s => s.slug === slug) || null
}

async function updateMeta(slug: string, patch: Partial<SiteMeta>): Promise<void> {
  const sites = await readRegistry()
  const idx = sites.findIndex(s => s.slug === slug)
  if (idx === -1) return
  sites[idx] = { ...sites[idx], ...patch }
  await writeRegistry(sites)
}

let cachedServerIp: string | null = null
async function getServerIp(): Promise<string | null> {
  if (cachedServerIp) return cachedServerIp
  try {
    const { stdout } = await execAsync('curl -s --max-time 5 https://api.ipify.org')
    cachedServerIp = stdout.trim() || null
    return cachedServerIp
  } catch {
    return null
  }
}

// ── Site management ───────────────────────────────────────────────────────
export async function listManagedSites(): Promise<ManagedSite[]> {
  const metas = await readRegistry()
  return Promise.all(metas.map(async (m): Promise<ManagedSite> => {
    const root = siteRootOf(m.slug)
    let exists = false
    try { exists = (await fs.stat(root)).isDirectory() } catch { /* missing */ }

    let diskUsage = 'N/A'
    let fileCount = 0
    if (exists) {
      try { const { stdout } = await execAsync(`du -sh ${root} 2>/dev/null`); diskUsage = stdout.split('\t')[0] || 'N/A' } catch { /* ignore */ }
      try { const { stdout } = await execAsync(`find ${root} -type f | wc -l`); fileCount = parseInt(stdout.trim()) || 0 } catch { /* ignore */ }
    }

    let hasNginx = false
    try { await fs.access(path.join(NGINX_AVAILABLE, `static-${m.slug}`)); hasNginx = true } catch { /* ignore */ }

    let http: ManagedSite['http'] = null
    let sslInfo: ManagedSite['sslInfo'] = null
    if (m.domain && hasNginx) {
      try {
        const [h, s] = await Promise.all([checkHttp(m.domain), checkSSL(m.domain)])
        http = { status: h.status, ok: h.status !== null && h.status >= 200 && h.status < 400 }
        sslInfo = s ? { valid: s.valid, daysLeft: s.daysLeft, notAfter: s.notAfter } : null
      } catch { /* network check is best-effort */ }
    }

    return { ...m, exists, diskUsage, fileCount, hasNginx, http, sslInfo }
  }))
}

export async function createSite(
  name: string,
  domain: string,
  admin?: { hostingCost?: number | null; hostingCurrency?: string | null; nextPaymentDate?: string | null },
): Promise<{ success: boolean; slug?: string; error?: string }> {
  const cleanName = String(name || '').trim()
  const cleanDomain = String(domain || '').trim().toLowerCase()
  if (!cleanName) return { success: false, error: 'Name is required' }
  if (cleanDomain && !DOMAIN_RE.test(cleanDomain)) return { success: false, error: 'Invalid domain' }

  await ensureBase()
  const sites = await readRegistry()

  let base = slugify(cleanDomain || cleanName)
  if (!base) return { success: false, error: 'Could not derive a valid identifier' }
  let slug = base
  let n = 2
  while (sites.some(s => s.slug === slug)) { slug = `${base}-${n++}` }

  if (cleanDomain && sites.some(s => s.domain === cleanDomain)) {
    return { success: false, error: `Domain ${cleanDomain} is already managed` }
  }

  await fs.mkdir(siteRootOf(slug), { recursive: true })
  await execCmd(`chown root:root ${siteRootOf(slug)}`)

  const now = new Date().toISOString()
  const cost = admin?.hostingCost ?? undefined
  const currency = admin?.hostingCurrency || undefined
  const nextPaymentDate = admin?.nextPaymentDate || undefined
  const history: HistoryEntry[] = [{ at: now, field: 'created', from: null, to: cleanName }]
  if (cost != null) history.push({ at: now, field: 'cost', from: null, to: `${cost}${currency ? ' ' + currency : ''}` })
  if (nextPaymentDate) history.push({ at: now, field: 'nextPayment', from: null, to: nextPaymentDate })

  sites.push({
    slug, name: cleanName, domain: cleanDomain, www: false, ssl: false, createdAt: now,
    hostingCost: cost, hostingCurrency: currency, nextPaymentDate, history,
  })
  await writeRegistry(sites)
  return { success: true, slug }
}

// Update administrative info, recording a change-log entry per changed field.
export async function updateSiteAdmin(slug: string, patch: AdminPatch): Promise<{ success: boolean; error?: string; site?: SiteMeta }> {
  const sites = await readRegistry()
  const idx = sites.findIndex(s => s.slug === slug)
  if (idx === -1) return { success: false, error: 'Site not found' }

  const cur = { ...sites[idx] }
  const now = new Date().toISOString()
  const history: HistoryEntry[] = cur.history ? [...cur.history] : []
  const norm = (v: unknown) => (v == null || v === '' ? null : String(v))
  const track = (field: string, oldV: unknown, newV: unknown) => {
    const a = norm(oldV), b = norm(newV)
    if (a !== b) { history.push({ at: now, field, from: a, to: b }); return true }
    return false
  }

  if (patch.name !== undefined) {
    const nm = String(patch.name).trim()
    if (nm && track('name', cur.name, nm)) cur.name = nm
  }
  if (patch.hostingCurrency !== undefined) {
    const cc = patch.hostingCurrency || undefined
    if (track('currency', cur.hostingCurrency, cc)) cur.hostingCurrency = cc
  }
  if (patch.hostingCost !== undefined) {
    const cost = patch.hostingCost == null ? undefined : Number(patch.hostingCost)
    if (track('cost', cur.hostingCost, cost)) cur.hostingCost = cost
  }
  if (patch.nextPaymentDate !== undefined) {
    const d = patch.nextPaymentDate || undefined
    if (track('nextPayment', cur.nextPaymentDate, d)) cur.nextPaymentDate = d
  }

  cur.history = history
  sites[idx] = cur
  await writeRegistry(sites)
  return { success: true, site: cur }
}

// Move contents up one level if the archive was wrapped in a single folder.
async function unwrapSingleFolder(root: string): Promise<void> {
  const entries = await fs.readdir(root, { withFileTypes: true })
  if (entries.length !== 1 || !entries[0].isDirectory()) return
  const inner = path.join(root, entries[0].name)
  const innerEntries = await fs.readdir(inner)
  if (innerEntries.includes('index.html')) {
    // Move everything from inner up to root
    for (const item of innerEntries) {
      await fs.rename(path.join(inner, item), path.join(root, item))
    }
    await fs.rmdir(inner)
  }
}

export async function uploadZip(slug: string, tmpZipPath: string, mode: 'replace' | 'merge'): Promise<StepResult> {
  const steps: StepResult['steps'] = []
  const meta = await getMeta(slug)
  if (!meta) return { steps, success: false, error: 'Site not found' }
  const root = siteRootOf(slug)
  await fs.mkdir(root, { recursive: true })

  // 1. Backup current content (single rolling backup per site, sibling of root)
  try {
    const existing = await fs.readdir(root)
    if (existing.length > 0) {
      const bak = `${root}.bak`
      await execCmd(`rm -rf ${bak} && cp -a ${root} ${bak}`)
      steps.push({ name: 'backup', success: true, output: `Backed up to ${bak}` })
    }
  } catch { /* nothing to back up */ }

  // 2. Replace mode clears the directory first
  if (mode === 'replace') {
    const clear = await execCmd(`find ${root} -mindepth 1 -delete`)
    steps.push({ name: 'clear', success: clear.success, output: clear.success ? 'Cleared existing files' : clear.output })
  }

  // 3. Extract
  const unzip = await execCmd(`unzip -o -q ${tmpZipPath} -d ${root}`)
  steps.push({ name: 'extract', success: unzip.success, output: unzip.output || 'Extracted' })
  if (!unzip.success) return { steps, success: false, error: 'Failed to extract zip (is it a valid archive?)' }

  // 4. Unwrap single-folder archives
  try { await unwrapSingleFolder(root) } catch { /* non-fatal */ }

  // 5. Normalize ownership & permissions
  await execCmd(`chown -R root:root ${root}; find ${root} -type d -exec chmod 755 {} \\; ; find ${root} -type f -exec chmod 644 {} \\;`)

  const { stdout: countOut } = await execAsync(`find ${root} -type f | wc -l`).catch(() => ({ stdout: '0' }))
  const fileCount = parseInt(String(countOut).trim()) || 0
  const hasIndex = await fs.access(path.join(root, 'index.html')).then(() => true).catch(() => false)
  steps.push({ name: 'finalize', success: true, output: `${fileCount} files${hasIndex ? '' : ' (warning: no index.html at root)'}` })

  return { steps, success: true }
}

// ── Domain + SSL ──────────────────────────────────────────────────────────
function siteServeBlock(slug: string): string {
  return `    root ${siteRootOf(slug)};
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|webp|mp4)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }`
}

function sslLines(domain: string): string {
  return `    ssl_certificate /etc/letsencrypt/live/${domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;`
}

// HTTP-only config, used to bootstrap a brand-new domain so certbot's http-01
// challenge can be served before a certificate exists.
function bootstrapConfig(slug: string, domain: string, www: boolean): string {
  const names = www ? `${domain} www.${domain}` : domain
  return `server {
    listen 80;
    listen [::]:80;
    server_name ${names};

${siteServeBlock(slug)}
}
`
}

// Final config with SSL. Three shapes:
//  - no www: apex only
//  - www, no redirect: apex + www both serve the site
//  - www + redirect: www.* 301 -> apex, apex serves the site
function finalConfig(slug: string, domain: string, www: boolean, redirectWww: boolean): string {
  const serve = siteServeBlock(slug)
  const ssl = sslLines(domain)

  if (www && redirectWww) {
    return `server {
    listen 80;
    listen [::]:80;
    server_name ${domain} www.${domain};
    return 301 https://${domain}$request_uri;
}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name www.${domain};
${ssl}
    return 301 https://${domain}$request_uri;
}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ${domain};
${ssl}

${serve}
}
`
  }

  const names = www ? `${domain} www.${domain}` : domain
  const httpRedirectTarget = www ? 'https://$host$request_uri' : `https://${domain}$request_uri`
  return `server {
    listen 80;
    listen [::]:80;
    server_name ${names};
    return 301 ${httpRedirectTarget};
}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ${names};
${ssl}

${serve}
}
`
}

export async function setupDomain(slug: string, domainInput: string, wantWww: boolean, redirectWww: boolean): Promise<StepResult> {
  const steps: StepResult['steps'] = []
  const meta = await getMeta(slug)
  if (!meta) return { steps, success: false, error: 'Site not found' }

  const domain = String(domainInput || '').trim().toLowerCase()
  if (!DOMAIN_RE.test(domain)) return { steps, success: false, error: 'Invalid domain name' }
  const www = !!wantWww
  const doRedirect = www && !!redirectWww

  // 1. DNS precheck
  const serverIp = await getServerIp()
  const apexIps = await dnsResolve4(domain).catch(() => [] as string[])
  const apexOk = serverIp ? apexIps.includes(serverIp) : apexIps.length > 0
  if (!apexOk) {
    return {
      steps: [{ name: 'dns', success: false, output: `${domain} → ${apexIps.join(', ') || 'no A-record'}${serverIp ? ` (server is ${serverIp})` : ''}` }],
      success: false,
      error: `Domain "${domain}" does not point to this server. Add a DNS A-record ${domain} → ${serverIp || 'this server'}, wait for it to propagate, then try again.`,
    }
  }

  // www requested but not pointing here → STOP with guidance (don't silently drop it)
  if (www) {
    const wwwIps = await dnsResolve4(`www.${domain}`).catch(() => [] as string[])
    const wwwOk = serverIp ? wwwIps.includes(serverIp) : wwwIps.length > 0
    if (!wwwOk) {
      return {
        steps: [
          { name: 'dns', success: true, output: `${domain} → ${apexIps.join(', ')} ✓` },
          { name: 'dns: www', success: false, output: `www.${domain} → ${wwwIps.join(', ') || 'no A-record'}${serverIp ? ` (server is ${serverIp})` : ''}` },
        ],
        success: false,
        error: `"www" is enabled, but www.${domain} does not point to this server. Choose one:\n` +
          `  1) Add a DNS A-record (or CNAME) www.${domain} → ${serverIp || 'this server'}, wait for it to propagate, then retry;\n` +
          `  2) Uncheck "www" to publish ${domain} only (you can add www later).`,
      }
    }
  }
  steps.push({ name: 'dns', success: true, output: `${domain}${www ? ` + www.${domain}` : ''} → ${apexIps.join(', ')}${serverIp ? ` ✓ matches server (${serverIp})` : ''}` })

  const availPath = path.join(NGINX_AVAILABLE, `static-${slug}`)
  const enabledPath = path.join(NGINX_ENABLED, `static-${slug}`)
  const certExists = await fs.access(`/etc/letsencrypt/live/${domain}/fullchain.pem`).then(() => true).catch(() => false)

  // 2. Bootstrap (only for a brand-new cert — keeps existing site up on re-runs)
  if (!certExists) {
    try {
      await fs.writeFile(availPath, bootstrapConfig(slug, domain, www), 'utf-8')
      await execCmd(`ln -sf ${availPath} ${enabledPath}`)
    } catch (e: any) {
      return { steps, success: false, error: `Failed to write nginx config: ${e?.message}` }
    }
    const test = await execCmd('nginx -t 2>&1')
    if (!test.success) {
      await execCmd(`rm -f ${enabledPath} ${availPath}`)
      steps.push({ name: 'nginx test', success: false, output: test.output })
      return { steps, success: false, error: 'nginx config test failed (rolled back)' }
    }
    await execCmd('systemctl reload nginx')
    steps.push({ name: 'nginx (http)', success: true, output: 'Bootstrapped HTTP config for certificate validation' })
  }

  // 3. Obtain/expand the certificate (certonly: we manage the serving config ourselves)
  const dFlags = www ? `-d ${domain} -d www.${domain}` : `-d ${domain}`
  const certbot = await execCmd(`certbot certonly --nginx --cert-name ${domain} ${dFlags} --non-interactive --agree-tos -m ${CERTBOT_EMAIL} --expand --keep-until-expiring 2>&1`)
  steps.push({ name: 'ssl certificate', success: certbot.success, output: certbot.output })
  if (!certbot.success) {
    await updateMeta(slug, { domain, www, redirectWww: doRedirect, ssl: false })
    return { steps, success: false, error: 'Certificate issuance failed. Check that the domain resolves to this server and Let\'s Encrypt rate limits are not hit.' }
  }

  // 4. Write the final SSL config (with optional www→apex redirect)
  const prevConfig = await fs.readFile(availPath, 'utf-8').catch(() => '')
  await fs.writeFile(availPath, finalConfig(slug, domain, www, doRedirect), 'utf-8')
  await execCmd(`ln -sf ${availPath} ${enabledPath}`)
  const test2 = await execCmd('nginx -t 2>&1')
  steps.push({ name: 'nginx config', success: test2.success, output: test2.success ? `${doRedirect ? 'www → ' + domain + ' redirect, ' : ''}HTTPS enabled` : test2.output })
  if (!test2.success) {
    if (prevConfig) await fs.writeFile(availPath, prevConfig, 'utf-8') // restore previous working config
    await execCmd('systemctl reload nginx')
    return { steps, success: false, error: 'Final nginx config test failed (restored previous config).' }
  }
  await execCmd('systemctl reload nginx')

  await updateMeta(slug, { domain, www, redirectWww: doRedirect, ssl: true })
  steps.push({ name: 'done', success: true, output: `https://${domain} is live` })
  return { steps, success: true }
}

export async function deleteSite(slug: string, removeCert: boolean): Promise<{ success: boolean; error?: string }> {
  const meta = await getMeta(slug)
  if (!meta) return { success: false, error: 'Site not found' }
  const root = siteRootOf(slug)

  // Remove files + backup
  await execCmd(`rm -rf ${root} ${root}.bak`)

  // Remove nginx config
  await execCmd(`rm -f ${path.join(NGINX_ENABLED, `static-${slug}`)} ${path.join(NGINX_AVAILABLE, `static-${slug}`)}`)
  await execCmd('nginx -t && systemctl reload nginx')

  // Optionally remove cert
  if (removeCert && meta.domain) {
    await execCmd(`certbot delete --cert-name ${meta.domain} --non-interactive 2>&1`)
  }

  const sites = (await readRegistry()).filter(s => s.slug !== slug)
  await writeRegistry(sites)
  return { success: true }
}

// ── File manager ──────────────────────────────────────────────────────────
export async function listTree(slug: string, subpath: string): Promise<{ path: string; entries: FileEntry[] }> {
  const full = await safePath(slug, subpath)
  const dirents = await fs.readdir(full, { withFileTypes: true })
  const entries: FileEntry[] = await Promise.all(dirents.map(async (d) => {
    let size = 0, mtime = 0
    try { const st = await fs.stat(path.join(full, d.name)); size = st.size; mtime = st.mtimeMs } catch { /* ignore */ }
    return { name: d.name, type: d.isDirectory() ? 'dir' : 'file', size, mtime }
  }))
  entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1))
  const rel = String(subpath || '').replace(/^[/\\]+/, '')
  return { path: rel, entries }
}

const TEXT_EXT = new Set(['.html', '.htm', '.css', '.js', '.mjs', '.cjs', '.json', '.txt', '.md', '.xml', '.svg', '.csv', '.yml', '.yaml', '.conf', '.ts', '.tsx', '.jsx', '.map', '.webmanifest', ''])

export async function readTextFile(slug: string, p: string): Promise<{ content: string; size: number; editable: boolean }> {
  const full = await safePath(slug, p)
  const st = await fs.stat(full)
  if (!st.isFile()) throw new Error('Not a file')
  const ext = path.extname(full).toLowerCase()
  const editable = TEXT_EXT.has(ext) && st.size <= MAX_TEXT_SIZE
  if (!editable) return { content: '', size: st.size, editable: false }
  const buf = await fs.readFile(full)
  if (buf.includes(0)) return { content: '', size: st.size, editable: false } // binary
  return { content: buf.toString('utf-8'), size: st.size, editable: true }
}

export async function writeTextFile(slug: string, p: string, content: string): Promise<void> {
  const full = await safePath(slug, p)
  await fs.mkdir(path.dirname(full), { recursive: true })
  try { await fs.copyFile(full, `${full}.bak`) } catch { /* no prior version */ }
  await fs.writeFile(full, content, 'utf-8')
  await execCmd(`chown root:root ${full}; chmod 644 ${full}`)
}

export async function makeDir(slug: string, p: string): Promise<void> {
  const full = await safePath(slug, p)
  await fs.mkdir(full, { recursive: true })
  await execCmd(`chown root:root ${full}; chmod 755 ${full}`)
}

export async function renameEntry(slug: string, from: string, to: string): Promise<void> {
  const fromFull = await safePath(slug, from)
  const toFull = await safePath(slug, to)
  await fs.mkdir(path.dirname(toFull), { recursive: true })
  await fs.rename(fromFull, toFull)
}

export async function deleteEntry(slug: string, p: string): Promise<void> {
  const rel = String(p || '').replace(/^[/\\]+/, '')
  if (!rel) throw new Error('Cannot delete site root')
  const full = await safePath(slug, rel)
  await fs.rm(full, { recursive: true, force: true })
}

export async function saveUploadedFiles(slug: string, destPath: string, files: { path: string; originalname: string }[]): Promise<number> {
  const destDir = await safePath(slug, destPath)
  await fs.mkdir(destDir, { recursive: true })
  let count = 0
  for (const f of files) {
    const target = await safePath(slug, path.join(String(destPath || ''), f.originalname))
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.rename(f.path, target).catch(async () => {
      await fs.copyFile(f.path, target)
      await fs.unlink(f.path).catch(() => {})
    })
    await execCmd(`chown root:root ${target}; chmod 644 ${target}`)
    count++
  }
  return count
}

export async function getDownload(slug: string, p: string): Promise<{ stream: NodeJS.ReadableStream; name: string; size: number }> {
  const full = await safePath(slug, p)
  const st = await fs.stat(full)
  if (!st.isFile()) throw new Error('Not a file')
  return { stream: createReadStream(full), name: path.basename(full), size: st.size }
}
