import { Module, OnModuleInit, INestApplication } from '@nestjs/common';
import { ExpressAdapter } from '@bull-board/express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Module({})
export class BullBoardModule implements OnModuleInit {
  constructor(
    @InjectQueue('asynched-jobs') private readonly queue: Queue
  ) {}

  onModuleInit() {
    // Optionally, setup can be called here if you want auto-setup
  }

  static setup(app: INestApplication, queue: Queue) {
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/queues');
    createBullBoard({
      queues: [new BullMQAdapter(queue)],
      serverAdapter,
    });
    app.use('/queues', serverAdapter.getRouter());
  }
}
