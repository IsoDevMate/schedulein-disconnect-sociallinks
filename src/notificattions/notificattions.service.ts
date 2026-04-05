import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Notification } from './entities/notificattion.entity';
import { MailerService } from '@nestjs-modules/mailer';
import { CreateNotificattionDto } from './dto/create-notificattion.dto';

@Injectable()
export class NotificationService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<Notification>,
    private readonly mailerService: MailerService,
  ) {}

  async sendNotification(notificationDto: CreateNotificattionDto) {
    const notification = new this.notificationModel(notificationDto);
    await notification.save();

    await this.mailerService.sendMail({
      to: notificationDto.userId,
      subject: `Notification: ${notificationDto.type}`,
      text: notificationDto.message,
    });
  }
}
