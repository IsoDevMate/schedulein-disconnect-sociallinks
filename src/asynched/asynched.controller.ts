import { Controller, Get, Param } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Controller('asynched')
export class AsynchedController {
  constructor(
    @InjectQueue('asynched-jobs') private readonly queue: Queue
  ) {}

  @Get('job-status/:id')
  async getJobStatus(@Param('id') id: string) {
    const job = await this.queue.getJob(id);
    if (!job) return { status: 'not_found' };
    const state = await job.getState();
    const result = await job.returnvalue;
    return {
      id: job.id,
      state,
      result,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
    };
  }
}
