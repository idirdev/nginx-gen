'use strict';

/**
 * @fileoverview Generate nginx configuration files programmatically.
 * @module nginx-gen
 * @author idirdev
 */

const fs = require('fs');
const path = require('path');

/**
 * Common nginx configuration presets.
 * @type {Object}
 */
const TEMPLATES = {
  /** Static file serving */
  static: { proxy: false, gzip: true, cacheStatic: true, http2: false },
  /** Reverse proxy to a local process */
  proxy: { proxy: true, gzip: true, cacheStatic: false, http2: true },
  /** Single-page application with client-side routing */
  spa: { proxy: false, gzip: true, cacheStatic: true, http2: true, spa: true },
  /** REST API proxy */
  api: { proxy: true, gzip: false, cacheStatic: false, http2: true, cors: true },
};

/**
 * Generate an nginx `server` block configuration string.
 *
 * @param {Object} opts - Configuration options.
 * @param {string}  [opts.domain='example.com']  - Server name / domain.
 * @param {number}  [opts.port=3000]             - Port for proxy_pass (when proxy is true).
 * @param {number}  [opts.proxyPort]             - Alias for opts.port.
 * @param {boolean} [opts.ssl=false]             - Enable HTTPS (443) with SSL directives.
 * @param {string}  [opts.sslCert]               - Path to SSL certificate PEM file.
 * @param {string}  [opts.sslKey]                - Path to SSL private key PEM file.
 * @param {string}  [opts.root]                  - Document root for static serving.
 * @param {boolean} [opts.proxy=false]           - Enable reverse proxy mode.
 * @param {boolean} [opts.www=false]             - Add redirect from www subdomain.
 * @param {boolean} [opts.gzip=false]            - Enable gzip compression.
 * @param {boolean} [opts.http2=false]           - Add http2 parameter to listen directives.
 * @param {boolean} [opts.cacheStatic=false]     - Add cache headers for static assets.
 * @param {boolean} [opts.spa=false]             - SPA fallback (try_files to index.html).
 * @returns {string} nginx server block configuration.
 */
function generateServerBlock(opts) {
  opts = opts || {};

  const domain = opts.domain || 'example.com';
  const port = opts.proxyPort || opts.port || 3000;
  const ssl = opts.ssl === true;
  const useProxy = opts.proxy === true;
  const root = opts.root || ('/var/www/' + domain + '/public');
  const http2Param = opts.http2 ? ' http2' : '';

  const sslCert = opts.sslCert || ('/etc/letsencrypt/live/' + domain + '/fullchain.pem');
  const sslKey = opts.sslKey || ('/etc/letsencrypt/live/' + domain + '/privkey.pem');

  let out = '';

  // ── HTTPS server block ──────────────────────────────────────────────────
  if (ssl) {
    out += 'server {\n';
    out += '  listen 443 ssl' + http2Param + ';\n';
    out += '  listen [::]:443 ssl' + http2Param + ';\n';
    out += '  server_name ' + domain + ';\n\n';
    out += '  ssl_certificate ' + sslCert + ';\n';
    out += '  ssl_certificate_key ' + sslKey + ';\n';
    out += '  ssl_protocols TLSv1.2 TLSv1.3;\n';
    out += '  ssl_ciphers HIGH:!aNULL:!MD5;\n';
    out += '  ssl_prefer_server_ciphers on;\n';
    out += '  ssl_session_cache shared:SSL:10m;\n';
    out += '  ssl_session_timeout 10m;\n';
  } else {
    out += 'server {\n';
    out += '  listen 80' + http2Param + ';\n';
    out += '  listen [::]:80' + http2Param + ';\n';
    out += '  server_name ' + domain + ';\n';
  }

  // ── Gzip ────────────────────────────────────────────────────────────────
  if (opts.gzip) {
    out += '\n  gzip on;\n';
    out += '  gzip_vary on;\n';
    out += '  gzip_proxied any;\n';
    out += '  gzip_comp_level 6;\n';
    out += '  gzip_types text/plain text/css text/xml application/json\n';
    out += '             application/javascript application/xml+rss\n';
    out += '             application/atom+xml image/svg+xml;\n';
  }

  // ── Location block ──────────────────────────────────────────────────────
  if (useProxy) {
    out += '\n  location / {\n';
    out += '    proxy_pass http://127.0.0.1:' + port + ';\n';
    out += '    proxy_http_version 1.1;\n';
    out += '    proxy_set_header Upgrade $http_upgrade;\n';
    out += '    proxy_set_header Connection \'upgrade\';\n';
    out += '    proxy_set_header Host $host;\n';
    out += '    proxy_set_header X-Real-IP $remote_addr;\n';
    out += '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n';
    out += '    proxy_set_header X-Forwarded-Proto $scheme;\n';
    out += '    proxy_cache_bypass $http_upgrade;\n';
    out += '  }\n';
  } else {
    out += '\n  root ' + root + ';\n';
    out += '  index index.html index.htm;\n\n';
    out += '  location / {\n';
    if (opts.spa) {
      out += '    try_files $uri $uri/ /index.html;\n';
    } else {
      out += '    try_files $uri $uri/ =404;\n';
    }
    out += '  }\n';
  }

  // ── Static asset caching ─────────────────────────────────────────────────
  if (opts.cacheStatic) {
    out += '\n  location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {\n';
    out += '    expires 1y;\n';
    out += '    add_header Cache-Control "public, immutable";\n';
    out += '    access_log off;\n';
    out += '  }\n';
  }

  out += '}\n';

  // ── HTTP → HTTPS redirect ────────────────────────────────────────────────
  if (ssl) {
    out += '\nserver {\n';
    out += '  listen 80;\n';
    out += '  listen [::]:80;\n';
    out += '  server_name ' + domain + ';\n';
    out += '  return 301 https://$host$request_uri;\n';
    out += '}\n';
  }

  // ── www → non-www redirect ───────────────────────────────────────────────
  if (opts.www) {
    const listenLine = ssl
      ? '  listen 443 ssl' + http2Param + ';\n  listen [::]:443 ssl' + http2Param + ';\n'
      : '  listen 80;\n  listen [::]:80;\n';
    out += '\nserver {\n';
    out += listenLine;
    out += '  server_name www.' + domain + ';\n';
    out += '  return 301 $scheme://' + domain + '$request_uri;\n';
    out += '}\n';
  }

  return out;
}

/**
 * Generate an nginx `upstream` block for load balancing.
 *
 * @param {string}   name    - Upstream group name.
 * @param {string[]} servers - Array of server addresses (e.g. ["127.0.0.1:3000"]).
 * @returns {string} nginx upstream block.
 */
function generateUpstream(name, servers) {
  if (!name) throw new Error('upstream name is required');
  if (!Array.isArray(servers) || servers.length === 0) {
    throw new Error('servers array must be non-empty');
  }

  let out = 'upstream ' + name + ' {\n';
  for (const s of servers) {
    out += '  server ' + s + ';\n';
  }
  out += '}\n';
  return out;
}

/**
 * Generate an nginx `limit_req_zone` directive.
 *
 * @param {string} zone - Zone name (e.g. "api").
 * @param {string} rate - Request rate (e.g. "10r/s").
 * @returns {string} nginx rate limit directive.
 */
function generateRateLimit(zone, rate) {
  zone = zone || 'default';
  rate = rate || '10r/s';
  return 'limit_req_zone $binary_remote_addr zone=' + zone + ':10m rate=' + rate + ';\n';
}

/**
 * Generate a set of recommended nginx security headers.
 *
 * @returns {string} nginx add_header directives block.
 */
function generateSecurityHeaders() {
  return [
    'add_header X-Frame-Options "SAMEORIGIN" always;',
    'add_header X-XSS-Protection "1; mode=block" always;',
    'add_header X-Content-Type-Options "nosniff" always;',
    'add_header Referrer-Policy "strict-origin-when-cross-origin" always;',
    'add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;',
    'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;',
  ].join('\n') + '\n';
}

/**
 * Generate nginx CORS configuration directives.
 *
 * @param {string[]} origins - Allowed origin patterns.
 * @returns {string} nginx CORS directives block.
 */
function generateCorsConfig(origins) {
  origins = Array.isArray(origins) && origins.length ? origins : ['*'];
  const originValue = origins.length === 1 ? origins[0] : origins.join(' ');

  return [
    'add_header \'Access-Control-Allow-Origin\' \'' + originValue + '\' always;',
    'add_header \'Access-Control-Allow-Methods\' \'GET, POST, PUT, DELETE, OPTIONS\' always;',
    'add_header \'Access-Control-Allow-Headers\' \'Authorization, Content-Type, Accept\' always;',
    'if ($request_method = OPTIONS) {',
    '  add_header \'Access-Control-Max-Age\' 1728000;',
    '  add_header \'Content-Length\' 0;',
    '  return 204;',
    '}',
  ].join('\n') + '\n';
}

/**
 * Perform a basic syntax check on an nginx config string.
 * Verifies that all opening braces have matching closing braces.
 *
 * @param {string} configStr - nginx configuration string.
 * @returns {{ valid: boolean, error: string|null }} Validation result.
 */
function validateConfig(configStr) {
  if (typeof configStr !== 'string' || configStr.trim() === '') {
    return { valid: false, error: 'Config string is empty' };
  }

  let depth = 0;
  let lineNum = 0;

  for (const line of configStr.split('\n')) {
    lineNum++;
    // Skip comments
    const stripped = line.replace(/#.*$/, '');
    for (const ch of stripped) {
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth < 0) {
          return { valid: false, error: 'Unexpected closing brace at line ' + lineNum };
        }
      }
    }
  }

  if (depth !== 0) {
    return { valid: false, error: 'Unclosed brace — ' + depth + ' block(s) not closed' };
  }

  return { valid: true, error: null };
}

/**
 * Write a configuration string to a file.
 *
 * @param {string} content    - nginx configuration content.
 * @param {string} outputPath - Destination file path.
 * @returns {void}
 */
function writeConfig(content, outputPath) {
  if (typeof content !== 'string') throw new TypeError('content must be a string');
  if (typeof outputPath !== 'string') throw new TypeError('outputPath must be a string');

  const dir = path.dirname(outputPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, content, 'utf8');
}

/**
 * Build a full nginx config using a named preset template.
 *
 * @param {string} templateName - One of "static", "proxy", "spa", "api".
 * @param {Object} opts         - Additional options merged over the template defaults.
 * @returns {string} nginx server block configuration.
 */
function fromTemplate(templateName, opts) {
  const preset = TEMPLATES[templateName];
  if (!preset) throw new Error('Unknown template: ' + templateName + '. Choose from: ' + Object.keys(TEMPLATES).join(', '));
  return generateServerBlock(Object.assign({}, preset, opts || {}));
}

module.exports = {
  generateServerBlock,
  generateUpstream,
  generateRateLimit,
  generateSecurityHeaders,
  generateCorsConfig,
  validateConfig,
  writeConfig,
  fromTemplate,
  TEMPLATES,
};
