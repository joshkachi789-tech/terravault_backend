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
    // ── 1. Find the current OPEN draw ────────────────────────────────────────
    const draw = await this.prisma.draw.findFirst({
      where: { status: 'OPEN' },
      include: { tickets: true },
    });

    if (!draw) {
      // No open draw — create one and return
      this.logger.warn('No OPEN draw found. Creating one now.');
      await this.createNextDraw();
      return { status: 'no_draw', message: 'No open draw found. New draw created.' };
    }

    // ── 2. Check if draw time has passed ────────────────────────────────────
    const now = new Date();
    if (now < new Date(draw.drawTime)) {
      return {
        status: 'not_ready',
        message: `Draw ends at ${draw.drawTime.toISOString()}. Not yet.`,
        drawId: draw.id,
      };
    }

    // ── 3. Idempotency lock — prevent duplicate processing ───────────────────
    // Atomically set lockedAt only if it's still null.
    // If another request already set it, this update will match 0 rows.
    const locked = await this.prisma.draw.updateMany({
      where: { id: draw.id, status: 'OPEN', lockedAt: null },
      data: { lockedAt: now },
    });

    if (locked.count === 0) {
      // Already locked or completed by a concurrent request
      return {
        status: 'already_processing',
        message: 'Draw is already being processed or completed.',
        drawId: draw.id,
      };
    }

    this.logger.log(`Processing draw ${draw.id} with ${draw.tickets.length} tickets.`);

    try {
      // ── 4. Select winners ────────────────────────────────────────────────
      const tickets = draw.tickets;
      const shuffled = [...tickets].sort(() => Math.random() - 0.5);
      const winningTickets = shuffled.slice(0, Math.min(WINNERS_PER_DRAW, shuffled.length));

      const prizePerWinner =
        winningTickets.length > 0 ? draw.pool / winningTickets.length : 0;

      // ── 5. Save winners & update balances in a transaction ───────────────
      const winnerRecords = await this.prisma.$transaction(async (tx) => {
        const created = [];
        for (const ticket of winningTickets) {
          const winner = await tx.winner.create({
            data: {
              drawId: draw.id,
              ticketId: ticket.id,
              userId: ticket.userId,
              amount: prizePerWinner,
            },
            include: { user: true },
          });
          await tx.user.update({
            where: { id: ticket.userId },
            data: { balance: { increment: prizePerWinner } },
          });
          created.push(winner);
        }
        return created;
      });

      // ── 6. Mark draw COMPLETED ───────────────────────────────────────────
      const completedDraw = await this.prisma.draw.update({
        where: { id: draw.id },
        data: { status: 'COMPLETED' },
        include: { tickets: true, winners: { include: { user: true } } },
      });

      // ── 7. Create new OPEN draw ──────────────────────────────────────────
      const newDraw = await this.createNextDraw();

      // ── 8. Emit real-time events ─────────────────────────────────────────
      // Winners
      this.events.emit({ type: 'draw_executed', data: completedDraw });

      // Each winner individually (for live winner feed)
      for (const w of winnerRecords) {
        this.events.emit({ type: 'winner_added', data: w });
      }

      // New draw (updates countdown, prize pool, ticket stats)
      this.events.emit({ type: 'draw_created', data: newDraw });

      this.logger.log(
        `Draw ${draw.id} completed. ${winnerRecords.length} winners. New draw: ${newDraw.id}`,
      );

      return {
        status: 'completed',
        message: `Draw processed. ${winnerRecords.length} winner(s). New draw ${newDraw.id} created.`,
        drawId: draw.id,
      };
    } catch (err) {
      // ── 9. On failure: release the lock so it can be retried ────────────
      this.logger.error(`Draw processing failed for ${draw.id}:`, err);
      await this.prisma.draw.update({
        where: { id: draw.id },
        data: { lockedAt: null },
      });
      throw err;
    }
  }

  private async createNextDraw() {
    const draw = await this.prisma.draw.create({
      data: {
        drawTime: new Date(Date.now() + DRAW_DURATION_MS),
      },
      include: { tickets: true, winners: { include: { user: true } } },
    });
    return draw;
  }
}
