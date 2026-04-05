import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { V2CreditsController } from './v2-credits.controller';
import { V2CreditsService } from './services/v2-credits.service';
import { V2CreditGuard } from './guards/v2-credit.guard';
import { V2PlanFeatureGuard } from './guards/v2-plan-feature.guard';
import { V2PlatformLimitGuard } from './guards/v2-platform-limit.guard';
import { V2UserCredits, V2UserCreditsSchema } from './schemas/v2-user-credits.schema';
import { V2CreditTransaction, V2CreditTransactionSchema } from './schemas/v2-credit-transaction.schema';
import { AccountConnectModule } from '../account-connect/account-connect.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: V2UserCredits.name, schema: V2UserCreditsSchema },
      { name: V2CreditTransaction.name, schema: V2CreditTransactionSchema },
    ]),
    forwardRef(() => AccountConnectModule), // For user context
  ],
  controllers: [V2CreditsController],
  providers: [
    V2CreditsService,
    V2CreditGuard,
    V2PlanFeatureGuard,
    V2PlatformLimitGuard,
  ],
  exports: [
    V2CreditsService,
    V2CreditGuard,
    V2PlanFeatureGuard,
    V2PlatformLimitGuard,
  ],
})
export class V2CreditsModule {}

