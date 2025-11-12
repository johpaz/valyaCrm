import mongoose from 'mongoose';
import { HealthCheckResponse } from '../types/index';

class HealthCheckService {
  async checkServicesStatus(): Promise<HealthCheckResponse> {
    const services: HealthCheckResponse = {
      database: {
        status: 'DOWN',
        message: 'MongoDB connection is not established.',
      },
      google: {
        status: 'DOWN',
        message: 'Google API credentials (CLIENT_ID, CLIENT_SECRET) are not configured.',
      },
      gemini: {
        status: 'DOWN',
        message: 'Gemini API key is not configured.',
      },
      openai: {
        status: 'DOWN',
        message: 'OpenAI API key is not configured.',
      },
      resend: {
        status: 'DOWN',
        message: 'Resend API key is not configured.',
      },
    };

    // 1. Check Database Connection
    if (mongoose.connection.readyState === 1) {
      services.database.status = 'OK' as const;
      services.database.message = 'MongoDB connection is healthy.';
    }

    // 2. Check Google Credentials
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      services.google.status = 'OK' as const;
      services.google.message = 'Google API credentials are configured.';
    }

    // 3. Check Gemini API Key
    if (process.env.GEMINI_API_KEY) {
      services.gemini.status = 'OK' as const;
      services.gemini.message = 'Gemini API key is configured.';
    }

    // 4. Check OpenAI API Key
    if (process.env.OPENAI_API_KEY) {
      services.openai.status = 'OK' as const;
      services.openai.message = 'OpenAI API key is configured.';
    } else {
        services.openai.status = 'NOT_IN_USE' as const;
        services.openai.message = 'OpenAI API key is not configured, but this may be intentional.';
    }

    // 5. Check Resend API Key
    if (process.env.RESEND_API_KEY) {
      services.resend.status = 'OK' as const;
      services.resend.message = 'Resend API key is configured.';
    }

    return services;
  }
}

export default new HealthCheckService();
