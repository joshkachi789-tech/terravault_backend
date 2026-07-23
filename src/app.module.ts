import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { DrawModule } from './draw/draw.module';
import { TicketModule } from './ticket/ticket.module';
import { WinnerModule } from './winner/winner.module';
import { EventsModule } from './events/events.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { PriceModule } from './price/price.module';
import { CronModule } from './cron/cron.module';

@Module({
  imports: [
    PrismaModule,
    DrawModule,
    TicketModule,
    WinnerModule,
    EventsModule,
    AuthModule,
    UserModule,
    PriceModule,
    CronModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
