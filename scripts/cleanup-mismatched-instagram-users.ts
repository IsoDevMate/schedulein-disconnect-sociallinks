import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { UsersService } from "../src/users/users.service";
import axios from "axios";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const usersService = app.get(UsersService);

  // Get all users with an Instagram access token
  const users = await usersService["userRepository"].findAll();

  for (const user of users) {
    if (user.instagramAccessToken && user.instagramId) {
      try {
        const res = await axios.get(
          `https://graph.instagram.com/me?fields=id,username&access_token=${user.instagramAccessToken}`,
        );
        const apiUserId = String(res.data.id);
        if (apiUserId !== String(user.instagramId)) {
          console.log(
            `Mismatch for user ${user.email}: DB instagramId=${user.instagramId}, token returns id=${apiUserId}`,
          );
          // Uncomment the next line to actually delete the user:
          // await usersService.delete(user._id);
        } else {
          console.log(
            `User ${user.email} is valid: instagramId=${user.instagramId}`,
          );
        }
      } catch (error) {
        console.log(
          `Error validating user ${user.email}: ${error.response?.data?.error?.message || error.message}`,
        );
      }
    }
  }

  await app.close();
}

main();
