import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

export type EventData = {
  type:
    | 'ticket_purchased'
    | 'draw_created'
    | 'winner_added'
    | 'deposit_updated'
    | 'draw_executed'
    | 'price_updated'
    | 'referral_reward';
  data: any;
};

@Injectable()
export class EventsService {
  private eventSubject = new Subject<EventData>();
  public events$ = this.eventSubject.asObservable();

  emit(event: EventData) {
    this.eventSubject.next(event);
  }
}
