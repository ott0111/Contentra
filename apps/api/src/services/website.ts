import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

const BLOCKED_HOSTS = new Set(['localhost', 'localhost.localdomain', 'metadata.google.internal']);
const ALLOWED_PORTS = new Set(['', '80', '443']);
// DNS rebinding protection: the connection is pinned to the public address that
// was validated, so a hostname that flips to an internal address between
// validation and connection is not followed.
function isPrivateIp(ip: string) {
  if (ip.startsWith('::ffff:')) return isPrivateIp(ip.slice(7));
  if (net.isIP(ip) === 4) {
    const [a, b, c] = ip.split('.').map(Number);
    if (a >= 224) return true; // multicast, reserved, broadcast, 240/4
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a === 127) return true; // 127.0.0.0/8
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 0) return true; // 192.0.0.0/24
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmark
    if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
    if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
    return false;
  }
  if (ip === '::' || ip === '::1') return true; // unspecified, loopback
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true; // ULA
  if (ip.startsWith('fe80:')) return true; // link-local
  if (ip.startsWith('fec0:')) return true; // site-local
  if (ip.startsWith('ff') && net.isIP(ip) === 6) return true; // multicast
  return false;
}

async function resolvePublicAddress(hostname: string): Promise<string> {
  const addresses = net.isIP(hostname)
    ? [{ address: hostname }]
    : await dns.lookup(hostname, { all: true });
  const publicAddresses = addresses.map((x) => x.address).filter((address) => !isPrivateIp(address));
  if (!publicAddresses.length) throw new Error('PRIVATE_URL');
  return publicAddresses[0];
}

export async function validatePublicHttpUrl(raw: string) {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('INVALID_URL');
  if (url.username || url.password) throw new Error('INVALID_URL');
  if (!ALLOWED_PORTS.has(url.port)) throw new Error('INVALID_URL');
  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostname)) throw new Error('PRIVATE_URL');
  await resolvePublicAddress(hostname);
  return url;
}

async function fetchPinned(url: URL, pinnedAddress: string, maxBytes: number) {
  const isHttps = url.protocol === 'https:';
  const mod = isHttps ? https : http;
  const port = Number(url.port) || (isHttps ? 443 : 80);
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; buffer: Buffer }>(
    (resolve, reject) => {
      const req = mod.request(
        {
          hostname: url.hostname,
          port,
          path: `${url.pathname}${url.search}`,
          method: 'GET',
          lookup: (_hostname, options, callback) => {
            const family = net.isIP(pinnedAddress);
            // Node 20+ Happy Eyeballs asks for `all` addresses; keep the
            // validated address authoritative instead of an empty result.
            if (options.all) {
              callback(null, [{ address: pinnedAddress, family }]);
              return;
            }
            callback(null, pinnedAddress, family);
          },
          servername: isHttps ? url.hostname : undefined,
          rejectUnauthorized: true,
          timeout: 10_000,
          headers: {
            'user-agent': 'ContentraBot/1.0',
            accept: 'text/html,application/xhtml+xml',
            'accept-encoding': 'identity',
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > maxBytes) {
              req.destroy(new Error('PAGE_TOO_LARGE'));
              return;
            }
            chunks.push(chunk);
          });
          res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, buffer: Buffer.concat(chunks) }));
          res.on('error', reject);
        },
      );
      req.on('timeout', () => req.destroy(new Error('TIMEOUT')));
      req.on('error', reject);
      req.end();
    },
  );
}

export async function fetchPublicPage(raw: string, maxBytes = 1_500_000) {
  let current = await validatePublicHttpUrl(raw);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const pinnedAddress = await resolvePublicAddress(current.hostname);
    const response = await fetchPinned(current, pinnedAddress, maxBytes);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.location;
      if (!location) throw new Error('REDIRECT_WITHOUT_LOCATION');
      current = await validatePublicHttpUrl(new URL(location, current).toString());
      continue;
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`HTTP_${response.status}`);
    const contentType = response.headers['content-type'] ?? '';
    if (!contentType.includes('text/html')) throw new Error('NOT_HTML');
    if (response.buffer.length > maxBytes) throw new Error('PAGE_TOO_LARGE');
    const text = response.buffer.toString('utf8');
    if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new Error('PAGE_TOO_LARGE');
    return { url: current.toString(), text };
  }
  throw new Error('TOO_MANY_REDIRECTS');
}