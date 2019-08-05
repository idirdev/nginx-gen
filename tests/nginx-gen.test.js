'use strict';

/**
 * @fileoverview Tests for nginx-gen.
 * @author idirdev
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  generateServerBlock,
  generateUpstream,
  generateRateLimit,
  generateSecurityHeaders,
  generateCorsConfig,
  validateConfig,
  writeConfig,
  fromTemplate,
  TEMPLATES,
} = require('../src/index');

// ── generateServerBlock ─────────────────────────────────────────────────────

describe('generateServerBlock', () => {
  it('contains server_name for given domain', () => {
    const cfg = generateServerBlock({ domain: 'example.com' });
    assert.ok(cfg.includes('server_name example.com'));
  });

  it('generates HTTP block when ssl is false', () => {
    const cfg = generateServerBlock({ domain: 'example.com', ssl: false });
    assert.ok(cfg.includes('listen 80'));
    assert.ok(!cfg.includes('ssl_certificate'));
  });

  it('generates SSL block when ssl is true', () => {
    const cfg = generateServerBlock({ domain: 'example.com', ssl: true });
    assert.ok(cfg.includes('listen 443 ssl'));
    assert.ok(cfg.includes('ssl_certificate'));
    assert.ok(cfg.includes('ssl_certificate_key'));
    assert.ok(cfg.includes('return 301 https://'));
  });

  it('uses custom sslCert and sslKey paths', () => {
    const cfg = generateServerBlock({
      domain: 'test.dev',
      ssl: true,
      sslCert: '/certs/test.crt',
      sslKey: '/certs/test.key',
    });
    assert.ok(cfg.includes('ssl_certificate /certs/test.crt'));
    assert.ok(cfg.includes('ssl_certificate_key /certs/test.key'));
  });

  it('generates proxy_pass for proxy mode', () => {
    const cfg = generateServerBlock({ domain: 'api.example.com', proxy: true, port: 4000 });
    assert.ok(cfg.includes('proxy_pass http://127.0.0.1:4000'));
    assert.ok(cfg.includes('proxy_set_header Host $host'));
  });

  it('generates try_files for static root mode', () => {
    const cfg = generateServerBlock({ domain: 'site.com', proxy: false });
    assert.ok(cfg.includes('try_files $uri $uri/ =404'));
  });

  it('generates SPA fallback when spa option is set', () => {
    const cfg = generateServerBlock({ domain: 'app.com', spa: true });
    assert.ok(cfg.includes('try_files $uri $uri/ /index.html'));
  });

  it('includes gzip directives when gzip is enabled', () => {
    const cfg = generateServerBlock({ domain: 'site.com', gzip: true });
    assert.ok(cfg.includes('gzip on'));
    assert.ok(cfg.includes('gzip_types'));
  });

  it('includes http2 parameter when http2 is enabled', () => {
    const cfg = generateServerBlock({ domain: 'site.com', ssl: true, http2: true });
    assert.ok(cfg.includes('listen 443 ssl http2'));
  });

  it('includes cache headers when cacheStatic is enabled', () => {
    const cfg = generateServerBlock({ domain: 'site.com', cacheStatic: true });
    assert.ok(cfg.includes('Cache-Control'));
    assert.ok(cfg.includes('expires 1y'));
  });

  it('adds www redirect when www is enabled', () => {
    const cfg = generateServerBlock({ domain: 'site.com', www: true });
    assert.ok(cfg.includes('www.site.com'));
    assert.ok(cfg.includes('return 301'));
  });
});

// ── generateUpstream ────────────────────────────────────────────────────────

describe('generateUpstream', () => {
  it('produces correct upstream block', () => {
    const cfg = generateUpstream('backend', ['127.0.0.1:3000', '127.0.0.1:3001']);
    assert.ok(cfg.includes('upstream backend {'));
    assert.ok(cfg.includes('server 127.0.0.1:3000'));
    assert.ok(cfg.includes('server 127.0.0.1:3001'));
  });

  it('throws when name is missing', () => {
    assert.throws(() => generateUpstream('', ['127.0.0.1:3000']), /required/);
  });

  it('throws when servers array is empty', () => {
    assert.throws(() => generateUpstream('grp', []), /non-empty/);
  });
});

// ── generateRateLimit ───────────────────────────────────────────────────────

describe('generateRateLimit', () => {
  it('generates limit_req_zone directive', () => {
    const d = generateRateLimit('api', '5r/s');
    assert.ok(d.includes('limit_req_zone'));
    assert.ok(d.includes('zone=api'));
    assert.ok(d.includes('rate=5r/s'));
  });

  it('uses defaults when no args provided', () => {
    const d = generateRateLimit();
    assert.ok(d.includes('zone=default'));
    assert.ok(d.includes('rate=10r/s'));
  });
});

// ── generateSecurityHeaders ─────────────────────────────────────────────────

describe('generateSecurityHeaders', () => {
  it('includes key security headers', () => {
    const h = generateSecurityHeaders();
    assert.ok(h.includes('X-Frame-Options'));
    assert.ok(h.includes('X-Content-Type-Options'));
    assert.ok(h.includes('Strict-Transport-Security'));
  });
});

// ── generateCorsConfig ──────────────────────────────────────────────────────

describe('generateCorsConfig', () => {
  it('includes specified origins', () => {
    const cfg = generateCorsConfig(['https://app.example.com']);
    assert.ok(cfg.includes('https://app.example.com'));
    assert.ok(cfg.includes('Access-Control-Allow-Origin'));
  });

  it('defaults to wildcard when no origins provided', () => {
    const cfg = generateCorsConfig([]);
    assert.ok(cfg.includes('*'));
  });
});

// ── validateConfig ──────────────────────────────────────────────────────────

describe('validateConfig', () => {
  it('accepts valid config with matching braces', () => {
    const cfg = generateServerBlock({ domain: 'ok.com' });
    const result = validateConfig(cfg);
    assert.equal(result.valid, true);
    assert.equal(result.error, null);
  });

  it('rejects config with unclosed brace', () => {
    const result = validateConfig('server { location / {');
    assert.equal(result.valid, false);
    assert.ok(result.error);
  });

  it('rejects config with unexpected closing brace', () => {
    const result = validateConfig('server {} }');
    assert.equal(result.valid, false);
    assert.ok(result.error);
  });

  it('rejects empty config string', () => {
    const result = validateConfig('');
    assert.equal(result.valid, false);
  });
});

// ── writeConfig ─────────────────────────────────────────────────────────────

describe('writeConfig', () => {
  it('writes config to file', () => {
    const tmp = path.join(os.tmpdir(), 'nginx-gen-test-' + Date.now() + '.conf');
    const content = generateServerBlock({ domain: 'write-test.com' });
    writeConfig(content, tmp);
    const read = fs.readFileSync(tmp, 'utf8');
    assert.equal(read, content);
    fs.unlinkSync(tmp);
  });

  it('creates intermediate directories', () => {
    const tmp = path.join(os.tmpdir(), 'nginx-gen-' + Date.now(), 'sub', 'test.conf');
    writeConfig('server {}\n', tmp);
    assert.ok(fs.existsSync(tmp));
    fs.rmSync(path.dirname(path.dirname(tmp)), { recursive: true, force: true });
  });
});

// ── fromTemplate ────────────────────────────────────────────────────────────

describe('fromTemplate', () => {
  it('generates proxy template', () => {
    const cfg = fromTemplate('proxy', { domain: 'api.test.com', port: 5000 });
    assert.ok(cfg.includes('proxy_pass'));
    assert.ok(cfg.includes('5000'));
  });

  it('generates spa template with spa fallback', () => {
    const cfg = fromTemplate('spa', { domain: 'spa.test.com' });
    assert.ok(cfg.includes('/index.html'));
  });

  it('generates static template', () => {
    const cfg = fromTemplate('static', { domain: 'static.test.com' });
    assert.ok(cfg.includes('try_files'));
  });

  it('generates api template', () => {
    const cfg = fromTemplate('api', { domain: 'api.test.com', port: 8080 });
    assert.ok(cfg.includes('proxy_pass'));
  });

  it('throws for unknown template', () => {
    assert.throws(() => fromTemplate('nope', {}), /Unknown template/);
  });
});
