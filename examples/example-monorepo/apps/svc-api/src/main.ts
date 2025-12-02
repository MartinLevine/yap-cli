import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

import { add } from '@libs/test'

async function bootstrap() {
  // const app = await NestFactory.create(AppModule);
  // await app.listen(process.env.PORT ?? 3000);
  console.log(`5 + 3 = ${add(5, 3)}`)
}
bootstrap();
