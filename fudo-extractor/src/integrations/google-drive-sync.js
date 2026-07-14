require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

/**
 * Integración con Google Drive
 * Sube reportes semanales automáticamente a la carpeta de reportes
 */

class GoogleDriveSync {
  constructor() {
    this.drive = null;
    this.auth = null;
  }

  /**
   * Autentica con Google Drive usando credenciales del service account
   * NOTA: Se requiere descargar JSON de credenciales desde Google Cloud Console
   */
  async authenticate() {
    try {
      // Opción 1: Usar archivo de credenciales (si existe)
      const credentialsPath = path.join(__dirname, '../../credentials.json');

      if (fs.existsSync(credentialsPath)) {
        const credentials = JSON.parse(fs.readFileSync(credentialsPath));
        this.auth = new google.auth.GoogleAuth({
          keyFile: credentialsPath,
          scopes: ['https://www.googleapis.com/auth/drive'],
        });
      } else {
        console.warn('⚠️  credentials.json no encontrado.');
        console.warn('   Para usar Google Drive sync:');
        console.warn('   1. Ve a: https://console.cloud.google.com/');
        console.warn('   2. Crea un Service Account');
        console.warn('   3. Descarga la key JSON');
        console.warn('   4. Guárdala como: fudo-extractor/credentials.json');
        return false;
      }

      this.drive = google.drive({ version: 'v3', auth: this.auth });
      return true;
    } catch (error) {
      console.error('Error autenticando con Google Drive:', error.message);
      return false;
    }
  }

  /**
   * Sube un archivo a Google Drive
   */
  async uploadFile(filePath, fileName, folderId) {
    try {
      const fileContent = fs.readFileSync(filePath);

      const file = await this.drive.files.create({
        requestBody: {
          name: fileName,
          parents: [folderId],
          mimeType: 'application/json',
        },
        media: {
          mimeType: 'application/json',
          body: fileContent,
        },
      });

      console.log(`✅ Archivo subido a Google Drive: ${fileName}`);
      console.log(`   ID: ${file.data.id}`);
      return file.data.id;
    } catch (error) {
      console.error(`Error subiendo archivo a Drive:`, error.message);
      return null;
    }
  }

  /**
   * Sube reporte semanal a la carpeta de reportes
   */
  async uploadWeeklyReport(reportPath) {
    const authenticated = await this.authenticate();
    if (!authenticated) {
      console.log('⏭️  Google Drive sync desactivado (sin credenciales)');
      return null;
    }

    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    const fileName = `Reporte-${new Date().toISOString().split('T')[0]}.json`;

    return await this.uploadFile(reportPath, fileName, folderId);
  }

  /**
   * Lista archivos en una carpeta
   */
  async listReports() {
    const authenticated = await this.authenticate();
    if (!authenticated) return [];

    try {
      const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
      const files = await this.drive.files.list({
        q: `'${folderId}' in parents and name contains 'Reporte'`,
        fields: 'files(id, name, createdTime, webViewLink)',
        orderBy: 'createdTime desc',
        pageSize: 10,
      });

      return files.data.files || [];
    } catch (error) {
      console.error('Error listando reportes:', error.message);
      return [];
    }
  }
}

module.exports = GoogleDriveSync;
