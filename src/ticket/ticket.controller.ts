import { Controller, Post, Get, Param, Body, BadRequestException } from '@nestjs/common';
import { TicketService } from './ticket.service';

@Controller('tickets')
export class TicketController {
  constructor(private ticketService: TicketService) {}

  @Post()
  async purchase(@Body() body: { userId?: string; quantity?: number }) {
    const qty = Math.min(Math.max(Math.floor(body.quantity || 1), 1), 50); // 1–50 tickets max
    try {
      const results = [];
      for (let i = 0; i < qty; i++) {
        const ticket = await this.ticketService.purchaseTicket(body.userId || '');
        results.push(ticket);
      }
      return { tickets: results, count: results.length };
    } catch (err: any) {
      if (err?.message === 'WALLET_NOT_SET') throw new BadRequestException('WALLET_NOT_SET');
      if (err?.message === 'INSUFFICIENT_BALANCE') throw new BadRequestException('INSUFFICIENT_BALANCE');
      throw err;
    }
  }

  @Get('draw/:drawId')
  async getByDraw(@Param('drawId') drawId: string) {
    return this.ticketService.getTicketsByDraw(drawId);
  }

  @Get('user/:userId')
  async getByUser(@Param('userId') userId: string) {
    return this.ticketService.getTicketsByUser(userId);
  }
}
