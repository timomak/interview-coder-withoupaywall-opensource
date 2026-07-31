# System Design mode

Every response uses the fixed sequence Clarify, Estimate, Architecture, Data &
APIs, and Deep Dives & Trade-offs. All five shells are created together and
stream independently; missing information becomes a visible assumption and
never blocks the rest of the design.

Estimate contains two to four material calculations with explicit assumptions
and units. Architecture is a bounded, validated node/edge graph using neutral
types such as service, datastore, cache, queue, and worker. Provider products
may appear only as secondary detail examples, not as graph types, labels, or
icon dependencies.

Calculation and graph schemas are validated in the live provider admission
path before session persistence, not only when rendered or exercised by
fixtures.

The live diagram supports inspect, zoom, pan, regenerate, and deterministic
screen-reader text. It has no editing, reconnecting, serialization, copy, or
standalone export action. Follow-ups declare impacted sections and a complete
What changed list; unaffected section bytes remain identical.
