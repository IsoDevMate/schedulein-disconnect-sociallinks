import { Controller, Get } from "@nestjs/common";
import { EmailService } from "../email/email.service";

@Controller("api/health")
export class HealthController {
  constructor(private readonly emailService: EmailService) {}

  @Get()
  healthCheck() {
    return { status: "ok" };
  }

  @Get("email-status")
  emailStatus() {
    return {
      available: this.emailService.isEmailServiceAvailable(),
      providerStatus: this.emailService.getEmailProviderStatus(),
    };
  }
}
