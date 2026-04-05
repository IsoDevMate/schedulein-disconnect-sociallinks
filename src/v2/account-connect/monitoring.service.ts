// import { Injectable, Logger } from '@nestjs/common';
// import { InjectModel } from '@nestjs/mongoose';
// import { Model, Types } from 'mongoose';
// import { AccountConnect, ConnectionStatus } from './schemas/account-connect.schema';

// export interface SyncMetrics {
//   totalAccounts: number;
//   activeAccounts: number;
//   expiredTokens: number;
//   errorAccounts: number;
//   disconnectedAccounts: number;
//   lastSyncSuccess: number;
//   lastSyncFailure: number;
//   averageSyncTime: number;
// }

// export interface DataConsistencyReport {
//   orphanedAccounts: number;
//   inconsistentData: number;
//   missingTokens: number;
//   duplicateAccounts: number;
// }

// @Injectable()
// export class MonitoringService {
//   private readonly logger = new Logger(MonitoringService.name);

//   constructor(
//     @InjectModel(AccountConnect.name)
//     private accountConnectModel: Model<AccountConnect>,
//   ) {}

//   /**
//    * Get comprehensive sync metrics
//    */
//   async getSyncMetrics(): Promise<SyncMetrics> {
//     try {
//       const totalAccounts = await this.accountConnectModel.countDocuments();
//       const activeAccounts = await this.accountConnectModel.countDocuments({
//         isActive: true,
//         status: ConnectionStatus.CONNECTED,
//       });
//       const expiredTokens = await this.accountConnectModel.countDocuments({
//         status: ConnectionStatus.EXPIRED,
//       });
//       const errorAccounts = await this.accountConnectModel.countDocuments({
//         status: ConnectionStatus.ERROR,
//       });
//       const disconnectedAccounts = await this.accountConnectModel.countDocuments({
//         status: ConnectionStatus.DISCONNECTED,
//       });

//       // Calculate sync success/failure rates (simplified)
//       const lastSyncSuccess = activeAccounts;
//       const lastSyncFailure = errorAccounts + expiredTokens;

//       return {
//         totalAccounts,
//         activeAccounts,
//         expiredTokens,
//         errorAccounts,
//         disconnectedAccounts,
//         lastSyncSuccess,
//         lastSyncFailure,
//         averageSyncTime: 0, // TODO: Implement actual sync time tracking
//       };
//     } catch (error) {
//       this.logger.error('Failed to get sync metrics:', error.message);
//       throw error;
//     }
//   }

//   /**
//    * Check data consistency across AccountConnect documents
//    */
//   async getDataConsistencyReport(): Promise<DataConsistencyReport> {
//     try {
//       // Check for orphaned accounts (no valid user)
//       const orphanedAccounts = await this.accountConnectModel.countDocuments({
//         userId: { $exists: true },
//         // Note: This is a simplified check - in production, you'd verify against actual users
//       });

//       // Check for accounts with missing tokens
//       const missingTokens = await this.accountConnectModel.countDocuments({
//         $or: [
//           { accessToken: { $exists: false } },
//           { accessToken: null },
//           { accessToken: '' },
//         ],
//       });

//       // Check for duplicate accounts (same user, same platform, same platformUserId)
//       const duplicateAccounts = await this.accountConnectModel.aggregate([
//         {
//           $group: {
//             _id: {
//               userId: '$userId',
//               platform: '$platform',
//               platformUserId: '$platformUserId',
//             },
//             count: { $sum: 1 },
//           },
//         },
//         {
//           $match: {
//             count: { $gt: 1 },
//           },
//         },
//         {
//           $count: 'duplicates',
//         },
//       ]);

//       return {
//         orphanedAccounts,
//         inconsistentData: 0, // TODO: Implement more sophisticated consistency checks
//         missingTokens,
//         duplicateAccounts: duplicateAccounts[0]?.duplicates || 0,
//       };
//     } catch (error) {
//       this.logger.error('Failed to get data consistency report:', error.message);
//       throw error;
//     }
//   }

//   /**
//    * Log sync failure for monitoring
//    */
//   async logSyncFailure(accountId: string, error: string, platform: string): Promise<void> {
//     try {
//       this.logger.error(`Sync failure for account ${accountId} on ${platform}: ${error}`);

//       // Update account status to ERROR
//       await this.accountConnectModel.findByIdAndUpdate(accountId, {
//         $set: {
//           status: ConnectionStatus.ERROR,
//           lastSyncAt: new Date(),
//         },
//       });

//       // TODO: Send alert/notification for critical failures
//     } catch (logError) {
//       this.logger.error('Failed to log sync failure:', logError.message);
//     }
//   }

//   /**
//    * Log sync success for monitoring
//    */
//   async logSyncSuccess(accountId: string, platform: string, syncTime: number): Promise<void> {
//     try {
//       this.logger.debug(`Sync success for account ${accountId} on ${platform} in ${syncTime}ms`);

//       // Update account status to CONNECTED
//       await this.accountConnectModel.findByIdAndUpdate(accountId, {
//         $set: {
//           status: ConnectionStatus.CONNECTED,
//           lastSyncAt: new Date(),
//         },
//       });
//     } catch (logError) {
//       this.logger.error('Failed to log sync success:', logError.message);
//     }
//   }

//   /**
//    * Get accounts that need attention
//    */
//   async getAccountsNeedingAttention(): Promise<AccountConnect[]> {
//     try {
//       return await this.accountConnectModel.find({
//         $or: [
//           { status: ConnectionStatus.ERROR },
//           { status: ConnectionStatus.EXPIRED },
//           { status: ConnectionStatus.DISCONNECTED },
//         ],
//       }).limit(50); // Limit to prevent overwhelming
//     } catch (error) {
//       this.logger.error('Failed to get accounts needing attention:', error.message);
//       throw error;
//     }
//   }

//   /**
//    * Generate health report
//    */
//   async generateHealthReport(): Promise<any> {
//     try {
//       const syncMetrics = await this.getSyncMetrics();
//       const consistencyReport = await this.getDataConsistencyReport();
//       const accountsNeedingAttention = await this.getAccountsNeedingAttention();

//       const healthScore = this.calculateHealthScore(syncMetrics, consistencyReport);

//       return {
//         timestamp: new Date(),
//         healthScore,
//         syncMetrics,
//         consistencyReport,
//         accountsNeedingAttention: accountsNeedingAttention.length,
//         recommendations: this.generateRecommendations(syncMetrics, consistencyReport),
//       };
//     } catch (error) {
//       this.logger.error('Failed to generate health report:', error.message);
//       throw error;
//     }
//   }

//   /**
//    * Calculate overall health score (0-100)
//    */
//   private calculateHealthScore(syncMetrics: SyncMetrics, consistencyReport: DataConsistencyReport): number {
//     let score = 100;

//     // Deduct points for various issues
//     if (syncMetrics.totalAccounts > 0) {
//       const errorRate = syncMetrics.lastSyncFailure / syncMetrics.totalAccounts;
//       score -= errorRate * 30; // Up to 30 points for sync failures

//       const expiredRate = syncMetrics.expiredTokens / syncMetrics.totalAccounts;
//       score -= expiredRate * 20; // Up to 20 points for expired tokens
//     }

//     if (consistencyReport.orphanedAccounts > 0) {
//       score -= 10; // 10 points for orphaned accounts
//     }

//     if (consistencyReport.duplicateAccounts > 0) {
//       score -= 15; // 15 points for duplicate accounts
//     }

//     return Math.max(0, Math.round(score));
//   }

//   /**
//    * Generate recommendations based on metrics
//    */
//   private generateRecommendations(syncMetrics: SyncMetrics, consistencyReport: DataConsistencyReport): string[] {
//     const recommendations: string[] = [];

//     if (syncMetrics.expiredTokens > 0) {
//       recommendations.push(`Refresh ${syncMetrics.expiredTokens} expired tokens`);
//     }

//     if (syncMetrics.errorAccounts > 0) {
//       recommendations.push(`Investigate ${syncMetrics.errorAccounts} accounts with sync errors`);
//     }

//     if (consistencyReport.orphanedAccounts > 0) {
//       recommendations.push(`Clean up ${consistencyReport.orphanedAccounts} orphaned accounts`);
//     }

//     if (consistencyReport.duplicateAccounts > 0) {
//       recommendations.push(`Resolve ${consistencyReport.duplicateAccounts} duplicate accounts`);
//     }

//     if (recommendations.length === 0) {
//       recommendations.push('All systems are healthy');
//     }

//     return recommendations;
//   }
// }
