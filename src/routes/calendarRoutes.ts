import { Elysia } from 'elysia';
import * as calendarService from '../services/calendarService';

const calendarRoutes = new Elysia()
  calendarRoutes.get('/auth/:sellerId', ({ params }: { params: Record<string, string> }) => {
    const { sellerId } = params;
    const authUrl = calendarService.getAuthorizationUrl(sellerId);
    return new Response('', { status: 302, headers: { Location: authUrl } });
  })
  calendarRoutes.get('/oauth2callback', async ({ query }: { query: Record<string, string> }) => {
    const { code, state } = query;
    const sellerId = state;

    try {
      const tokens = await calendarService.getTokensFromCode(code);
      calendarService.setSellerCredentials(sellerId, tokens);
      return new Response('¡Autorización de Google Calendar completada! Ya puedes cerrar esta ventana.', { status: 200 });
    } catch (error) {
      console.error('Error al obtener los tokens de Google Calendar:', error);
      return new Response('Error en la autorización de Google Calendar.', { status: 500 });
    }
  });

export default calendarRoutes;
