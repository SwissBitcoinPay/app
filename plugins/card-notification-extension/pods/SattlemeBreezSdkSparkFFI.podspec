# The Breez Spark SDK's Rust core for Swift, 0.28.4 (the version of the app's React Native package),
# for the notification service extension only (plugins/card-notification-extension). Breez's own
# podspecs in breez/breez-sdk-spark-swift still name 0.11.0-dev2: this one pins the release that
# Package.swift names at the tag 0.28.4, with its checksum.
Pod::Spec.new do |s|
  s.name                  = "SattlemeBreezSdkSparkFFI"
  s.version               = "0.28.4"
  s.summary               = "Breez Spark SDK 0.28.4, Rust core (breez_sdk_sparkFFI.xcframework)"
  s.homepage              = "https://github.com/breez/breez-sdk-spark-swift"
  s.license               = { :type => "MIT" }
  s.authors               = { "Breez" => "contact@breez.technology" }
  s.source                = {
    :http => "https://github.com/breez/breez-sdk-spark-swift/releases/download/0.28.4/breez_sdk_sparkFFI.xcframework.zip",
    :sha256 => "6871e1d43040da1db818068910d164ba6b1ececca6f5c81e54e03fea2470b2ff"
  }
  s.ios.deployment_target = "13.0"
  s.vendored_frameworks   = "breez_sdk_sparkFFI.xcframework"
end
