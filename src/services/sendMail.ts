import { Resend } from 'resend';
import logger from '../utils/logger.js';
import { EmailOptions } from '../types/index.js';

const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async ({ to, subject, htmlBody }: EmailOptions): Promise<any> => {
  try {
    const { data, error } = await resend.emails.send({
      from: 'Valya - Tu Asistente de Ventas IA <valya@tuprofedeia.com.co>',
      to: to,
      subject: subject,
      html: htmlBody,
    });

    if (error) {
      throw new Error(`Error al enviar el correo: ${error.message}`);
    }

    logger.debug({ data }, 'Correo enviado con éxito');
    return data;

  } catch (error) {
    console.error('Error en sendEmail:', error);
    throw error;
  }
};

export { sendEmail };
