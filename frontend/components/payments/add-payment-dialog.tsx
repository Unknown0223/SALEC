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
};

export function AddPaymentDialog({ open, onOpenChange, tenantSlug, onCreated }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[min(92vh,900px)] w-full max-w-[min(100vw-1.5rem,56rem)] gap-4 overflow-y-auto p-5 sm:max-w-4xl sm:p-6"
        data-testid="add-payment-dialog"
      >
        <DialogHeader>
          <DialogTitle>Добавить оплату</DialogTitle>
          <DialogDescription>
            Один или несколько платежей для выбранного клиента. Дополнительные строки можно удалить или добавить.
          </DialogDescription>
        </DialogHeader>
        <AddPaymentForm
          tenantSlug={tenantSlug}
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
