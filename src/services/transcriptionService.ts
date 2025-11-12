import fs from 'fs';
import logger from '../utils/logger';


class TranscriptionService {
  genAI: any;

  constructor() {
    // Usar Gemini para transcripción
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
  }

  async transcribeAudio(audioFilePath: string): Promise<string> {
    try {
      logger.info(`Transcribiendo audio con Google Speech-to-Text: ${audioFilePath}`);

      if (!fs.existsSync(audioFilePath)) {
        logger.error(`Audio no existe: ${audioFilePath}`);
        return "Archivo de audio no encontrado";
      }

      // Intentar primero con Speech-to-Text si hay credenciales
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        try {
          return await this.transcribeWithSpeechToText(audioFilePath);
        } catch (speechError) {
          logger.warn('Speech-to-Text falló, intentando con Gemini');
        }
      }

      // Fallback a Gemini con prompt mejorado para transcripción pura
      if (!process.env.GEMINI_API_KEY) {
        logger.warn('GEMINI_API_KEY no configurada, usando simulación');
        return this.simulateTranscription(audioFilePath);
      }

      const audioBuffer = fs.readFileSync(audioFilePath);
      const model = this.genAI.getGenerativeModel({
        model: "gemini-2.5-flash"
      });

      const audioContent = {
        inlineData: {
          data: audioBuffer.toString('base64'),
          mimeType: 'audio/ogg'
        }
      };

      // Prompt específico para transcripción pura sin descripciones de ruido
      const result = await model.generateContent([
        "Transcribe exactamente las palabras habladas en este audio. Ignora cualquier ruido de fondo, sonidos ambientales o descripciones. Solo devuelve el texto hablado en español.",
        audioContent
      ]);

      const response = await result.response;
      const transcript = response.text().trim();

      logger.info(`Transcripción Gemini completada: "${transcript.slice(0, 100)}..."`);
      return transcript;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
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

  // Método alternativo usando Speech-to-Text de Google Cloud
  async transcribeWithSpeechToText(audioFilePath: string): Promise<string> {
    try {
      // Importar Speech-to-Text solo si se necesita
      const speech = require('@google-cloud/speech');
      const client = new speech.SpeechClient({
        keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      });

      logger.info(`Transcribiendo con Speech-to-Text: ${audioFilePath}`);

      const audioBytes = fs.readFileSync(audioFilePath).toString('base64');

      const request = {
        audio: {
          content: audioBytes,
        },
        config: {
          encoding: 'OGG_OPUS',
          sampleRateHertz: 16000,
          languageCode: 'es-ES', // Español
          alternativeLanguageCodes: ['en-US'], // Inglés como alternativa
        },
      };

      const [response] = await client.recognize(request);
      const transcription = response.results
        .map((result: any) => result.alternatives[0].transcript)
        .join('\n');

      logger.info('Transcripción con Speech-to-Text completada');
      return transcription;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(error);
      throw new Error(`Error al transcribir con Speech-to-Text: ${message}`);
    }
  }
}

export default new TranscriptionService();