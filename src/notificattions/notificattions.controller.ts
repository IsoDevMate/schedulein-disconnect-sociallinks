import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { NotificationService } from './notificattions.service';
import { CreateNotificattionDto } from './dto/create-notificattion.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post('send')
  @UseGuards(JwtAuthGuard)
  async sendNotification(
    @Body() createNotificationDto: CreateNotificattionDto,
  ) {
    await this.notificationService.sendNotification(createNotificationDto);
    return { message: 'Notification sent successfully' };
  }
}
