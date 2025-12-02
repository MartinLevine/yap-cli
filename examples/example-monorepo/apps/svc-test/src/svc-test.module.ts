import { Module } from '@nestjs/common';
import { SvcTestController } from './svc-test.controller';
import { SvcTestService } from './svc-test.service';

@Module({
  imports: [],
  controllers: [SvcTestController],
  providers: [SvcTestService],
})
export class SvcTestModule {}
