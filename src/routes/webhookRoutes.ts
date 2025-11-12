import { Elysia } from 'elysia';
import logger from '../utils/logger';
import whatsappService from '../services/whatsappService';
import mediaService from '../services/mediaService';
import AgentService from '../langchain/agentService';
import transcriptionService from '../services/transcriptionService';

logger.info('Intentando cargar AgentService...');
let agentService: AgentService;
try {
  agentService = new AgentService();
  logger.info('AgentService cargado exitosamente');
} catch (error) {
  logger.error({ err: error }, 'Error al cargar AgentService');
  throw error;
}

async function processMessage(message: any) {
  const from = message.from;
  const messageType = message.type;
  const startTime = performance.now();
  logger.info(`Mensaje recibido de ${from}, tipo: ${messageType}`);

  try {
    let userMessageText;

    if (messageType === 'text') {
      userMessageText = message.text.body;
    } else if (messageType === 'audio') {
      const mediaId = message.audio.id;
      logger.info(`Processing audio message with mediaId: ${mediaId}`);
      const downloadStart = performance.now();
      const downloadedFile = await mediaService.downloadMedia(mediaId);
      const downloadEnd = performance.now();
      logger.info(`Media download completed in ${(downloadEnd - downloadStart).toFixed(2)}ms: ${downloadedFile.filePath}`);
      const transcriptionStart = performance.now();
      try {
        userMessageText = await transcriptionService.transcribeAudio(downloadedFile.filePath);
        const transcriptionEnd = performance.now();
        logger.info(`Audio transcription completed in ${(transcriptionEnd - transcriptionStart).toFixed(2)}ms`);
        logger.info(`Transcribed text length: ${userMessageText.length}, content: "${userMessageText}"`);
        if (!userMessageText || userMessageText.trim().length < 5) {
          logger.warn(`Transcription too short or empty: "${userMessageText}"`);
        }
      } catch (transcriptionError) {
        const transcriptionEnd = performance.now();
        logger.error({ err: transcriptionError }, `Transcription failed after ${(transcriptionEnd - transcriptionStart).toFixed(2)}ms`);
        userMessageText = "Error en transcripción de audio";
      } finally {
        // Limpiar archivo temporal
        mediaService.cleanupFile(downloadedFile.filePath);
      }
    } else {
      logger.warn(`Tipo de mensaje no soportado: ${messageType}`);
      await whatsappService.sendMessage(from, 'Lo siento, solo puedo procesar mensajes de texto y audio por ahora.');
      return;
    }

    if (!userMessageText || userMessageText.trim() === '') {
      userMessageText = "Audio recibido pero no se pudo transcribir";
      logger.info('Using default message for empty transcription');
    }

    const markReadStart = performance.now();
    await whatsappService.markAsRead(message.id);
    const markReadEnd = performance.now();
    logger.info(`Mark as read completed in ${(markReadEnd - markReadStart).toFixed(2)}ms`);

    const agentStart = performance.now();
    const agentResponse = await agentService.handleMessage(from, userMessageText);
    const agentEnd = performance.now();
    logger.info(`Agent message handling completed in ${(agentEnd - agentStart).toFixed(2)}ms`);

    if (agentResponse) {
      const sendStart = performance.now();
      await whatsappService.sendMessage(from, agentResponse);
      const sendEnd = performance.now();
      logger.info(`Message send completed in ${(sendEnd - sendStart).toFixed(2)}ms`);
    }

    const totalTime = performance.now() - startTime;
    logger.info(`Total message processing time from webhook: ${totalTime.toFixed(2)}ms`);

  } catch (error) {
    logger.error({ err: error }, `Error procesando mensaje de ${from}`);
    try {
      await whatsappService.sendMessage(from, 'Lo siento, ocurrió un error al procesar tu mensaje. Por favor, intenta de nuevo.');
    } catch (sendError) {
      logger.error({ err: sendError }, `Error enviando mensaje de error a ${from}`);
    }
  }
}

const webhookRoutes = new Elysia({ prefix: '/webhook' })
  webhookRoutes.get('/webhook', ({ query }: { query: any }) => {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
      logger.info('Webhook verificado exitosamente');
      return new Response(challenge, { status: 200 });
    } else {
      logger.error('Error en la verificación del webhook');
      return new Response('', { status: 403 });
    }
  });

  // Recepción de mensajes de WhatsApp
  webhookRoutes.post('/webhook', async ({ body }: { body: any }) => {
    if (body.object === 'whatsapp_business_account') {
      const changes = body.entry?.[0]?.changes?.[0];
      if (changes?.field === 'messages') {
        const messages = changes.value.messages;
        if (messages) {
          // Responder inmediatamente a WhatsApp
          // Procesar los mensajes de forma asíncrona
          Promise.all(messages.map((msg: any) => processMessage(msg)))
            .catch(err => logger.error('Error en el procesamiento asíncrono de mensajes:', err));
          return new Response('', { status: 200 });
        } else {
          return new Response('', { status: 200 }); // Responder aunque no haya mensajes
        }
      } else {
        return new Response('', { status: 200 }); // Responder a otros tipos de cambios
      }
    } else {
      // Si no es un webhook de WhatsApp, podría ser una prueba de salud u otra cosa
      return new Response('', { status: 404 });
    }
  });

export default webhookRoutes;