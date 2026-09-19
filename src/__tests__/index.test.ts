import { describe, it, expect } from "vitest";
import { VERSION, type PhysicsAdapter } from "../index";

describe("@nabla/engine", () => {
  it("exports VERSION", () => {
    expect(VERSION).toBe("0.0.1");
  });

  it("PhysicsAdapter interface is usable", () => {
    const mockAdapter: PhysicsAdapter = {
      step: () => {},
      addBody: () => {},
      removeBody: () => {},
    };
    expect(mockAdapter.step).toBeDefined();
    expect(mockAdapter.addBody).toBeDefined();
    expect(mockAdapter.removeBody).toBeDefined();
  });
});
