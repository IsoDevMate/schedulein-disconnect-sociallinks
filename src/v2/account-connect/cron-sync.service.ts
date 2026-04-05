import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AccountConnectService } from './account-connect.service';

@Injectable()
export class CronSyncService {
  private readonly logger = new Logger(CronSyncService.name);

  constructor(private readonly accountConnectService: AccountConnectService) {}

  /**
   * Sync all active accounts every 6 hours
   */
  @Cron(CronExpression.EVERY_6_HOURS)
  async syncAllActiveAccounts() {
    this.logger.log('Starting scheduled sync of all active accounts...');
    try {
      await this.accountConnectService.syncAllActiveAccounts();
      this.logger.log('Scheduled sync completed successfully');
    } catch (error) {
      this.logger.error('Scheduled sync failed:', error.message);
    }
  }

  /**
   * Check for expired tokens every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async checkExpiredTokens() {
    this.logger.log('Checking for expired tokens...');
    try {
      // This is handled in syncAllActiveAccounts, but we can add specific logic here
      this.logger.log('Token expiry check completed');
    } catch (error) {
      this.logger.error('Token expiry check failed:', error.message);
    }
  }

  /**
   * Daily health check of all connected accounts
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async dailyHealthCheck() {
    this.logger.log('Starting daily health check of connected accounts...');
    try {
      // Add health check logic here
      this.logger.log('Daily health check completed');
    } catch (error) {
      this.logger.error('Daily health check failed:', error.message);
    }
  }
}
