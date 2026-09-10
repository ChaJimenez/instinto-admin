require('dotenv').config();
const http = require('http');
const { URL } = require('url');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

/**
 * Corre esto UNA sola vez para autorizar tu cuenta de Google con Drive.
 * Abre la URL que imprime en el navegador, acepta el acceso, y el script
 * recibe el callback local y guarda el token en google-token.json.
 *
 *   node src/integrations/google-drive-auth-setup.js
 */

const TOKEN_PATH = path.join(__dirname, 'google-token.json');
const REDIRECT_PORT = 53682;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth2callback`;

const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('❌ Faltan GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET en .env');
  console.error('   Sácalos del cliente OAuth "Desktop app" que creaste en Google Cloud Console.');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/drive'],
});

console.log('\n🔗 Abre esta URL en tu navegador y autoriza el acceso con tu cuenta de Google:\n');
console.log(authUrl);
console.log(`\nEsperando el callback en ${REDIRECT_URI} ...\n`);

const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);
    if (reqUrl.pathname !== '/oauth2callback') {
      res.writeHead(404);
      res.end();
      return;
    }

    const code = reqUrl.searchParams.get('code');
    if (!code) {
      res.writeHead(400);
      res.end('Falta el parámetro code en el callback.');
      return;
    }

    const { tokens } = await oauth2Client.getToken(code);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h2>Listo, ya puedes cerrar esta pestaña.</h2>');

    console.log(`✅ Autorizado. Token guardado en ${TOKEN_PATH}`);
    server.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error en el intercambio de token:', error.message);
    res.writeHead(500);
    res.end('Error, revisa la terminal.');
    server.close();
    process.exit(1);
  }
});

server.listen(REDIRECT_PORT);
