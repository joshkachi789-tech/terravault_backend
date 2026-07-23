import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const TOTAL_SUPPLY = 500000000; // 500 million
const INITIAL_MARKET_CAP = 3000; // $3000 initial market cap
const INITIAL_TERRA_PRICE = INITIAL_MARKET_CAP / TOTAL_SUPPLY;

@Injectable()
export class PriceService {
  constructor(private prisma: PrismaService) {}

  async getCurrentData() {
    const latestEntry = await this.prisma.priceHistory.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    if (latestEntry) {
      return {
        ...latestEntry,
        marketCap: latestEntry.price * TOTAL_SUPPLY,
      };
    }

    // Create initial entry if none exists
    const initialEntry = await this.prisma.priceHistory.create({
      data: { price: INITIAL_TERRA_PRICE },
    });
    return {
      ...initialEntry,
      marketCap: INITIAL_MARKET_CAP,
    };
  }

  async getMarketCapHistory() {
    const entries = await this.prisma.priceHistory.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return entries.map((entry) => ({
      ...entry,
      marketCap: entry.price * TOTAL_SUPPLY,
    }));
  }
}
