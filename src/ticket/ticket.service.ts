import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { DrawService } from '../draw/draw.service';

const TICKET_PRICE = 5;
const TERRA_PER_TICKET = 10;
const REFERRAL_TERRA_REWARD = 5; // $TERRA awarded to referrer per referred user's ticket purchase
const POOL_CONTRIBUTION = TICKET_PRICE * 0.6;
const MARKET_CAP_CONTRIBUTION = TICKET_PRICE * 0.4; // 40% goes to market cap increase
const TOTAL_SUPPLY = 500000000; // 500 million
const INITIAL_MARKET_CAP = 3000; // $3000 initial market cap
const INITIAL_TERRA_PRICE = INITIAL_MARKET_CAP / TOTAL_SUPPLY;

@Injectable()
export class TicketService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
    private drawService: DrawService,
  ) {}

  private async getCurrentMarketCap(): Promise<number> {
    const latestEntry = await this.prisma.priceHistory.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    if (latestEntry) return latestEntry.price * TOTAL_SUPPLY;

    // No history, create initial entry
    await this.prisma.priceHistory.create({
      data: { price: INITIAL_TERRA_PRICE },
    });
    return INITIAL_MARKET_CAP;
  }

  private async updateMarketCap(): Promise<number> {
    const currentMarketCap = await this.getCurrentMarketCap();
    const newMarketCap = currentMarketCap + MARKET_CAP_CONTRIBUTION;
    const newPrice = newMarketCap / TOTAL_SUPPLY;
    const priceEntry = await this.prisma.priceHistory.create({
      data: { price: newPrice },
    });

    // Emit update event
    this.events.emit({
      type: 'price_updated',
      data: { marketCap: newMarketCap, priceEntry },
    });

    return newMarketCap;
  }

  async purchaseBulkTickets(userId: string, quantity: number) {
    const openDraw = await this.drawService.getOpenDraw();
    if (!openDraw) throw new Error('No open draw');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');
    if (!user.wallet) throw new Error('WALLET_NOT_SET');

    const totalCost = TICKET_PRICE * quantity;
    if (user.balance < totalCost) throw new Error('INSUFFICIENT_BALANCE');

    const totalPoolContribution = POOL_CONTRIBUTION * quantity;
    const totalTerra = TERRA_PER_TICKET * quantity;
    const totalMarketCapIncrease = MARKET_CAP_CONTRIBUTION * quantity;

    // ── Single transaction: create all tickets + update user in one shot ──
    const tickets = await this.prisma.$transaction(async (tx) => {
      // Create tickets sequentially (MongoDB transactions don't support Promise.all)
      const created = [];
      for (let i = 0; i < quantity; i++) {
        const t = await tx.ticket.create({
          data: { userId: user.id, drawId: openDraw.id },
        });
        created.push(t);
      }

      // Deduct balance and award TERRA in one update
      await tx.user.update({
        where: { id: user.id },
        data: {
          balance: { decrement: totalCost },
          terra: { increment: totalTerra },
        },
      });

      // Referral reward (one update for all tickets combined)
      if (user.referredBy) {
        await tx.user.update({
          where: { id: user.referredBy },
          data: { terra: { increment: REFERRAL_TERRA_REWARD * quantity } },
        });
      }

      return created;
    }, { timeout: 30000 }); // 30s timeout for large bulk purchases

    // Update draw pool once
    await this.drawService.updateDrawPool(openDraw.id, totalPoolContribution);

    // Update market cap once with combined contribution
    const currentMarketCap = await this.getCurrentMarketCap();
    const newMarketCap = currentMarketCap + totalMarketCapIncrease;
    const newPrice = newMarketCap / TOTAL_SUPPLY;
    const priceEntry = await this.prisma.priceHistory.create({
      data: { price: newPrice },
    });
    this.events.emit({ type: 'price_updated', data: { marketCap: newMarketCap, priceEntry } });

    // Referral event
    if (user.referredBy) {
      this.events.emit({
        type: 'referral_reward',
        data: { referrerId: user.referredBy, referredUserId: user.id, terra: REFERRAL_TERRA_REWARD * quantity },
      });
    }

    return tickets;
  }

  async purchaseTicket(userId: string) {
    return (await this.purchaseBulkTickets(userId, 1))[0];
  }

  async getTicketsByDraw(drawId: string) {
    return this.prisma.ticket.findMany({
      where: { drawId },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTicketsByUser(userId: string) {
    return this.prisma.ticket.findMany({
      where: { userId },
      include: { user: true, draw: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
