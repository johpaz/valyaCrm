import connectDB from './src/config/database.js';
import AgentService from './src/langchain/agentService.js';

async function testPerformance() {
  console.log('Iniciando prueba de rendimiento...');

  // Conectar a la base de datos
  await connectDB();

  const agentService = new AgentService();
  const phoneNumber = '573102403592';
  const message = 'hola';

  const startTime = performance.now();

  try {
    const response = await agentService.handleMessage(phoneNumber, message);
    const endTime = performance.now();

    console.log(`Respuesta: ${response}`);
    console.log(`Tiempo total de respuesta: ${(endTime - startTime).toFixed(2)}ms`);

  } catch (error) {
    console.error('Error en la prueba:', error);
  }
}

testPerformance();