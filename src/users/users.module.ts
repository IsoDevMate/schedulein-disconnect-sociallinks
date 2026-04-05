import { Module } from "@nestjs/common";
import { UsersService } from "./users.service";
import { UsersController } from "./users.controller";
import { UserRepository } from "./users.repository";
import { User, UserSchema } from "./entities/user.entity";
import { MongooseModule } from "@nestjs/mongoose";
import { ConfigModule } from "@nestjs/config";
import { SocialAccountsModule } from "./social-accounts.module";
import { SocialAccountsService } from "./services/social-accounts.service";
import { AccountConnectModule } from "../v2/account-connect/account-connect.module";
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    SocialAccountsModule,
    AccountConnectModule,
  ],
  providers: [UserRepository, UsersService, SocialAccountsService],
  controllers: [UsersController],
  exports: [UserRepository, UsersService, SocialAccountsService],
})
export class UsersModule {}
