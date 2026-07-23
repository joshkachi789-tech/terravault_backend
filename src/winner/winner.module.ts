import { Module } from '@nestjs/common';
import { WinnerService } from './winner.service';
import { WinnerController } from './winner.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { EventsModule } from '../events/events.module';
import { DrawModule } from '../draw/draw.module';

@Module({
  imports: [PrismaModule, EventsModule, DrawModule],
  providers: [WinnerService],
  controllers: [WinnerController],
  exports: [WinnerService],
})
export class WinnerModule {}
