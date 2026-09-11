# Lyra Welcome

Small Rust/Tauri welcome application shown once on the first graphical login
of each installed Lyra OS user. The interface follows the system language for
English, Brazilian Portuguese, and Spanish, with English as the fallback.

Theme and profile cards show the value read from the system. Each picker blocks
further choices during its initial read and its write/readback cycle; clicks made
while busy are ignored. A successful write is confirmed only when readback matches
the requested value. Failed writes also trigger readback, so a partial change is
shown accurately. Keyboard focus returns to the confirmed card unless the user
has already navigated elsewhere.

If the current value cannot be determined, the picker clears its selection and
preview and disables its cards. Reopen Welcome to retry, or use Vega. In
particular, an unavailable profile backend no longer implies GNOME Vanilla.
These reads verify stored GNOME settings, not that GNOME Shell has finished
rendering the change; external changes after readback are not monitored.

Run the packaging contracts and picker scenarios with:

```sh
python3 -m unittest discover -s tests -v
node tests/test-pickers.mjs
```

The 93 UI scenarios cover both pickers in English, Portuguese and Spanish,
including non-writable-key errors, unavailable reads, mismatched readback,
partial application, retries, rapid clicks/arrows and keyboard focus. CI runs
them against the shipped JavaScript and markup with a minimal DOM adapter.
The same scenarios can exercise the real HTML/CSS in WebKitGTK on a private
Mutter compositor and session bus:

```sh
python3 tests/native-pickers.py --output /tmp/welcome-picker-results
```

This optional native check requires Python GI, GTK3, WebKit2 4.1, Mutter and
dbus-run-session. Both harnesses simulate Tauri IPC and never modify the user's
settings. They validate UI behavior under backend failures, not a full installed
RPM, Tauri-to-gsettings integration, VM login, or screen-reader output.

The profile page offers **Lyra, GNOME Vanilla, Ubuntu, Windows 10 and Windows 11**
with illustrative layout previews and short descriptions in all three languages.
Arrow keys cycle through the five choices; Home and End select the endpoints.
The profile page scrolls at small heights while navigation stays visible.

Welcome 0.3.0 calls `vega-gtk --desktop-profile get/set`, introduced in Vega GTK
5.1.33. The RPM requires that version and Sheliak 1.15.0 or newer. Profile presets,
snapshots, extension toggles and restore logic remain owned by Vega; Welcome
never writes an independent set of profile settings. Theme selection still uses
GNOME's color-scheme setting. Reopening either client reads the stored selection.
If Vega is unavailable, too old, or rejects a change, Welcome retains the existing
readback/error behavior. GNOME and Windows favorites and tile sizes are preserved.

To verify layout in both schemes, three languages and at 1040×720 / 780×600:

```sh
python3 tests/native-pickers.py --layout --output /tmp/welcome-layout-results
```

The layout fixture records screenshots and checks card bounds, overlap, scrolling
and footer access. Profile command and private GNOME Shell integration tests live
in the Vega repository; UI fixtures here simulate only the Tauri IPC boundary.
