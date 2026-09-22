# Nabla Studio in Agency

The Studio chrome uses Agency's dark theme colors: background `#121212`, surface
`#1e1e1e`, and primary `#2196f3`. `playground/studio-shell.css` owns the editor's
presentation tokens, text sizes and layouts. In-world cockpit CSS keeps its own
scale. The editor uses Segoe UI/system fonts without an external font download.

The menu bar exposes File, Edit, View, World, Options and Help. Edit entries invoke
the existing editor buttons, sharing their disabled state and undo history.
Native popovers provide dismissal; the shell adds anchored placement, hover
switching and arrow-key navigation. View switches between docked editor panels
and a world-only layout and can request browser fullscreen. Layout changes resize
the existing canvas through the existing ResizeObserver; they do not create a
second renderer or reload the world.

## Agency integration boundary

This release is a standalone visual adaptation, not a second-window integration.
The host integration should expose document/selection commands and simulation
state independently from the chrome. Agency can then own docking, floating panels
and window lifecycle. A detached viewport will need explicit state synchronization
and input ownership; do not create two independent physics simulations for the
same world. Fullscreen permissions must be granted by the host when embedded.
