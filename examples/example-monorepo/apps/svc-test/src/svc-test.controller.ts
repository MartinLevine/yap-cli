import { Controller, Get } from '@nestjs/common';
import { SvcTestService } from './svc-test.service';

@Controller()
export class SvcTestController {
  constructor(private readonly svcTestService: SvcTestService) {}

  @Get()
  getHello(): string {
    return this.svcTestService.getHello();
  }
}
