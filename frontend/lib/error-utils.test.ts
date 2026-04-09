import { AxiosError } from "axios";
import { describe, expect, it } from "vitest";
import { getUserFacingError, isApiUnreachable } from "./error-utils";

describe("isApiUnreachable", () => {
  it("true for network axios error", () => {
    const e = new AxiosError("Network Error", "ERR_NETWORK");
    expect(isApiUnreachable(e)).toBe(true);
  });

  it("false when response exists", () => {
    const e = new AxiosError("Server said no");
    e.response = {
      status: 500,
      data: {},
      statusText: "err",
      headers: {},
      config: {} as never
    };
    expect(isApiUnreachable(e)).toBe(false);
  });

  it("false for non-axios", () => {
    expect(isApiUnreachable(new Error("x"))).toBe(false);
  });
});

describe("getUserFacingError", () => {
  it("uses server message", () => {
    const e = new AxiosError("fail");
    e.response = {
      status: 400,
      data: { message: "Bad input" },
      statusText: "Bad",
      headers: {},
      config: {} as never
    };
    expect(getUserFacingError(e)).toBe("Bad input");
  });

  it("401 mapping", () => {
    const e = new AxiosError("Unauthorized");
    e.response = {
      status: 401,
      data: {},
      statusText: "Unauthorized",
      headers: {},
      config: {} as never
    };
    expect(getUserFacingError(e)).toContain("Сессия");
  });

  it("fallback", () => {
    expect(getUserFacingError("x", "F")).toBe("F");
  });
});
