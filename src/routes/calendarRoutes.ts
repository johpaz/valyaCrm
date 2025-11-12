import * as calendarService from '../services/calendarService';

interface AuthParams {
  sellerId: string;
}

interface CallbackQuery {
  code: string;
  state: string;
}

export default (app: any) => {
  // Iniciar el proceso de autorización de Google Calendar
  app.get('/auth/:sellerId', ({ params }: { params: AuthParams }) => {
    const { sellerId } = params;
    const authUrl = calendarService.getAuthorizationUrl(sellerId);
    return new Response('', { status: 302, headers: { Location: authUrl } });
  });

  // Callback de Google después de la autorización
  app.get('/oauth2callback', async ({ query }: { query: CallbackQuery }) => {
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

  return app;
};
