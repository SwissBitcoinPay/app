import ExpoModulesCore
import UIKit

/**
 A change of theme as a crossfade (src/features/appearance/crossfade.ts): `hold` lays a still of the
 app's window over it, `release` fades that still out once the new theme is drawn under it
 (Crossfade). On the main thread, where the window and its views live.
 */
public class ThemeCrossfadeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ThemeCrossfade")

    // True once the still covers the window; false when there is no window to hold: the theme then
    // changes at once. `fadeMs`: the theme's fade, that of a still never released.
    AsyncFunction("hold") { (fadeMs: Double) -> Bool in
      MainActor.assumeIsolated { Crossfade.hold(fadeMs: fadeMs) }
    }.runOnQueue(.main)

    // The new theme committed: the still fades out over `durationMs`, then goes.
    AsyncFunction("release") { (durationMs: Double) in
      MainActor.assumeIsolated { Crossfade.release(durationMs: durationMs) }
    }.runOnQueue(.main)
  }
}

/**
 The still of a theme's crossfade. `hold` snapshots the key window as it shows (its panels, which
 React Native presents in it, and a still already fading included) and lays the snapshot last in it,
 over everything, taking the touches meanwhile: they would reach what cannot be seen. `release`
 waits for the new theme's views to be mounted (framesBeforeFade), then fades the still out and
 removes it. Never left over the app: without its `release` (the JavaScript gone, a
 change that never committed), the still fades out on its own after holdLimit.
 */
@MainActor
private enum Crossfade {
  /** Fabric mounts a commit on the main queue: two frames on, the new views are drawn. */
  static let framesBeforeFade = 2

  /** The longest a still covers the window without its `release`, in seconds. */
  static let holdLimit: TimeInterval = 1.5

  /** The still over the window, if any. */
  static var still: UIView?

  /** Each hold and each release counts: the fallback of an older hold never applies. */
  static var generation = 0

  /** `fadeMs`: the theme's fade (motion.themeCrossfade), that of a still released by holdLimit. */
  static func hold(fadeMs: Double) -> Bool {
    guard let window = keyWindow(),
      let snapshot = window.snapshotView(afterScreenUpdates: false)
    else { return false }
    snapshot.frame = window.bounds
    // Takes the touches: what they would reach under it cannot be seen.
    snapshot.isUserInteractionEnabled = true
    snapshot.accessibilityElementsHidden = true
    window.addSubview(snapshot)
    // The still it replaces (a change during a fade) is in this snapshot, as it showed.
    if let former = still { remove(former) }
    still = snapshot
    generation += 1
    let held = generation
    Task { @MainActor in
      try? await Task.sleep(for: .seconds(Crossfade.holdLimit))
      if held == Crossfade.generation, Crossfade.still === snapshot {
        Crossfade.fadeOut(snapshot, durationMs: fadeMs)
      }
    }
    return true
  }

  static func release(durationMs: Double) {
    generation += 1
    guard let view = still else { return }
    FrameWait.start(frames: framesBeforeFade) {
      // Gone, or replaced by a newer hold, meanwhile.
      if Crossfade.still === view { Crossfade.fadeOut(view, durationMs: durationMs) }
    }
  }

  private static func fadeOut(_ view: UIView, durationMs: Double) {
    UIView.animate(
      withDuration: max(durationMs, 0) / 1000,
      delay: 0,
      options: [.curveEaseOut, .beginFromCurrentState],
      animations: { view.alpha = 0 },
      completion: { finished in
        MainActor.assumeIsolated {
          // Cut short by the system (the app sent to the background removes the layer's
          // animations): the still is out of sight (alpha 0) all the same, never kept in the
          // window. Cut short by another fade of it: that one removes it.
          if finished || view.layer.animationKeys()?.isEmpty != false { Crossfade.remove(view) }
        }
      }
    )
  }

  private static func remove(_ view: UIView) {
    view.layer.removeAllAnimations()
    view.removeFromSuperview()
    if still === view { still = nil }
  }

  /** The app's window the person sees: the key window of its scene in front. */
  private static func keyWindow() -> UIWindow? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
    return scene?.keyWindow
  }
}

/** Runs `action` once the screen has shown `frames` more frames (CADisplayLink). */
@MainActor
private final class FrameWait: NSObject {
  private var left: Int
  private let action: @MainActor () -> Void
  private var link: CADisplayLink?

  private init(frames: Int, action: @escaping @MainActor () -> Void) {
    self.left = frames
    self.action = action
    super.init()
  }

  static func start(frames: Int, action: @escaping @MainActor () -> Void) {
    let wait = FrameWait(frames: frames, action: action)
    // The display link holds its target until invalidated: the wait lives until it is done.
    let link = CADisplayLink(target: wait, selector: #selector(FrameWait.tick))
    wait.link = link
    link.add(to: .main, forMode: .common)
  }

  @objc private func tick() {
    left -= 1
    guard left <= 0 else { return }
    link?.invalidate()
    link = nil
    action()
  }
}
