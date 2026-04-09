import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("renders accessible label", () => {
    render(<Button type="button">Сохранить</Button>);
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeVisible();
  });
});
