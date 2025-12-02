import { NestFactory } from '@nestjs/core';
import { SvcTestModule } from './svc-test.module';

async function bootstrap() {
  const app = await NestFactory.create(SvcTestModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
