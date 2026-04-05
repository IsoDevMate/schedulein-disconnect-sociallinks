import { Module } from '@nestjs/common';
import { OAuthModule } from './oauth/oauth.module';
import { AccountConnectModule } from './account-connect/account-connect.module';
import { IdentitiesModule } from './identities/identities.module';
import { ManagementModule } from './management/management.module';
import { ProfileScoutModule } from './profile-scout/profile-scout.module';
import { V2CreditsModule } from './credits/v2-credits.module';

@Module({
  imports: [OAuthModule, AccountConnectModule, IdentitiesModule, ManagementModule, ProfileScoutModule, V2CreditsModule],
  exports: [OAuthModule, AccountConnectModule, IdentitiesModule, ManagementModule, ProfileScoutModule, V2CreditsModule],
})
export class V2Module {}
