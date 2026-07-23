import { Controller, Get, Sse, Post, Param } from '@nestjs/common';
import { DrawService } from './draw.service';
import { map, Observable } from 'rxjs';
import { EventsService } from '../events/events.service';

@Controller('draws')
export class DrawController {
  constructor(
    private drawService: DrawService,
    private eventsService: EventsService,
  ) {}

  @Get('open')
  async getOpenDraw() {
    return this.drawService.getOpenDraw();
  }

  @Get()
  async getAllDraws() {
    return this.drawService.getAllDraws();
  }

  @Post(':id/execute')
  async executeDraw(@Param('id') id: string) {
    return this.drawService.executeDraw(id);
  }

  @Sse('stream')
  stream(): Observable<MessageEvent> {
    return this.eventsService.events$.pipe(
      map((event) => {
        return { data: event } as MessageEvent;
      }),
    );
  }
}
