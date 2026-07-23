import { Controller, Post, Get, Param, Body, BadRequestException } from '@nestjs/common';
import { TicketService } from './ticket.service';

@Controller('tickets')
export class TicketController {
  constructor(private ticketService: TicketService) {}

  @Post()
  async purchase(@Body() body: { userId?: string }) {
    try {
      return await this.ticketService.purchaseTicket(body.userId || 'test-user');
    } catch (err: any) {
      if (err?.message === 'WALLET_NOT_SET') {
        throw new BadRequestException('WALLET_NOT_SET');
      }
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
