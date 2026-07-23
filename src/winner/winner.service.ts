import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { DrawService } from '../draw/draw.service';

@Injectable()
export class WinnerService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
    private drawService: DrawService,
  ) {}

  async getRecentWinners() {
    return this.prisma.winner.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: { user: true, draw: true },
    });
  }

  async addWinner(drawId: string, ticketId: string, amount: number) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { user: true },
    });
    if (!ticket) throw new Error('Ticket not found');

    const winner = await this.prisma.winner.create({
      data: {
        drawId,
        ticketId,
        userId: ticket.userId,
        amount,
      },
      include: { user: true, draw: true },
    });

    // Update ticket status
    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { status: 'WON' },
    });

    this.events.emit({ type: 'winner_added', data: winner });
    return winner;
  }
}
