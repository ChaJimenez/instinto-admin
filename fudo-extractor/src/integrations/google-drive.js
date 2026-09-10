const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const TOKEN_PATH = path.join(__dirname, 'google-token.json');

/**
 * Sube reportes de Instinto a Google Drive usando OAuth de usuario (la cuenta
 * de Cha), no un service account — así el archivo aparece como subido por él
 * y no requiere compartir la carpeta con una cuenta de servicio aparte.
 *
 * Antes de usar esta clase por primera vez:
 *   1. Crear credenciales OAuth "Desktop app" en Google Cloud Console y poner
 *      GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET en .env
 *   2. Correr una vez: node src/integrations/google-drive-auth-setup.js
 *      (guarda el refresh token en google-token.json, junto a este archivo)
 */
class GoogleDriveIntegration {
  constructor() {
    this.folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    this.auth = null;
  }

  initialize() {
    if (this.auth) return;

    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error(
        'Faltan GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET en .env'
      );
    }
    if (!fs.existsSync(TOKEN_PATH)) {
      throw new Error(
        `Falta ${TOKEN_PATH} — corre "node src/integrations/google-drive-auth-setup.js" una vez para autorizar tu cuenta de Google.`
      );
    }

    const client = new google.auth.OAuth2(clientId, clientSecret);
    client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')));

    // Google rota el access_token con el refresh_token guardado; lo persistimos
    // de vuelta para no tener que re-autorizar cada vez que expire.
    client.on('tokens', (tokens) => {
      const current = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      fs.writeFileSync(TOKEN_PATH, JSON.stringify({ ...current, ...tokens }, null, 2));
    });

    this.auth = client;
  }

  async uploadReport(reportData, filename = null) {
    try {
      this.initialize();
      const drive = google.drive({ version: 'v3', auth: this.auth });
      const timestamp = new Date().toISOString().split('T')[0];
      const finalFilename = filename || `instinto-report-${timestamp}.json`;

      const response = await drive.files.create({
        resource: {
          name: finalFilename,
          parents: this.folderId ? [this.folderId] : undefined,
        },
        media: {
          mimeType: 'application/json',
          body: JSON.stringify(reportData, null, 2),
        },
        fields: 'id, webViewLink',
      });

      console.log(`✅ Reporte subido a Google Drive: ${response.data.webViewLink}`);
      return response.data;
    } catch (error) {
      console.error('❌ Error subiendo a Google Drive:', error.message);
      return null;
    }
  }

  async listReports() {
    try {
      this.initialize();
      const drive = google.drive({ version: 'v3', auth: this.auth });

      const response = await drive.files.list({
        q: `${this.folderId ? `'${this.folderId}' in parents and ` : ''}name contains 'instinto-report'`,
        spaces: 'drive',
        fields: 'files(id, name, createdTime)',
        pageSize: 10,
        orderBy: 'createdTime desc',
      });

      return response.data.files;
    } catch (error) {
      console.error('❌ Error listando reportes de Drive:', error.message);
      return [];
    }
  }
}

module.exports = GoogleDriveIntegration;
