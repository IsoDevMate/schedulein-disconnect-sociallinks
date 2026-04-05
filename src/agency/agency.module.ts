import { Module } from '@nestjs/common';
import { AgencyService } from './agency.service';
import { AgencyController } from './agency.controller';
import { LinkedinModule } from 'src/linkedin/linkedin.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Agency, AgencySchema } from './entities/agency.entity';
import { UsersModule } from 'src/users/users.module';
import { AuthModule } from 'src/auth/auth.module';
import  { EmailService } from 'src/email/email.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Agency.name, schema: AgencySchema }]),
    LinkedinModule,
    UsersModule,
    AuthModule  
  ],
  controllers: [AgencyController],
  providers: [AgencyService, EmailService],
  exports: [AgencyService,]
})
export class AgencyModule {}


