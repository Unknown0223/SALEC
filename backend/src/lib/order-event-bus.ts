import { EventEmitter } from "node:events";

export type OrderStreamPayload = {
  type: "order.updated";
  tenant_id: number;
  order_id: number;
};

const bus = new EventEmitter();
bus.setMaxListeners(500);

export function emitOrderUpdated(tenantId: number, orderId: number): void {
  const payload: OrderStreamPayload = {
    type: "order.updated",
    tenant_id: tenantId,
    order_id: orderId
  };
  bus.emit("order", payload);
}

export function subscribeOrderEvents(listener: (p: OrderStreamPayload) => void): () => void {
  bus.on("order", listener);
  return () => {
    bus.off("order", listener);
  };
}
