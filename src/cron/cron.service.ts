import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';

const WINNERS_PER_DRAW = 10;
const DRAW_DURATION_MS = 48 * 60 * 60 * 1000; // 48 hours

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  async processDraw(): Promise<{ status: string; message: string; drawId?: string }> {
    // ── 1. Find the current OPEN draw (no includes — just IDs and fields) ───
    const draw = await this.prisma.draw.findFirst({
      where: { status: 'OPEN' },
    });

    if (!draw) {
      this.logger.warn('No OPEN draw found. Creating one now.');
      await this.createNextDraw();
      return { status: 'no_draw', message: 'No open draw found. New draw created.' };
    }

    // ── 2. Check if draw time has passed ─────────────────────────────────────
    const now = new Date();
    if (now < new Date(draw.drawTime)) {
      return {
        status: 'not_ready',
        message: `Draw ends at ${draw.drawTime.toISOString()}. Not yet.`,
        drawId: draw.id,
      };
    }

    // ── 3. Idempotency lock ───────────────────────────────────────────────────
    const locked = await this.prisma.draw.updateMany({
      where: { id: draw.id, status: 'OPEN', lockedAt: null },
      data: { lockedAt: now },
    });

    if (locked.count === 0) {
      return {
        status: 'already_processing',
        message: 'Draw is already being processed or completed.',
        drawId: draw.id,
      };
    }

    // ── 4. Fetch only ticket IDs (no user data) ───────────────────────────────
    const tickets = await this.prisma.ticket.findMany({
      where: { drawId: draw.id },
      select: { id: true, userId: true },
    });

    this.logger.log(`Processing draw ${draw.id} with ${tickets.length} tickets.`);

    try {
      // ── 5. Select winners ─────────────────────────────────────────────────
      const shuffled = [...tickets].sort(() => Math.random() - 0.5);
      const winningTickets = shuffled.slice(0, Math.min(WINNERS_PER_DRAW, shuffled.length));
      const prizePerWinner =
        winningTickets.length > 0 ? draw.pool / winningTickets.length : 0;

      // ── 6. Save winners & update balances in a transaction ────────────────
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
      });

      // ── 7. Mark draw COMPLETED ────────────────────────────────────────────
      await this.prisma.draw.update({
        where: { id: draw.id },
        data: { status: 'COMPLETED' },
      });

      // ── 8. Create new OPEN draw ───────────────────────────────────────────
      const newDraw = await this.createNextDraw();

      // ── 9. Emit minimal SSE events (no bulk user/ticket data) ─────────────
      this.events.emit({
        type: 'draw_executed',
        data: { drawId: draw.id, winnersCount: winningTickets.length, pool: draw.pool },
      });
      this.events.emit({
        type: 'draw_created',
        data: { id: newDraw.id, drawTime: newDraw.drawTime, pool: 0 },
      });

      this.logger.log(
        `Draw ${draw.id} completed. ${winningTickets.length} winners. New draw: ${newDraw.id}`,
      );

      // ── 10. Return minimal response ───────────────────────────────────────
      return {
        status: 'completed',
        message: `Draw processed. ${winningTickets.length} winner(s). New draw created.`,
        drawId: draw.id,
      };
    } catch (err) {
      // Release lock on failure so next cron call can retry
      this.logger.error(`Draw processing failed for ${draw.id}:`, err);
      await this.prisma.draw.update({
        where: { id: draw.id },
        data: { lockedAt: null },
      });
      throw err;
    }
  }

  private async createNextDraw() {
    return this.prisma.draw.create({
      data: {
        drawTime: new Date(Date.now() + DRAW_DURATION_MS),
      },
    });
  }
}
