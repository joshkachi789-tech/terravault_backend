import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type Transaction = {
  type: string;
  ref: string;
  amount: string;
  time: Date;
};

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async getUserStats(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { tickets: true, winners: true },
    });
    if (!user) throw new Error('User not found');

    const totalWinnings = user.winners.reduce((sum, w) => sum + w.amount, 0);
    const activeTickets = user.tickets.filter((t) => t.status === 'ACTIVE');

    const openDraw = await this.prisma.draw.findFirst({ where: { status: 'OPEN' } });
    const currentDrawTickets = openDraw
      ? user.tickets.filter((t) => t.drawId === openDraw.id).length
      : 0;

    return {
      balance: user.balance,
      terra: user.terra,
      currentDrawTickets,
      totalWinnings,
      activeTickets: activeTickets.map((t) => ({
        id: t.id,
        drawId: t.drawId,
        status: t.status,
      })),
    };
  }

  async getUserReferral(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        referrals: {
          include: { tickets: true },
        },
      },
    });
    if (!user) throw new Error('User not found');

    const totalReferrals = user.referrals.length;
    const terraEarned = user.referrals.reduce(
      (sum, r) => sum + r.tickets.length * 5,
      0,
    );

    return {
      referralCode: user.referralCode,
      totalReferrals,
      terraEarned,
      referrals: user.referrals.map((r) => ({
        name: r.name || 'Anonymous',
        ticketsBought: r.tickets.length,
        terraGenerated: r.tickets.length * 5,
        joinedAt: r.createdAt,
      })),
    };
  }

  async getTransactionHistory(userId: string) {
    const deposits = await this.prisma.deposit.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    const tickets = await this.prisma.ticket.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    const winners = await this.prisma.winner.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const transactions: Transaction[] = [];

    deposits.forEach((d) => {
      transactions.push({
        type: 'DEPOSIT',
        ref: d.txHash.slice(0, 6) + '…' + d.txHash.slice(-4),
        amount: `+$${d.amount.toFixed(2)}`,
        time: d.createdAt,
      });
    });

    tickets.forEach((t) => {
      transactions.push({
        type: 'TICKET PURCHASE',
        ref: t.id,
        amount: `-$5.00`,
        time: t.createdAt,
      });
      transactions.push({
        type: '$TERRA REWARD',
        ref: t.id,
        amount: `+10`,
        time: t.createdAt,
      });
    });

    winners.forEach((w) => {
      transactions.push({
        type: 'WINNING',
        ref: w.ticketId,
        amount: `+$${w.amount.toFixed(2)}`,
        time: w.createdAt,
      });
    });

    transactions.sort(
      (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
    );
    return transactions;
  }

  async getUserProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, wallet: true, role: true, referralCode: true },
    });
    if (!user) throw new Error('User not found');
    return user;
  }

  async updateProfile(userId: string, data: { name?: string; wallet?: string }) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.wallet !== undefined && { wallet: data.wallet.trim() || null }),
      },
      select: { id: true, email: true, name: true, wallet: true, role: true },
    });
    return updated;
  }

  async submitDeposit(userId: string, txHash: string, amount: number, asset = 'USDT') {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');
    if (!user.wallet) throw new Error('WALLET_NOT_SET');

    const validAssets = ['USDT', 'BNB'];
    const normalizedAsset = validAssets.includes(asset?.toUpperCase())
      ? asset.toUpperCase()
      : 'USDT';

    return this.prisma.deposit.create({
      data: { userId, txHash, amount, asset: normalizedAsset, status: 'PENDING' },
    });
  }

  async requestWithdrawal(userId: string, amount: number, asset: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');
    if (!user.wallet) throw new Error('WALLET_NOT_SET');
    if (user.balance < amount) throw new Error('INSUFFICIENT_BALANCE');
    if (amount <= 0) throw new Error('INVALID_AMOUNT');

    const validAssets = ['USDT', 'BNB'];
    const normalizedAsset = validAssets.includes(asset?.toUpperCase())
      ? asset.toUpperCase() : 'USDT';

    // Deduct balance immediately and hold pending
    await this.prisma.user.update({
      where: { id: userId },
      data: { balance: { decrement: amount } },
    });

    return this.prisma.withdrawal.create({
      data: {
        userId,
        amount,
        walletAddress: user.wallet,
        asset: normalizedAsset,
        status: 'PENDING',
      },
    });
  }

  async getUserWithdrawals(userId: string) {
    return this.prisma.withdrawal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAllWithdrawals() {
    return this.prisma.withdrawal.findMany({
      include: { user: { select: { email: true, name: true, wallet: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approveWithdrawal(withdrawalId: string, txHash?: string) {
    const withdrawal = await this.prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
    if (!withdrawal) throw new Error('Withdrawal not found');
    if (withdrawal.status !== 'PENDING') throw new Error('Already processed');

    return this.prisma.withdrawal.update({
      where: { id: withdrawalId },
      data: { status: 'APPROVED', txHash: txHash || null },
    });
  }

  async rejectWithdrawal(withdrawalId: string, note?: string) {
    const withdrawal = await this.prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
    if (!withdrawal) throw new Error('Withdrawal not found');
    if (withdrawal.status !== 'PENDING') throw new Error('Already processed');

    // Refund the balance back to the user
    await this.prisma.user.update({
      where: { id: withdrawal.userId },
      data: { balance: { increment: withdrawal.amount } },
    });

    return this.prisma.withdrawal.update({
      where: { id: withdrawalId },
      data: { status: 'REJECTED', note: note || null },
    });
  }

  async getUserDeposits(userId: string) {
    return this.prisma.deposit.findMany({
      where: { userId },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getUserRewards(userId: string) {
    const tickets = await this.prisma.ticket.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return tickets.map((t) => ({
      type: 'TICKET REWARD',
      ref: t.id,
      terra: 10,
      time: t.createdAt,
    }));
  }

  async getAdminOverview() {
    const pendingDeposits = await this.prisma.deposit.count({
      where: { status: 'PENDING' },
    });
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const tickets48h = await this.prisma.ticket.count({
      where: { createdAt: { gte: twoDaysAgo } },
    });
    const openDraw = await this.prisma.draw.findFirst({ where: { status: 'OPEN' } });

    return {
      pendingDeposits,
      tickets48h,
      prizePool: openDraw ? openDraw.pool : 0,
    };
  }

  async getAdminStats() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const newUsers = await this.prisma.user.count({
      where: { createdAt: { gte: sevenDaysAgo } },
    });
    const totalDeposits = await this.prisma.deposit.aggregate({
      where: { status: 'APPROVED', createdAt: { gte: sevenDaysAgo } },
      _sum: { amount: true },
    });
    const totalTickets = await this.prisma.ticket.count({
      where: { createdAt: { gte: sevenDaysAgo } },
    });

    return {
      newUsers,
      totalDeposits: totalDeposits._sum.amount || 0,
      totalTickets,
    };
  }

  async getAllUsers() {
    return this.prisma.user.findMany({
      include: { tickets: true, deposits: true, winners: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approveDeposit(depositId: string) {
    const deposit = await this.prisma.deposit.findUnique({ where: { id: depositId } });
    if (!deposit) throw new Error('Deposit not found');

    await this.prisma.user.update({
      where: { id: deposit.userId },
      data: { balance: { increment: deposit.amount } },
    });

    return this.prisma.deposit.update({
      where: { id: depositId },
      data: { status: 'APPROVED' },
    });
  }

  async rejectDeposit(depositId: string) {
    return this.prisma.deposit.update({
      where: { id: depositId },
      data: { status: 'REJECTED' },
    });
  }

  async getAllWinners() {
    return this.prisma.winner.findMany({
      include: { user: true, ticket: true, draw: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAllDeposits() {
    return this.prisma.deposit.findMany({
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
