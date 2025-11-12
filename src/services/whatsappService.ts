import logger from '../utils/logger.js';


interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  baseUrl: string;
  headers: Record<string, string>;
}

class WhatsAppService {
  private config: WhatsAppConfig;

  constructor() {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!accessToken || !phoneNumberId) {
      throw new Error('WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID deben estar configurados');
    }

    this.config = {
      accessToken,
      phoneNumberId,
      baseUrl: `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    };

    logger.info('Servicio de WhatsApp inicializado correctamente');
  }

  /**
   * Envía un mensaje de texto a WhatsApp
   * @param {string} to - Número de teléfono del destinatario
   * @param {string} message - Mensaje a enviar
   * @returns {Promise<Object>} - Respuesta de la API de WhatsApp
   */
  async sendMessage(to: string, message: string): Promise<any> {
    try {
      logger.info(`Enviando mensaje a ${to}: ${message.substring(0, 100)}...`);

      const payload = {
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: {
          body: message
        }
      };

     const response = await fetch(this.config.baseUrl, {
        method: 'POST',
        headers: this.config.headers,
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      logger.info(`Mensaje enviado exitosamente a ${to}: ${JSON.stringify(data)}`);
      return data;
    } catch (error) {
      logger.error(`Error enviando mensaje: ${(error as Error).message}`);
      throw new Error(`Error enviando mensaje: ${(error as Error).message}`);
    }
  }

  /**
   * Envía un mensaje con botones interactivos
   * @param {string} to - Número de teléfono del destinatario
   * @param {string} bodyText - Texto principal del mensaje
   * @param {string[]} buttons - Array de botones (máximo 3)
   * @returns {Promise<any>} - Respuesta de la API de WhatsApp
   */
  async sendInteractiveMessage(to: string, bodyText: string, buttons: string[]): Promise<any> {
    try {
      logger.info(`Enviando mensaje interactivo a ${to}`);

      if (buttons.length > 3) {
        throw new Error('WhatsApp permite máximo 3 botones por mensaje');
      }

      const payload = {
        messaging_product: 'whatsapp',
        to: to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: {
            text: bodyText
          },
          action: {
            buttons: buttons.map((button, index) => ({
              type: 'reply',
              reply: {
                id: `btn_${index}`,
                title: button
              }
            }))
          }
        }
      };

      const response = await fetch(this.config.baseUrl, {
        method: 'POST',
        headers: this.config.headers,
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      logger.info(`Mensaje interactivo enviado exitosamente a ${to}`);
      return data;
    } catch (error) {
      logger.error(`Error enviando mensaje interactivo: ${(error as Error).message}`);
      throw new Error(`Error enviando mensaje interactivo: ${(error as Error).message}`);
    }
  }

  /**
   * Envía una imagen con caption
   * @param {string} to - Número de teléfono del destinatario
   * @param {string} imageUrl - URL de la imagen
   * @param {string} caption - Texto que acompaña la imagen
   * @returns {Promise<any>} - Respuesta de la API de WhatsApp
   */
  async sendImage(to: string, imageUrl: string, caption: string = ''): Promise<any> {
    try {
      logger.info(`Enviando imagen a ${to}: ${imageUrl}`);

      const payload = {
        messaging_product: 'whatsapp',
        to: to,
        type: 'image',
        image: {
          link: imageUrl,
          caption: caption
        }
      };

      const response = await fetch(this.config.baseUrl, {
        method: 'POST',
        headers: this.config.headers,
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      logger.info(`Imagen enviada exitosamente a ${to}`);
      return data;
    } catch (error) {
      logger.error(`Error enviando imagen: ${(error as Error).message}`);
      throw new Error(`Error enviando imagen: ${(error as Error).message}`);
    }
  }

  /**
   * Marca un mensaje como leído
   * @param {string} messageId - ID del mensaje a marcar como leído
   * @returns {Promise<any>} - Respuesta de la API de WhatsApp
   */
  async markAsRead(messageId: string): Promise<any> {
    try {
      const payload = {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId
      };

      const response = await fetch(this.config.baseUrl, {
        method: 'POST',
        headers: this.config.headers,
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      logger.info(`Mensaje ${messageId} marcado como leído`);
      return data;
    } catch (error) {
      logger.error(`Error marcando mensaje como leído: ${(error as Error).message}`);
      // No lanzamos error aquí porque marcar como leído no es crítico
    }
  }

  /**
   * Obtiene información del perfil de un usuario
   * @param {string} phoneNumber - Número de teléfono del usuario
   * @returns {Promise<any>} - Información del perfil
   */
  async getUserProfile(phoneNumber: string): Promise<any> {
    try {
      const url = `https://graph.facebook.com/v21.0/${phoneNumber}`;
      const response = await fetch(url, { headers: this.config.headers });
      const data = await response.json();

      logger.info(`Perfil obtenido para ${phoneNumber}`);
      return data;
    } catch (error) {
      logger.error(`Error obteniendo perfil de usuario: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Valida si un mensaje es válido para procesar
   * @param {any} message - Objeto del mensaje de WhatsApp
   * @returns {boolean} - True si el mensaje es válido
   */
  isValidMessage(message: any): boolean {
    // Ignorar mensajes del propio bot
    if (message.from === this.config.phoneNumberId) {
      return false;
    }

    // Solo procesar mensajes de texto por ahora
    if (message.type !== 'text') {
      logger.info(`Tipo de mensaje no soportado: ${message.type}`);
      return false;
    }

    // Verificar que el mensaje tenga contenido
    if (!message.text || !message.text.body) {
      logger.info('Mensaje sin contenido de texto');
      return false;
    }

    return true;
  }
}

export default new WhatsAppService();

