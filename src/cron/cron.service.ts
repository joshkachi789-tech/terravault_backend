import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';

const WINNERS_PER_DRAW = 10;
const DRAW_DURATION_MS = 48 * 60 * 60 * 1000; // 48 hours

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);
  // In-memory lock to prevent concurrent processing on same instance
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  async processDraw(): Promise<{ status: string; message: string; drawId?: string }> {
    // ── 1. In-memory guard (prevents same instance running twice) ────────────
    if (this.processing) {
      return { status: 'already_processing', message: 'Already running on this instance.' };
    }

    // ── 2. Find OPEN draw ────────────────────────────────────────────────────
    const draw = await this.prisma.draw.findFirst({
      where: { status: 'OPEN' },
    });

    if (!draw) {
      this.logger.warn('No OPEN draw found. Creating one now.');
      await this.createNextDraw();
      return { status: 'no_draw', message: 'No open draw found. New draw created.' };
    }

    // ── 3. Check if draw time has passed ─────────────────────────────────────
    const now = new Date();
    if (now < new Date(draw.drawTime)) {
      return {
        status: 'not_ready',
        message: `Draw ends at ${draw.drawTime.toISOString()}. Not yet.`,
        drawId: draw.id,
      };
    }

    // ── 4. Set in-memory lock + mark draw as PROCESSING atomically ────────────
    this.processing = true;

    // Use status='PROCESSING' as the DB-level lock (avoids MongoDB null-filter issues)
    const locked = await this.prisma.draw.updateMany({
      where: { id: draw.id, status: 'OPEN' },
      data: { status: 'PROCESSING', lockedAt: now },
    });

    if (locked.count === 0) {
      this.processing = false;
      return {
        status: 'already_processing',
        message: 'Draw is already being processed by another request.',
        drawId: draw.id,
      };
    }

    this.logger.log(`Processing draw ${draw.id}.`);

    try {
      // ── 5. Fetch ticket IDs ──────────────────────────────────────────────
      const tickets = await this.prisma.ticket.findMany({
        where: { drawId: draw.id },
        select: { id: true, userId: true },
      });

      // ── 6. Select winners ────────────────────────────────────────────────
      const shuffled = [...tickets].sort(() => Math.random() - 0.5);
      const winningTickets = shuffled.slice(0, Math.min(WINNERS_PER_DRAW, shuffled.length));
      const prizePerWinner = winningTickets.length > 0 ? draw.pool / winningTickets.length : 0;

      // ── 7. Save winners & update balances ────────────────────────────────
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
      }, { timeout: 30000 });

      // ── 8. Mark COMPLETED ─────────────────────────────────────────────────
      await this.prisma.draw.update({
        where: { id: draw.id },
        data: { status: 'COMPLETED' },
      });

      // ── 9. Create new draw ────────────────────────────────────────────────
      const newDraw = await this.createNextDraw();

      // ── 10. Emit SSE events ───────────────────────────────────────────────
      this.events.emit({
        type: 'draw_executed',
        data: { drawId: draw.id, winnersCount: winningTickets.length, pool: draw.pool },
      });
      this.events.emit({
        type: 'draw_created',
        data: { id: newDraw.id, drawTime: newDraw.drawTime, pool: 0 },
      });

      this.logger.log(
        `Draw ${draw.id} completed. ${winningTickets.length} winner(s). New draw: ${newDraw.id}`,
      );

      return {
        status: 'completed',
        message: `Draw processed. ${winningTickets.length} winner(s). New draw created.`,
        drawId: draw.id,
      };
    } catch (err) {
      // ── On failure: revert status back to OPEN so it can be retried ──────
      this.logger.error(`Draw processing failed for ${draw.id}:`, err);
      await this.prisma.draw.update({
        where: { id: draw.id },
        data: { status: 'OPEN', lockedAt: null },
      });
      throw err;
    } finally {
      this.processing = false;
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
