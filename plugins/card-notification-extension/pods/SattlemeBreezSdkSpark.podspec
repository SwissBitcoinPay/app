# The Breez Spark SDK's Swift bindings, 0.28.4, for the notification service extension only
# (plugins/card-notification-extension): the two generated files at the tag 0.28.4 of
# breez/breez-sdk-spark-swift (its commit, pinned), without the passkey helpers the extension does
# not use. Imported as `BreezSdkSpark`, as Breez's own package.
Pod::Spec.new do |s|
  s.name                  = "SattlemeBreezSdkSpark"
  s.module_name           = "BreezSdkSpark"
  s.version               = "0.28.4"
  s.summary               = "Breez Spark SDK 0.28.4, Swift bindings"
  s.homepage              = "https://github.com/breez/breez-sdk-spark-swift"
  s.license               = { :type => "MIT" }
  s.authors               = { "Breez" => "contact@breez.technology" }
  s.source                = {
    :git => "https://github.com/breez/breez-sdk-spark-swift.git",
    :commit => "51716bec252dcab6eabd0303c0b2afbf41dd8f3f"
  }
  s.ios.deployment_target = "13.0"
  s.swift_version         = "5.0"
  s.source_files          = [
    "Sources/BreezSdkSpark/breez_sdk_spark.swift",
    "Sources/BreezSdkSpark/breez_sdk_spark_bindings.swift"
  ]
  s.dependency "SattlemeBreezSdkSparkFFI", "0.28.4"
  s.dependency "SattlemeBigNumber", "2.4.0"
end
