import { Controller, Get, Param, Post, Body, Patch } from '@nestjs/common';
import { UserService } from './user.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('users')
export class UserController {
  constructor(
    private userService: UserService,
    private prisma: PrismaService,
  ) {}

  // ─── Admin routes MUST come before /:id routes ───────────────────────────
  // NestJS matches top-to-bottom; if /:id routes came first, "admin" would be
  // treated as a user ID and these endpoints would never be reached.

  @Get('admin/overview')
  async getAdminOverview() {
    return this.userService.getAdminOverview();
  }

  @Get('admin/stats')
  async getAdminStats() {
    return this.userService.getAdminStats();
  }

  @Get('admin/users')
  async getAllUsers() {
    return this.userService.getAllUsers();
  }

  @Get('admin/deposits')
  async getAllDeposits() {
    return this.userService.getAllDeposits();
  }

  @Get('admin/winners')
  async getAllWinners() {
    return this.userService.getAllWinners();
  }

  @Patch('admin/deposits/:id/approve')
  async approveDeposit(@Param('id') id: string) {
    return this.userService.approveDeposit(id);
  }

  @Patch('admin/deposits/:id/reject')
  async rejectDeposit(@Param('id') id: string) {
    return this.userService.rejectDeposit(id);
  }

  // ─── Per-user routes ──────────────────────────────────────────────────────

  @Get(':id/stats')
  async getUserStats(@Param('id') id: string) {
    return this.userService.getUserStats(id);
  }

  @Get(':id/profile')
  async getUserProfile(@Param('id') id: string) {
    return this.userService.getUserProfile(id);
  }

  @Get(':id/referral')
  async getUserReferral(@Param('id') id: string) {
    return this.userService.getUserReferral(id);
  }

  @Get(':id/transactions')
  async getUserTransactions(@Param('id') id: string) {
    return this.userService.getTransactionHistory(id);
  }

  @Get(':id/deposits')
  async getUserDeposits(@Param('id') id: string) {
    return this.userService.getUserDeposits(id);
  }

  @Get(':id/rewards')
  async getUserRewards(@Param('id') id: string) {
    return this.userService.getUserRewards(id);
  }

  @Patch(':id/profile')
  async updateProfile(
    @Param('id') userId: string,
    @Body() body: { name?: string; wallet?: string },
  ) {
    return this.userService.updateProfile(userId, body);
  }

  @Post(':id/deposits')
  async submitDeposit(
    @Param('id') userId: string,
    @Body() body: { txHash: string; amount: number; asset?: string },
  ) {
    return this.userService.submitDeposit(userId, body.txHash, body.amount, body.asset);
  }
}
