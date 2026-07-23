import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // Diagnostic — remove after confirming DATABASE_URL is available on Render
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'mongodb+srv://***' : 'undefined');
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('PORT:', process.env.PORT);

  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: '*',
    credentials: true,
  });
  await app.listen(process.env.PORT || 3001);
}
void bootstrap();
