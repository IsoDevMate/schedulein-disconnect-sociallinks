import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { PaymentsService } from "../payments.service";
import { PaymentStatus } from "../dto/paystack.dto";

@Injectable()
export class PaymentGuard implements CanActivate {
  constructor(private paymentsService: PaymentsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException("User not authenticated");
    }

    const paymentsResult = await this.paymentsService.getUserPayments(user.id);
    const hasSuccessfulPayment = paymentsResult.payments.some(
      (payment) => payment.status === PaymentStatus.PAID,
    );

    if (!hasSuccessfulPayment) {
      throw new UnauthorizedException(
        "Payment required to access this resource",
      );
    }

    return true;
  }
}
