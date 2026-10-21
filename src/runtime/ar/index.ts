/** Opt-in AR adapters. Importing the module does not instantiate or load demo content. */
export { GameAR } from './session.js'
export { ARRoom, type ARRoomSource } from './room.js'
export { ARRC, ARRC as ARVehicles } from './vehicles.js'
export { XRScaledVehicles } from '../xr-scaled-vehicles.js'
export { ARRCControls } from '../xr-rc-controls.js'
export { ARBalls, ARBalls as ARRoomPhysics } from '../xr-room-physics.js'

export { XRObjectGrab } from '../xr-object-grab.js'

export { XRMenuGesture } from '../xr-menu-gesture.js'

export { inspectXRDevice, xrDeviceHint, type XRDeviceReport } from '../xr-device-info.js'

export { ARTouchControls, type ARTouchAction } from './touch-controls.js'
export { XRHitTest, type XRHitPose } from '../xr-hit-test.js'
