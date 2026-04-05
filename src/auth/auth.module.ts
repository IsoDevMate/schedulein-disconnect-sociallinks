import { Module, forwardRef } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { BlacklistRepository } from "./auth.repository";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { MongooseModule } from "@nestjs/mongoose";
import {
  BlacklistToken,
  BlacklistTokenSchema,
} from "./entities/blacklistedtoken.entity";
import { UsersModule } from "../users/users.module";
import { LocalStrategy } from "./strategy/local.strategy";
import { JwtStrategy } from "./strategy/jwt.startegy";
import { MailerModule } from "@nestjs-modules/mailer";

import { ConfigModule, ConfigService } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { RefreshTokenRepository } from "../auth/refresh-token.repository";
import { YouTubeTokenRefreshService } from "./youtube-token-refresh.service";
import {
  RefreshToken,
  RefreshTokenSchema,
} from "../auth/entities/refresh-token.entity";
import { SocialAccountsModule } from "../users/social-accounts.module";
import { EmailModule } from "../email/email.module";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    forwardRef(() => UsersModule),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    MongooseModule.forFeature([
      { name: BlacklistToken.name, schema: BlacklistTokenSchema },
      { name: RefreshToken.name, schema: RefreshTokenSchema },
    ]),

    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET"),
        signOptions: { expiresIn: "24h" },
      }),
      inject: [ConfigService],
    }),
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        transport: {
          host: configService.get<string>("EMAIL_HOST"),
          port: configService.get<number>("EMAIL_PORT"),
          auth: {
            user: configService.get<string>("EMAIL_USER"),
            pass: configService.get<string>("EMAIL_PASSWORD"),
          },
        },
        defaults: {
          from: '"No Reply" <no-reply@groreels.com.com>',
        },
      }),
      inject: [ConfigService],
    }),
    SocialAccountsModule,
    EmailModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    LocalStrategy,
    JwtStrategy,
    BlacklistRepository,
    JwtAuthGuard,
    RefreshTokenRepository,
    YouTubeTokenRefreshService,
  ],
  exports: [
    BlacklistRepository,
    JwtAuthGuard,
    AuthService,
    JwtAuthGuard,
  ],
})
export class AuthModule {}
