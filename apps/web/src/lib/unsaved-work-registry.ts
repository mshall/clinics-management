let unsavedFormDepth = 0;
let paymentFlowDepth = 0;

export function registerUnsavedWork(): () => void {
  unsavedFormDepth += 1;
  return () => {
    unsavedFormDepth = Math.max(0, unsavedFormDepth - 1);
  };
}

export function setPaymentFlowActive(active: boolean): void {
  paymentFlowDepth += active ? 1 : -1;
  if (paymentFlowDepth < 0) paymentFlowDepth = 0;
}

export function canAutoApplyDeployReload(): boolean {
  return unsavedFormDepth === 0 && paymentFlowDepth === 0;
}