import { Controller, Get } from '@nestjs/common';
import { PriceService } from './price.service';

@Controller('price')
export class PriceController {
  constructor(private priceService: PriceService) {}

  @Get('current')
  async getCurrentData() {
    return this.priceService.getCurrentData();
  }

  @Get('history')
  async getMarketCapHistory() {
    return this.priceService.getMarketCapHistory();
  }
}
