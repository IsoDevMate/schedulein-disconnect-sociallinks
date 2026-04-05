import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class AsynchedProducerService {
  constructor(
    @InjectQueue('asynched-jobs') private readonly queue: Queue
  ) {}

  async addJob(data: any) {
    const job = await this.queue.add('process', data, {
      attempts: 3, // retry up to 3 times
      backoff: { type: 'exponential', delay: 5000 },
    });
    return job.id;
  }
}
