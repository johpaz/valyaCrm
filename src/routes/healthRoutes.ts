import healthCheckService from '../services/healthCheckService.js';

export default (app: any) => {
  app.get('/health', async (): Promise<any> => {
    try {
      const servicesStatus = await healthCheckService.checkServicesStatus();
      return {
        status: 'UP',
        timestamp: new Date().toISOString(),
        services: servicesStatus,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return new Response(JSON.stringify({
        status: 'DOWN',
        message: 'One or more services are unhealthy.',
        error: message,
      }), { status: 503 });
    }
  });

  return app;
};
