import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { IdentitiesController } from "./identities.controller";
import { IdentitiesService } from "./identities.service";
import { UsersModule } from "../../users/users.module";
import { AuthModule } from "../../auth/auth.module";
import { EmailModule } from "../../email/email.module";
import { OAuthModule } from "../oauth/oauth.module";
import { AccountConnectModule } from "../account-connect/account-connect.module";
import { V2JwtAuthGuard } from "../account-connect/guards/v2-jwt-auth.guard";
import { V2JwtStrategy } from "../account-connect/guards/v2-jwt.strategy";

@Module({
  imports: [
    PassportModule,
    UsersModule,
    AuthModule,
    EmailModule,
    OAuthModule,
    AccountConnectModule,
  ],
  controllers: [IdentitiesController],
  providers: [IdentitiesService, V2JwtStrategy, V2JwtAuthGuard],
})
export class IdentitiesModule {}
