# Why our overlay is a window, and Blitz's is not

Researched September 2026. Short version: Blitz injects code into the running
game. We are not going to do that, and we do not need to.

## What Blitz actually does

Direct3D has no supported way for one process to draw into another process's
frame. Every genuine in-game overlay therefore loads a DLL into the game and
hooks `IDXGISwapChain::Present` so it can draw just before the frame is handed
to the GPU. Blitz ships an overlay injector, tells users to match the Riot
client's privilege level, and tells them to turn off RivaTuner and MSI
Afterburner. Those three facts together are the signature of a Present hook:
RivaTuner hooks the same call and the two fight over it.

Overwolf documents this openly. Its changelog gates injection on the game
window being at least 400px tall, its debugging guide has you confirm "the
processes and dlls were injected correctly into the game", and it supports
DX11, DX12, OpenGL and Vulkan.

## Why we are not doing it

Riot's developer relations page on Vanguard says, verbatim:

> No - There is absolutely no allow list for Vanguard.

and

> External tools reading memory will no longer work, and you'll need to change
> methods.

but also

> Overlays and internal tools using the API, game client, and in-game APIs
> should continue to function.

So Riot blesses overlays that read the local APIs, which is exactly what we do.
It does not bless loading code into the game process, and there is no list we
could get onto. Injecting is the one change that turns this from a tolerated
companion app into the category Vanguard exists to stop.

Worth noting: nobody found a documented ban for an injected overlay. The risk
is real but unproven. It is still not worth a ban on Blake's account.

## Overwolf is the legitimate injected path, and it does not suit us

`ow-electron` exists so an Electron app can borrow Overwolf's injected overlay.
The blocker is policy, not code. A League app has to pass Riot's third-party
application review and Overwolf's store review, and Overwolf's own Riot
compliance page already requires that non-party summoner names be anonymised
to "Ally 1", "Ally 2" in ranked champ select. Naming a flagged player in ranked
draft is precisely what that rule forbids, so our core feature is the part most
likely to be rejected.

Even Overwolf cannot fully solve exclusive fullscreen. Its product guidelines
tell developers to read `exclusiveModeDisabled` and ask the user to switch to
borderless, because in true fullscreen there is no way to interact with an
overlay window.

## Why a plain window is usually enough

True exclusive fullscreen is mostly gone. Since Windows 10 1709, Fullscreen
Optimizations silently runs DX11 "fullscreen" games as a flip-model borderless
window, specifically so alt-tab and overlays keep working. On a normal Windows
11 machine an always-on-top window does composite over League.

Two things break it:

1. **Fullscreen Optimizations disabled for the League executable.** Right-click
   `League of Legends.exe`, Properties, Compatibility, and make sure "Disable
   fullscreen optimizations" is unchecked.
2. **Losing the topmost fight.** A fullscreen game re-asserts itself as the
   topmost window constantly, so a one-shot `setAlwaysOnTop` gets buried within
   a second. We now re-claim the top slot every second while the overlay is up.

## What we do instead

- **Champ select and the loading screen are the primary surface.** The League
  client is an ordinary window, so the overlay is reliable there, and that is
  also the only point where knowing about a flagged player changes what you do.
- **In game is best effort.** Corner-anchored, click-through, no input capture.
- **Always-on fallbacks:** toast notification, taskbar flash on Windows, dock
  bounce on macOS.

## Sources

- https://www.riotgames.com/en/DevRel/vanguard-faq
- https://developer.riotgames.com/docs/lol
- https://support.riotgames.com/en-us/riot/events/third-party-applications
- https://dev.overwolf.com/ow-native/guides/game-compliance/riot-games/
- https://dev.overwolf.com/ow-native/guides/product-guidelines/app-screen-behavior/exclusive-mode-overlay/
- https://dev.overwolf.com/ow-native/getting-started/changelog/ow-changelog/
- https://support.blitz.gg/hc/en-us/articles/900001178283-General-Overlay-Troubleshooting
- https://devblogs.microsoft.com/directx/demystifying-full-screen-optimizations/
- https://devblogs.microsoft.com/directx/dxgi-flip-model/
- https://fredemmott.com/blog/2022/05/31/in-game-overlays.html
