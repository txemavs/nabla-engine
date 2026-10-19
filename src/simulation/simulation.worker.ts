import { serveSimulation, type SimulationPort } from './simulation-worker-host.js'

serveSimulation(self as unknown as SimulationPort)
