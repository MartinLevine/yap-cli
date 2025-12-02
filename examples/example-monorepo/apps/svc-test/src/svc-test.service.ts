import { Injectable } from '@nestjs/common';

@Injectable()
export class SvcTestService {
  getHello(): string {
    return 'Hello World - Watch Test 5!';
  }
}
