import { describe, expect, it } from "vitest";
import {
  canTransitionOrderStatus,
  getAllowedNextStatuses,
  isBackwardTransition,
  isOperatorLateStageCancelForbidden,
  isValidOrderStatus
} from "../src/modules/orders/order-status";

describe("order-status", () => {
  it("allows new -> confirmed and new -> cancelled", () => {
    expect(canTransitionOrderStatus("new", "confirmed")).toBe(true);
    expect(canTransitionOrderStatus("new", "cancelled")).toBe(true);
    expect(canTransitionOrderStatus("new", "delivered")).toBe(false);
  });

  it("delivered -> returned forward; delivered -> delivering backward; delivered -> new forbidden", () => {
    expect(canTransitionOrderStatus("delivered", "returned")).toBe(true);
    expect(canTransitionOrderStatus("delivered", "cancelled")).toBe(false);
    expect(canTransitionOrderStatus("delivered", "delivering")).toBe(true);
    expect(canTransitionOrderStatus("delivered", "new")).toBe(false);
    expect(canTransitionOrderStatus("delivered", "confirmed")).toBe(false);
  });

  it("allows one-step backward in main chain", () => {
    expect(canTransitionOrderStatus("confirmed", "new")).toBe(true);
    expect(canTransitionOrderStatus("picking", "confirmed")).toBe(true);
    expect(canTransitionOrderStatus("delivering", "picking")).toBe(true);
    expect(canTransitionOrderStatus("picking", "new")).toBe(false);
  });

  it("returned is terminal; cancelled can reopen to new (admin enforced in API)", () => {
    expect(getAllowedNextStatuses("returned")).toEqual([]);
    expect(getAllowedNextStatuses("cancelled")).toEqual(["new"]);
    expect(canTransitionOrderStatus("cancelled", "new")).toBe(true);
    expect(isBackwardTransition("cancelled", "new")).toBe(false);
  });

  it("same status transition is rejected", () => {
    expect(canTransitionOrderStatus("new", "new")).toBe(false);
  });

  it("rejects unknown status strings", () => {
    expect(isValidOrderStatus("draft")).toBe(false);
    expect(canTransitionOrderStatus("new", "draft")).toBe(false);
  });

  it("isBackwardTransition marks reverse chain only", () => {
    expect(isBackwardTransition("picking", "confirmed")).toBe(true);
    expect(isBackwardTransition("picking", "delivering")).toBe(false);
    expect(isBackwardTransition("picking", "cancelled")).toBe(false);
  });

  it("getAllowedNextStatuses omitBackward excludes reverse targets", () => {
    const all = getAllowedNextStatuses("picking");
    const noBack = getAllowedNextStatuses("picking", { omitBackward: true });
    expect(all).toContain("confirmed");
    expect(noBack).not.toContain("confirmed");
    expect(noBack).toContain("delivering");
    expect(noBack).toContain("cancelled");
  });

  it("isOperatorLateStageCancelForbidden marks picking/delivering -> cancelled", () => {
    expect(isOperatorLateStageCancelForbidden("picking", "cancelled")).toBe(true);
    expect(isOperatorLateStageCancelForbidden("delivering", "cancelled")).toBe(true);
    expect(isOperatorLateStageCancelForbidden("confirmed", "cancelled")).toBe(false);
    expect(isOperatorLateStageCancelForbidden("picking", "delivering")).toBe(false);
  });
});
