export const VERSION = "0.0.1";

export interface PhysicsAdapter {
  step(deltaTime: number): void;
  addBody(body: unknown): void;
  removeBody(body: unknown): void;
}
