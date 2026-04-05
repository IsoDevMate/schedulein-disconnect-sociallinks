import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { ManagementController } from './management.controller';
import { ManagementService } from './management.service';
import { V2JwtAuthGuard } from '../account-connect/guards/v2-jwt-auth.guard';
import { V2JwtStrategy } from '../account-connect/guards/v2-jwt.strategy';

@Module({
  imports: [ConfigModule, PassportModule],
  controllers: [ManagementController],
  providers: [ManagementService, V2JwtStrategy, V2JwtAuthGuard],
  exports: [ManagementService],
})
export class ManagementModule {}
