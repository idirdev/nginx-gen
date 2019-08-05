# nginx-gen

> **[EN]** Generate production-ready Nginx server block configurations from the command line — with SSL/TLS, reverse proxy, gzip, and HTTP-to-HTTPS redirect support.
> **[FR]** Générez des configurations de blocs serveur Nginx prêtes pour la production depuis la ligne de commande — avec SSL/TLS, reverse proxy, gzip et redirection HTTP vers HTTPS.

---

## Features / Fonctionnalités

**[EN]**
- Generates a complete `server { }` block for any domain in seconds
- SSL mode by default: includes Let's Encrypt certificate paths and `http2`
- Reverse proxy mode (`--proxy`): full proxy headers (Upgrade, Host, X-Real-IP, X-Forwarded-*)
- Static site mode: `root` + `try_files` for single-page applications
- Automatic HTTP → HTTPS redirect block when SSL is enabled
- Gzip compression enabled by default for common MIME types
- Custom upstream block generation via the programmatic API
- Write output directly to a file with `-o`

**[FR]**
- Génère un bloc `server { }` complet pour n'importe quel domaine en quelques secondes
- Mode SSL par défaut : chemins de certificats Let's Encrypt inclus et `http2`
- Mode reverse proxy (`--proxy`) : en-têtes proxy complets (Upgrade, Host, X-Real-IP, X-Forwarded-*)
- Mode site statique : `root` + `try_files` pour les applications single-page
- Bloc de redirection HTTP → HTTPS automatique lorsque SSL est activé
- Compression gzip activée par défaut pour les types MIME courants
- Génération de blocs upstream personnalisés via l'API programmable
- Écriture de la sortie directement dans un fichier avec `-o`

---

## Installation

```bash
npm install -g @idirdev/nginx-gen
```

---

## CLI Usage / Utilisation CLI

```bash
# Generate SSL reverse proxy config (générer une config reverse proxy SSL)
nginx-gen --domain api.example.com --port 4000 --proxy

# Generate static site config without SSL (config site statique sans SSL)
nginx-gen --domain example.com --no-ssl

# Generate config and save to file (générer et sauvegarder dans un fichier)
nginx-gen --domain app.example.com --port 3000 --proxy -o /etc/nginx/sites-available/app.conf

# Custom port, proxy, SSL (port personnalisé, proxy, SSL)
nginx-gen --domain dashboard.myapp.io --port 8080 --proxy

# Show help (afficher l'aide)
nginx-gen --help
```

### Example Output / Exemple de sortie

```nginx
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    ssl_certificate /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;
    server_name api.example.com;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
}

server {
    listen 80;
    server_name api.example.com;
    return 301 https://$host$request_uri;
}
```

---

## API (Programmatic) / API (Programmation)

```js
const { generateServerBlock, generateUpstream } = require('@idirdev/nginx-gen');

// Reverse proxy with SSL (reverse proxy avec SSL)
const conf = generateServerBlock({
  domain: 'api.example.com',
  port: 4000,
  proxy: true,
  ssl: true
});
require('fs').writeFileSync('/etc/nginx/sites-available/api.conf', conf);

// Static site without SSL (site statique sans SSL)
const staticConf = generateServerBlock({
  domain: 'example.com',
  root: '/var/www/example.com',
  ssl: false
});

// Upstream load balancer block (bloc upstream pour load balancer)
const upstream = generateUpstream('app_cluster', [
  '127.0.0.1:3000',
  '127.0.0.1:3001',
  '127.0.0.1:3002'
]);
// upstream app_cluster {
//     server 127.0.0.1:3000;
//     server 127.0.0.1:3001;
//     server 127.0.0.1:3002;
// }
```

---

## License

MIT © idirdev
