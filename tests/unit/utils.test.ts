import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("joins class names and drops falsy values", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });

  it("lets later Tailwind classes override earlier conflicting ones", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
