import {
  Controller,
  Post,
  Headers,
  UnauthorizedException,
  InternalServerErrorException,
  Logger,
  HttpCode,
} from '@nestjs/common';
import { CronService } from './cron.service';

@Controller('cron')
export class CronController {
  private readonly logger = new Logger(CronController.name);

  constructor(private readonly cronService: CronService) {}

  /**
   * POST /cron/process-draw
   *
   * Called by an external cron service (e.g. cron-job.org) every minute.
   * Protected by a Bearer token matching CRON_SECRET in .env.
   *
   * Idempotent: safe to call multiple times — the same draw will
   * never be processed twice thanks to the database-level lock.
   */
  @Post('process-draw')
  @HttpCode(200)
  async processDraw(@Headers('authorization') authHeader: string) {
    // ── Auth check ─────────────────────────────────────────────────────────
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      this.logger.error('CRON_SECRET env var is not set on this server!');
      throw new UnauthorizedException('Server misconfiguration.');
    }
    const expected = `Bearer ${secret}`;
    if (!authHeader || authHeader !== expected) {
      this.logger.warn(`Auth failed. Received: "${authHeader}" Expected: "Bearer ***"`);
      throw new UnauthorizedException('Invalid or missing cron secret.');
    }

    try {
      const result = await this.cronService.processDraw();
      return result;
    } catch (err) {
      this.logger.error('Cron draw processing error:', err);
      throw new InternalServerErrorException(
        'Draw processing failed. It will be retried on the next cron call.',
      );
    }
  }
}
