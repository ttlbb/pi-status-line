# pi-status-line

A Pi extension that shows turn progress and live output throughput (tokens per second) in the status line.

## Install

After publishing this repository, install it on any computer with Pi using:

```sh
pi install git:github.com/ttlbb/pi-status-line
```

To update the installed extension later, run:

```sh
pi update --extensions
```

The extension uses Pi's `ctx.ui.setStatus()` API and is declared in `package.json` under the `pi.extensions` manifest.
