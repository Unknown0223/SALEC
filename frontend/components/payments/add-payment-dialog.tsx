"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { AddPaymentForm } from "@/components/payments/add-payment-form";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantSlug: string;
  onCreated?: () => void;
  lockedClientId?: string;
  lockedClientLabel?: string;
  initialLedgerAgentId?: number | null;
};

export function AddPaymentDialog({
  open,
  onOpenChange,
  tenantSlug,
  onCreated,
  lockedClientId,
  lockedClientLabel,
  initialLedgerAgentId
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[min(92vh,900px)] w-full max-w-[min(100vw-1.5rem,56rem)] gap-4 overflow-y-auto p-5 sm:max-w-4xl sm:p-6"
        data-testid="add-payment-dialog"
      >
        <DialogHeader>
          <DialogTitle>Добавить оплату</DialogTitle>
          <DialogDescription>
            {lockedClientId?.trim()
              ? "Платёж на баланс клиента. Можно указать заказ и несколько строк."
              : "Один или несколько платежей для выбранного клиента. Дополнительные строки можно удалить или добавить."}
          </DialogDescription>
        </DialogHeader>
        <AddPaymentForm
          tenantSlug={tenantSlug}
          lockedClientId={lockedClientId}
          lockedClientLabel={lockedClientLabel}
          initialLedgerAgentId={initialLedgerAgentId}
          onSuccess={() => {
            onCreated?.();
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
