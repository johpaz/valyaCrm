// services/mediaService.ts
import * as FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';
import logger from '../utils/logger';
import { Readable } from 'stream';


interface MediaInfo {
  mediaId: string;
  filePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  downloadedAt: Date;
}

class MediaService {
  accessToken: string;
  mediaDir: string;

  constructor() {
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
    // En producción en Vercel conviene usar /tmp, en local la carpeta media
    this.mediaDir =
      process.env.NODE_ENV === 'production'
        ? '/tmp/media'
        : path.join(process.cwd(), 'media');

    if (!fs.existsSync(this.mediaDir)) {
      fs.mkdirSync(this.mediaDir, { recursive: true });
    }
    logger.info('Servicio de Media inicializado');
  }

  /**
    * Descarga un archivo multimedia de WhatsApp
    */
  async downloadMedia(mediaId: string): Promise<MediaInfo> {
    try {
      logger.info(`Descargando archivo multimedia: ${mediaId}`);

      // 1) Obtener info de media
      const infoRes = await fetch(
        `https://graph.facebook.com/v23.0/${mediaId}`,
        { headers: { Authorization: `Bearer ${this.accessToken}` } }
      );
      const { url: mediaUrl, mime_type: mimeType, file_size: fileSize } = await infoRes.json();

      // 2) Descargar stream
      const fileRes = await fetch(mediaUrl, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });

      if (!fileRes.ok) {
        throw new Error(`Failed to download media: ${fileRes.status} ${fileRes.statusText}`);
      }

      if (!fileRes.body || !(fileRes.body instanceof ReadableStream)) {
        throw new Error('Response body is not a readable stream');
      }

      const timestamp = Date.now();
      const ext = this.getExtensionFromMimeType(mimeType);
      const fileName = `${mediaId}_${timestamp}${ext}`;
      const filePath = path.join(this.mediaDir, fileName);

      const writer = fs.createWriteStream(filePath);
      Readable.fromWeb(fileRes.body as any).pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          logger.info(`Archivo descargado: ${filePath}`);
          resolve({ mediaId, filePath, fileName, mimeType, fileSize, downloadedAt: new Date() });
        });
        writer.on('error', err => {
          logger.error(`Error guardando archivo: ${err.message}`);
          reject(err);
        });
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`downloadMedia error: ${message}`);
      throw new Error(`Error descargando multimedia: ${message}`);
    }
  }

 /**
   * Transcribe un archivo de audio con Whisper vía fetch
   */
  async transcribeAudio(audioFilePath: string): Promise<string> {
    try {
      logger.info(`Transcribiendo audio: ${audioFilePath}`);

      if (!fs.existsSync(audioFilePath)) {
        logger.error(`Audio no existe: ${audioFilePath}`);
        return this.simulateTranscription(audioFilePath);
      }
      if (!process.env.OPENAI_API_KEY) {
        logger.warn('OPENAI_API_KEY no configurada, usando simulación');
        return this.simulateTranscription(audioFilePath);
      }

      const form = new (FormData as any)();
      form.append('file', fs.createReadStream(audioFilePath));
      form.append('model', 'whisper-1');
      form.append('language', 'es');

      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          ...form.getHeaders(),
        },
        body: form,
      });

      if (!res.ok) {
        const errTxt = await res.text();
        logger.error(`Whisper API error ${res.status}: ${errTxt}`);
        return this.simulateTranscription(audioFilePath);
      }

      const json = await res.json();
      logger.info(`Transcripción recibida (primeros 100 chars): ${json.text.slice(0, 100)}`);
      return json.text;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`transcribeAudio error: ${message}`);
      return this.simulateTranscription(audioFilePath);
    }
  }

  /**
   * Fallback de transcripción si falla Whisper
   */
  simulateTranscription(audioFilePath: string): string {
    const stat = fs.statSync(audioFilePath);
    const secs = Math.ceil(stat.size / 16000);
    const msg = `[Audio ~${secs}s]: Transcripción simulada. Configure OPENAI_API_KEY para transcripción real.`;
    logger.info(`Usando simulación: ${msg}`);
    return msg;
  }

  /**
    * Procesa una imagen con Gemini Vision (SDK)
    */
   async processImage(imageFilePath: string): Promise<string> {
    try {
      logger.info(`Procesando imagen: ${imageFilePath}`);
      if (!fs.existsSync(imageFilePath)) {
        throw new Error(`Imagen no encontrada: ${imageFilePath}`);
      }
      if (!process.env.GEMINI_API_KEY) {
        logger.warn('GEMINI_API_KEY no configurada, usando simulación');
        return this.simulateImageDescription(imageFilePath);
      }

      const buffer = fs.readFileSync(imageFilePath);
      const base64 = buffer.toString('base64');
      const mimeType = this.getMimeTypeFromPath(imageFilePath);

      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const prompt = `Analiza y describe en detalle la imagen. Si hay texto, transcríbelo. Responde en español.`;
      const imagePart = { inlineData: { data: base64, mimeType } };

      const result = await model.generateContent([prompt, imagePart]);
      const desc = result.response.text();
      logger.info(`Descripción generada (primeros 100 chars): ${desc.slice(0, 100)}`);
      return desc;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`processImage error: ${message}`);
      return this.simulateImageDescription(imageFilePath);
    }
  }

  simulateImageDescription(imageFilePath: string): string {
    const stat = fs.statSync(imageFilePath);
    const fileName = path.basename(imageFilePath);
    const sizeKB = Math.round(stat.size / 1024);
    const msg = `[Imagen ${fileName}, ${sizeKB}KB]: Descripción simulada. Configure GEMINI_API_KEY para análisis real.`;
    logger.info(`Usando simulación imagen: ${msg}`);
    return msg;
  }

  /**
    * Maneja cualquier mensaje multimedia de WhatsApp
    */
   async processMediaMessage(mediaMessage: any): Promise<string> {
     try {
       const type = mediaMessage.type;
       const id = this.getMediaId(mediaMessage);
       if (!id) throw new Error('ID multimedia no encontrado');

       const file = await this.downloadMedia(id);
       let text: string;
       switch (type) {
         case 'audio':
         case 'voice':
           text = await this.transcribeAudio(file.filePath);
           break;
         case 'image':
           text = await this.processImage(file.filePath);
           break;
         case 'document':
           text = `[Documento recibido]: ${file.fileName}, tipo ${file.mimeType}. Revisión manual requerida.`;
           break;
         case 'video':
           text = `[Video recibido]: ${file.fileName}. Revisión manual requerida.`;
           break;
         default:
           text = `[Archivo ${type} recibido]: No soportado automáticamente.`;
       }
       // Programar limpieza
       setTimeout(() => this.cleanupFile(file.filePath), 5 * 60 * 1000);
       return text;
     } catch (err: unknown) {
       const message = err instanceof Error ? err.message : String(err);
       logger.error(`processMediaMessage error: ${message}`);
       return `[Error multimedia]: No se pudo procesar el archivo.`;
     }
   }

   getMediaId(msg: any): string | null {
     switch (msg.type) {
       case 'audio':  return msg.audio?.id || null;
       case 'voice':  return msg.voice?.id || null;
       case 'image':  return msg.image?.id || null;
       case 'document': return msg.document?.id || null;
       case 'video':  return msg.video?.id || null;
       default:       return null;
     }
   }

   getExtensionFromMimeType(mime: string): string {
     const map: Record<string, string> = {
       'audio/ogg': '.ogg', 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a',
       'audio/wav': '.wav', 'image/jpeg': '.jpg', 'image/png': '.png',
       'image/gif': '.gif', 'image/webp': '.webp', 'video/mp4': '.mp4',
       'video/quicktime': '.mov', 'application/pdf': '.pdf',
       'application/msword': '.doc', '.docx': '.docx', 'text/plain': '.txt'
     };
     return map[mime] || '.bin';
   }

   getMimeTypeFromPath(fp: string): string {
     const ext = path.extname(fp).toLowerCase();
     const map: Record<string, string> = {
       '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
       '.gif': 'image/gif', '.webp': 'image/webp', '.ogg': 'audio/ogg',
       '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav'
     };
     return map[ext] || 'application/octet-stream';
   }

   cleanupFile(fp: string): void {
     try {
       if (fs.existsSync(fp)) {
         fs.unlinkSync(fp);
         logger.info(`Archivo eliminado: ${fp}`);
       }
     } catch (e: unknown) {
       const message = e instanceof Error ? e.message : String(e);
       logger.error(`cleanupFile error: ${message}`);
     }
   }

   cleanupOldFiles(maxAgeHours: number = 24): void {
     try {
       const now = Date.now();
       fs.readdirSync(this.mediaDir).forEach(file => {
         const fp = path.join(this.mediaDir, file);
         const age = now - fs.statSync(fp).mtimeMs;
         if (age > maxAgeHours * 3600 * 1000) this.cleanupFile(fp);
       });
       logger.info('Limpieza de archivos antiguos completada');
     } catch (e: unknown) {
       const message = e instanceof Error ? e.message : String(e);
       logger.error(`cleanupOldFiles error: ${message}`);
     }
   }
}

export default new MediaService();
