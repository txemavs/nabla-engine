/** Engine-owned CSS3D instrument styles, installed per monitor layer. */
export const vehicleMonitorStyles = `.portal-console {
  /* Clipping here flattens 3D descendants and breaks native button hit testing. */
  transform-style: preserve-3d;
  width: 580px;
  height: 400px;
  box-sizing: border-box;
  padding: 28px;
  overflow: visible;
  border-radius: 0;
  background: #08121e;
  color: #dceeff;
  font-size: 25px;
  backface-visibility: visible;
}
.portal-console[hidden] {
  display: none !important;
}
.portal-console select,
.portal-console button {
  font-size: 22px;
  padding: 14px 8px;
}
.portal-console strong {
  min-height: 75px;
}
.portal-console small {
  font-size: 20px;
  line-height: 1.5;
}

.portal-console strong,
.portal-console small {
  display: block;
  margin-bottom: 5px;
}
.portal-console select {
  width: 100%;
  margin-bottom: 6px;
}
.portal-console button {
  margin-right: 5px;
}
.portal-console small {
  margin-top: 6px;
  color: #accbff;
}

.css-world-layer {
  z-index: 0;
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.helm-portal,
.helm-console {
  width: 620px;
  height: 340px;
  padding: 18px;
  box-sizing: border-box;
  background: #080c11;
  color: #e0e7ef;
  font-size: 23px;
  transform-style: preserve-3d;
}
.helm-portal {
  display: flex;
  flex-direction: column;
}
.portal-jump {
  margin-top: auto;
  display: flex;
  gap: 8px;
  align-items: end;
}
.portal-jump label {
  flex: 1;
  font-size: 16px;
}
.portal-jump input {
  width: 100%;
  box-sizing: border-box;
  font-size: 18px;
}

.helm-console[hidden] {
  display: none !important;
}
.helm-console strong,
.helm-console output,
.helm-console label,
.helm-console small {
  display: block;
  margin: 6px 0;
}
.helm-console output {
  font-size: 30px;
  color: #91cdfb;
}
.helm-console select,
.helm-console button {
  font-size: 23px;
  padding: 8px;
}

.telemetry-console output {
  margin-top: 30px;
  font-size: 40px;
}
.telemetry-console small {
  white-space: pre-line;
  line-height: 1.8;
}
.map-console canvas {
  width: 580px;
  height: 230px;
  display: block;
}
.map-console small {
  font-size: 19px;
}
.touch-console {
  width: 2430px;
  height: 400px;
  padding: 10px 40px;
  touch-action: none;
  user-select: none;
  text-align: center;
}
.helm-indicators,
.helm-console > strong,
.helm-portal > strong {
  display: block;
  width: 100%;
  margin: 0;
  color: #7395ad;
  font-family: system-ui, sans-serif;
  font-size: 24px;
  font-weight: 400;
  height: 35px;
  letter-spacing: 6px;
  text-align: center;
}
.ship-switches {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ship-switches button {
  min-width: 150px;
  min-height: 64px;
}
.ship-switches button.is-on {
  background: #1d4e73;
  border-color: #8fd0ff;
  color: #fff;
}
.hand-controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 65px;
}
.dpad {
  width: 320px;
  height: 320px;
  border: 3px solid #365266;
  border-radius: 50%;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 6px;
  padding: 12px;
  box-sizing: border-box;
}
.dpad span {
  grid-area: 2 / 2;
  align-self: center;
  font-size: 16px;
  color: #89a7bb;
}
.dpad .up {
  grid-area: 1 / 2;
}
.dpad .left {
  grid-area: 2 / 1;
}
.dpad .right {
  grid-area: 2 / 3;
}
.dpad .down {
  grid-area: 3 / 2;
}
.touch-console button {
  background: #142735;
  color: #c6e6ff;
  border: 2px solid #395e79;
  border-radius: 12px;
  font-size: 30px;
}
.touch-console button:active {
  background: #356186;
}
.dpad button {
  font-size: 40px;
}
.helm-desk {
  display: grid;
  grid-template-columns: 1fr 1.4fr 1fr;
  grid-template-areas:
    'off auto car'
    'drone mode plane'
    'space door brake';
  width: 640px;
  gap: 12px;
  align-items: center;
}
.helm-desk [data-helm='off'] {
  grid-area: off;
}
.helm-desk [data-helm='auto'] {
  grid-area: auto;
}
.helm-desk [data-helm='car'] {
  grid-area: car;
}
.helm-desk [data-helm='drone'] {
  grid-area: drone;
}
.helm-desk [data-helm='plane'] {
  grid-area: plane;
}
.helm-desk [data-helm='space'] {
  grid-area: space;
}
.helm-desk .helm-mode {
  grid-area: mode;
  min-height: 120px;
  display: grid;
  place-items: center;
  border: 2px solid #6ec1ff;
  border-radius: 16px;
  color: #e8f6ff;
  font-size: 28px;
  letter-spacing: 1px;
  text-align: center;
}
.helm-desk [data-door] {
  grid-area: door;
}
.helm-desk [data-brake] {
  grid-area: brake;
}
.helm-desk button.is-on {
  background: #1d4e73;
  border-color: #8fd0ff;
}
.helm-desk button:disabled {
  opacity: 0.35;
}
.desk-switches button {
  min-height: 75px;
}
.desk-switches label {
  font-size: 24px;
}
.desk-switches select {
  font-size: 27px;
}

`

export const vehicleMonitorBaseStyles = `
.portal-tablet-layer { font-family: system-ui, sans-serif; }
.portal-tablet-layer button, .portal-tablet-layer input, .portal-tablet-layer select {
  font: inherit; color: inherit; background: #142735; border: 2px solid #395e79; border-radius: 6px;
}
.portal-tablet-layer button { cursor: pointer; }
.portal-tablet-layer button:disabled { opacity: .35; cursor: default; }
.portal-tablet-layer button:focus-visible { outline: 2px solid #8fd0ff; }
.portal-tablet-layer .systems-board { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; height: 260px; }
.portal-tablet-layer .systems-board button { padding: 4px; font-size: 20px; }
.portal-tablet-layer .systems-board output { font-size: 26px; text-align: center; }
.portal-tablet-layer button.is-on { background: #1d4e73; border-color: #8fd0ff; }
`
