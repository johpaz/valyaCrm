import { google } from 'googleapis';
const { OAuth2 } = google.auth;
import logger from '../utils/logger.js';

const oAuth2Client = new OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URL
);

// Aquí almacenaremos los tokens de los vendedores. En un entorno de producción, esto debería estar en una base de datos.
const sellerTokens: Record<string, any> = {};

function setSellerCredentials(sellerId: string, tokens: any) {
  logger.debug(`Setting credentials for seller ${sellerId}`);
  sellerTokens[sellerId] = tokens;
}

function getAuthorizationUrl(sellerId: string): string {
  logger.debug(`Generating authorization URL for seller ${sellerId}`);
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar'],
    state: sellerId,
  });
  return authUrl;
}

async function getTokensFromCode(code: string): Promise<any> {
  logger.debug(`Getting tokens from code`);
  const { tokens } = await oAuth2Client.getToken(code);
  logger.debug(`Tokens received`);
  return tokens;
}

async function createEvent(sellerId: string, event: any): Promise<any> {
  logger.debug(`Attempting to create calendar event for seller: ${sellerId}`);
  logger.debug(`Event data: ${JSON.stringify(event, null, 2)}`);

  if (!sellerTokens[sellerId]) {
    logger.error(`Authentication failed for seller ${sellerId}: No tokens found.`);
    throw new Error('Vendedor no autenticado. Por favor, autorice el acceso a Google Calendar.');
  }
  
  logger.debug(`Tokens found for seller ${sellerId}. Setting credentials.`);
  oAuth2Client.setCredentials(sellerTokens[sellerId]);
  const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

  try {
    logger.debug('Sending request to Google Calendar API...');
    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
    });
    logger.info(`Event successfully created for seller ${sellerId}. Link: ${response.data.htmlLink}`);
    return response.data;
  } catch (error: unknown) {
    const err = error as Error;
    logger.error(`Error creating Google Calendar event for seller ${sellerId}: ${err.message}`);
    logger.debug(`Error stack: ${err.stack}`);
    // Devolver un error más informativo
    throw new Error(`Error al interactuar con la API de Google Calendar: ${err.message}`);
  }
}

async function listEvents(sellerId: string, timeMin: string, timeMax: string): Promise<any[]> {
  logger.debug(`Listing events for seller ${sellerId} from ${timeMin} to ${timeMax}`);
  logger.debug(`sellerId: ${sellerId}, type: ${typeof sellerId}`);
  logger.debug(`sellerTokens keys: ${Object.keys(sellerTokens)}`);

  if (!sellerTokens[sellerId]) {
    logger.error(`Authentication failed for seller ${sellerId}: No tokens found.`);
    throw new Error('Vendedor no autenticado. Por favor, autorice el acceso a Google Calendar.');
  }

  oAuth2Client.setCredentials(sellerTokens[sellerId]);
  const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

  try {
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin,
      timeMax: timeMax,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    logger.info(`${events.length} events found for seller ${sellerId}.`);
    return events;
  } catch (error: unknown) {
    const err = error as Error;
    logger.error(`Error listing Google Calendar events for seller ${sellerId}: ${err.message}`);
    logger.debug(`Error stack: ${err.stack}`);
    throw new Error(`Error al obtener eventos del calendario: ${err.message}`);
  }
}

export {
  setSellerCredentials,
  getAuthorizationUrl,
  getTokensFromCode,
  createEvent,
  listEvents,
};
