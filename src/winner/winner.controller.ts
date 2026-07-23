import { Controller, Get, Post, Body } from '@nestjs/common';
import { WinnerService } from './winner.service';

@Controller('winners')
export class WinnerController {
  constructor(private winnerService: WinnerService) {}

  @Get()
  async getRecentWinners() {
    return this.winnerService.getRecentWinners();
  }

  @Post()
  async addWinner(
    @Body() body: { drawId: string; ticketId: string; amount: number },
  ) {
    return this.winnerService.addWinner(
      body.drawId,
      body.ticketId,
      body.amount,
    );
  }
}
