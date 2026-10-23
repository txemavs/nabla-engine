# 22. Networking and multiplayer

[Manual contents](README.md)

The network module provides transport, protocol, snapshot synchronization,
interpolation, shared entities, and selected game-authority decisions. The optional
relay groups peers into rooms and distributes state/events. It is not a complete
authoritative server-side simulation of all vehicle and character physics.

## Authority and presentation

`GameAuthority` provides a common interface for local and relay-backed decisions.
`LocalAuthority` decides in-process; `RelayAuthority` sends requests to the relay.
Applications subscribe to outcomes and apply them through the same path, including
their own requests. This avoids awarding a pickup optimistically and then awarding
it again when the shared result arrives.

The [contracts example](../../examples/manual/contracts.mjs) creates one item,
subscribes to item changes, requests it twice, and verifies that it is removed only
once. This is a local authority example; it does not test transport.

Snapshots represent remote motion and are interpolated for display. Shared vehicle
claims decide who controls an entity. Fire effects, ammunition ownership, health,
and physical hit detection have different boundaries; do not equate “networked”
with server verification of every action.

## What the inspected relay actually does

The server has room health ledgers and shared entity/claim handling. It validates
reload payloads, checks that a known reloader is alive, and rate-limits reload events.
The [relay README](../../services/relay/README.md) and [network guide](../net.md)
now describe this state ownership and validation explicitly.

For hits, the shooter reports the hit and the server validates/applies bounded
damage to a present target. This is not server-side geometric verification that
the shot truly intersected that target. Document that trust boundary in applications.

## Running and testing

```sh
npm --prefix services/relay install
npm --prefix services/relay test
npm --prefix services/relay start
```

The documented default port is 10003; use current server environment defaults for
deployment. An HTTPS game needs a secure `wss://` endpoint. Interest management uses
position/radius filtering; configure the relay radius consistently with client
show/hide distances. Test two clients, claims, pickup contention, death/respawn,
disconnect/reconnect, and disposal of subscriptions.

## Source of truth

- [Network exports](../../src/net/index.ts).
- [Authority](../../src/net/authority.ts) and [request schema](../../src/net/authority-schema.ts).
- [Protocol](../../src/net/protocol.ts).
- [Relay server](../../services/relay/server.mjs).
- [Relay tests](../../services/relay/server.test.mjs).
