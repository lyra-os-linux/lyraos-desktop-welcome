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
preview and disables both cards. Reopen Welcome to retry, or use Vega. In
particular, an unavailable profile backend no longer implies GNOME Vanilla.
These reads verify stored GNOME settings, not that GNOME Shell has finished
rendering the change; external changes after readback are not monitored.

Run the packaging contracts and picker scenarios with:

```sh
python3 -m unittest discover -s tests -v
node tests/test-pickers.mjs
```

The 75 UI scenarios cover both pickers in English, Portuguese and Spanish,
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
