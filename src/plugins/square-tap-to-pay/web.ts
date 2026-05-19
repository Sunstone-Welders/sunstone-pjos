import { WebPlugin } from '@capacitor/core';
import type {
  SquareTapToPayPlugin,
  SquareInitializeOptions,
  SquareStartPaymentOptions,
  SquarePaymentResult,
} from './definitions';

const NOT_AVAILABLE =
  'Tap to Pay requires the Sunstone Studio iOS or Android app.';

export class SquareTapToPayWeb
  extends WebPlugin
  implements SquareTapToPayPlugin
{
  async initialize(_options: SquareInitializeOptions): Promise<void> {
    throw this.unavailable(NOT_AVAILABLE);
  }

  async isAvailable(): Promise<{ available: boolean }> {
    return { available: false };
  }

  async startPayment(
    _options: SquareStartPaymentOptions
  ): Promise<SquarePaymentResult> {
    return { status: 'error', errorMessage: NOT_AVAILABLE };
  }

  async getAuthorizationState(): Promise<{ authorized: boolean }> {
    return { authorized: false };
  }
}
