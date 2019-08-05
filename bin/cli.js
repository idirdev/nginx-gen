#!/usr/bin/env node
'use strict';

/**
 * @fileoverview CLI for nginx-gen — generate nginx configuration files.
 * @author idirdev
 */

const path = require('path');
const fs = require('fs');
const {
  generateServerBlock,
  generateUpstream,
  fromTemplate,
  writeConfig,
} = require('../src/index');

const args = process.argv.slice(2);

/**
 * Parse a named argument value from the argv array.
 * @param {string[]} argv - Array of CLI arguments.
 * @param {string}   flag - Flag name including leading dashes (e.g. "--domain").
 * @param {*}        def  - Default value when flag is absent.
 * @returns {string|boolean|*}
 */
function getArg(argv, flag, def) {
  const i = argv.indexOf(flag);
  if (i === -1) return def;
  return argv[i + 1] !== undefined ? argv[i + 1] : true;
}

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log([
    '',
    'Usage: nginx-gen --domain <domain> [options]',
    '',
    'Options:',
    '  --domain   <domain>   Server name (default: example.com)',
    '  --port     <n>        Proxy port (default: 3000)',
    '  --proxy               Enable reverse proxy mode',
    '  --ssl                 Enable HTTPS / SSL directives',
    '  --gzip                Enable gzip compression',
    '  --http2               Add http2 to listen directives',
    '  --www                 Add www → non-www redirect',
    '  --spa                 SPA fallback (try_files to index.html)',
    '  --cache-static        Add long-lived cache headers for static assets',
    '  --template <name>     Use preset: proxy | static | spa | api',
    '  --output <path>       Write to file instead of stdout',
    '',
    'Examples:',
    '  nginx-gen --domain api.example.com --proxy --port 4000 --ssl --http2',
    '  nginx-gen --domain example.com --template spa --ssl --output /tmp/example.com',
    '',
  ].join('\n'));
  process.exit(0);
}

const domain = getArg(args, '--domain', 'example.com');
const port = parseInt(getArg(args, '--port', '3000'), 10);
const template = getArg(args, '--template', null);
const output = getArg(args, '--output', null);

const opts = {
  domain,
  port,
  proxy: args.includes('--proxy'),
  ssl: args.includes('--ssl'),
  gzip: args.includes('--gzip'),
  http2: args.includes('--http2'),
  www: args.includes('--www'),
  spa: args.includes('--spa'),
  cacheStatic: args.includes('--cache-static'),
};

let config;
try {
  config = template ? fromTemplate(template, opts) : generateServerBlock(opts);
} catch (err) {
  console.error('Error: ' + err.message);
  process.exit(1);
}

if (output) {
  writeConfig(config, output);
  console.log('Config written to ' + path.resolve(output));
} else {
  process.stdout.write(config);
}
