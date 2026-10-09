// Draws a real battle robot onto a square canvas. Shared by the phone garage/status and the host lobby.
import { drawRobot } from '/game/src/render.js';
import { CHASSIS } from '/game/src/sim.js';

// drawRobot works in battle units, so paint into a fixed 140-unit box and scale to the canvas backing size.
const VIEW = 140;

// Returns false when the robot has an unknown chassis (nothing was drawn).
export function paintBot(cv, robot, angle = 0, time = 0) {
  const chassis = CHASSIS[robot?.chassis];
  if (!chassis) return false;
  const ctx = cv.getContext('2d');
  const s = cv.width / VIEW;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.clearRect(0, 0, VIEW, VIEW);
  drawRobot(ctx, VIEW / 2, VIEW / 2, chassis.r * 2.2, angle, { ...robot, teamColor: robot.color }, time);
  return true;
}
