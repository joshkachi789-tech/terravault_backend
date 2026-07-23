import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';

@Injectable()
export class DrawService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
  ) {}

  async onModuleInit() {
    // Ensure we have an open draw
    let openDraw = await this.prisma.draw.findFirst({
      where: { status: 'OPEN' },
      include: { tickets: true, winners: { include: { user: true } } },
    });
    if (!openDraw) {
      openDraw = await this.createDraw();
    }
  }

  async createDraw() {
    const draw = await this.prisma.draw.create({
      data: {
        drawTime: new Date(Date.now() + 48 * 60 * 60 * 1000),
      },
      include: { tickets: true, winners: { include: { user: true } } },
    });
    this.events.emit({ type: 'draw_created', data: draw });
    return draw;
  }

  async getOpenDraw() {
    return this.prisma.draw.findFirst({
      where: { status: 'OPEN' },
      include: { tickets: true, winners: { include: { user: true } } },
    });
  }

  async getAllDraws() {
    return this.prisma.draw.findMany({
      orderBy: { createdAt: 'desc' },
      include: { tickets: true, winners: { include: { user: true } } },
    });
  }

  async updateDrawPool(drawId: string, amount: number) {
    const draw = await this.prisma.draw.update({
      where: { id: drawId },
      data: { pool: { increment: amount } },
      include: { tickets: true, winners: { include: { user: true } } },
    });
    this.events.emit({ type: 'ticket_purchased', data: draw });
    return draw;
  }

  async executeDraw(drawId: string) {
    const draw = await this.prisma.draw.findUnique({
      where: { id: drawId },
      include: {
        tickets: true,
        winners: true, // check for existing winners
      },
    });
    if (!draw) throw new Error('Draw not found');
    if (draw.status !== 'OPEN') throw new Error(`Draw is already ${draw.status}`);

    // Filter out tickets that already have a winner (partial execution guard)
    const existingWinnerTicketIds = new Set(draw.winners.map((w) => w.ticketId));
    const eligibleTickets = draw.tickets.filter(
      (t) => !existingWinnerTicketIds.has(t.id),
    );

    // Select up to 10 random winning tickets from eligible ones
    const shuffled = [...eligibleTickets].sort(() => Math.random() - 0.5);
    const winningTickets = shuffled.slice(0, Math.max(0, 10 - draw.winners.length));

    const prizePerWinner =
      winningTickets.length > 0 ? draw.pool / winningTickets.length : 0;

    // Use a transaction — all or nothing
    await this.prisma.$transaction(async (tx) => {
      for (const ticket of winningTickets) {
        await tx.winner.create({
          data: {
            drawId: draw.id,
            ticketId: ticket.id,
            userId: ticket.userId,
            amount: prizePerWinner,
          },
        });
        await tx.user.update({
          where: { id: ticket.userId },
          data: { balance: { increment: prizePerWinner } },
        });
      }

      // Mark draw COMPLETED
      await tx.draw.update({
        where: { id: drawId },
        data: { status: 'COMPLETED' },
      });
    });

    const updatedDraw = await this.prisma.draw.findUnique({
      where: { id: drawId },
      include: { tickets: true, winners: { include: { user: true } } },
    });

    // Create new open draw
    await this.createDraw();

    this.events.emit({ type: 'draw_executed', data: updatedDraw });

    return updatedDraw;
  }
}
