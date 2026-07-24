import {
  Controller,
  Post,
  Headers,
  Query,
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

  @Post('process-draw')
  @HttpCode(200)
  async processDraw(
    @Headers('authorization') authHeader: string,
    @Query('secret') querySecret: string,
  ) {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      this.logger.error('CRON_SECRET env var is not set!');
      throw new UnauthorizedException('Server misconfiguration.');
    }

    // Accept secret via Authorization header OR ?secret= query param
    const headerMatch = authHeader === `Bearer ${secret}`;
    const queryMatch = querySecret === secret;

    if (!headerMatch && !queryMatch) {
      this.logger.warn(`Auth failed. Header: "${authHeader}" Query: "${querySecret}"`);
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
